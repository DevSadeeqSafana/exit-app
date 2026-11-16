import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import {
  Card,
  EmptyState,
  InfoNote,
  LoadingBlock,
  PrimaryButton,
  Section,
  StatRow,
  StatusBadge,
  SubScreen,
  formatDateTime
} from '../../../components/dashboard';
import { formatClock } from '../../../components/exitBanners';
import { getSession } from '../../../lib/session';
import {
  ApiError,
  changeBusTrip,
  getBusCode,
  getBusTrip,
  removeBusPassenger,
  type BusCode,
  type BusPassenger,
  type BusTrip
} from '../../../services/movementApi';
import { theme } from '../../../theme';

// The live trip screen (features plan, Phase 4c):
//   Boarding    boarding QR (changes every 10 s) + students who scanned; Depart closes boarding
//   In Transit  "Show arrival QR" at the destination
//   Arrived     arrival QR + Got off / Not yet scanned; End trip
//   Completed   summary
// Names only, no photos (B7). "Not on bus" removes someone who scanned without boarding.

const c = theme.colors;
const LIST_REFRESH_MS = 5000;

export default function BusTripScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tripId = String(id || '');
  const [trip, setTrip] = useState<BusTrip | null>(null);
  const [passengers, setPassengers] = useState<BusPassenger[]>([]);
  const [code, setCode] = useState<BusCode | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [focused, setFocused] = useState(false);
  const codeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const token = async () => {
    const session = await getSession();
    if (!session) {
      router.replace('/');
      return null;
    }
    return session.token;
  };

  const loadTrip = useCallback(async () => {
    const t = await token();
    if (!t) return;
    const res = await getBusTrip(t, tripId);
    setTrip(res.trip);
    setPassengers(res.passengers || []);
  }, [tripId]);

  // The phase whose QR is on screen, from the trip's status.
  const phase: 'boarding' | 'arrival' | null =
    trip?.status === 'Boarding' ? 'boarding' : trip?.status === 'Arrived' ? 'arrival' : null;

  // Keep the trip and list fresh while the screen is open.
  useFocusEffect(useCallback(() => {
    setFocused(true);
    loadTrip()
      .catch((error) => Alert.alert('Unable to load the trip', error instanceof Error ? error.message : 'Please try again.'))
      .finally(() => setLoading(false));
    const timer = setInterval(() => { loadTrip().catch(() => {}); }, LIST_REFRESH_MS);
    return () => {
      clearInterval(timer);
      setFocused(false);
    };
  }, [loadTrip]));

  // Fetch the QR for the current phase, then again just as it changes.
  useEffect(() => {
    if (codeTimer.current) clearTimeout(codeTimer.current);
    if (!focused || !phase) return undefined;
    let cancelled = false;
    const fetchCode = async () => {
      try {
        const t = await token();
        if (!t || cancelled) return;
        const res = await getBusCode(t, tripId, phase);
        if (cancelled) return;
        setCode(res);
        setCodeError(null);
        codeTimer.current = setTimeout(fetchCode, Math.max(1, res.refreshInSeconds) * 1000 + 150);
      } catch (error) {
        if (cancelled) return;
        setCodeError(error instanceof Error ? error.message : 'The QR code could not be loaded.');
        // The trip may have moved on (another staff member departed or ended it).
        if (error instanceof ApiError && error.status === 409) loadTrip().catch(() => {});
        else codeTimer.current = setTimeout(fetchCode, 3000);
      }
    };
    fetchCode();
    return () => {
      cancelled = true;
      if (codeTimer.current) clearTimeout(codeTimer.current);
    };
  }, [focused, phase, tripId, loadTrip]);

  const run = async (work: (t: string) => Promise<{ trip: BusTrip; passengers: BusPassenger[] }>) => {
    const t = await token();
    if (!t) return;
    setBusy(true);
    try {
      const res = await work(t);
      setTrip(res.trip);
      setPassengers(res.passengers || []);
    } catch (error) {
      Alert.alert('Not done', error instanceof Error ? error.message : 'Please try again.');
      loadTrip().catch(() => {});
    } finally {
      setBusy(false);
    }
  };

  const boardedList = passengers.filter((p) => p.status === 'Boarded' || p.status === 'Arrived' || p.status === 'No Arrival');
  const gotOff = passengers.filter((p) => p.status === 'Arrived');
  const notYet = passengers.filter((p) => p.status === 'Boarded');
  const removed = passengers.filter((p) => p.status === 'Removed');

  const depart = () =>
    Alert.alert('Depart now?', `Boarding closes. ${boardedList.length} student${boardedList.length === 1 ? '' : 's'} on board.`, [
      { text: 'Not yet', style: 'cancel' },
      { text: 'Depart', onPress: () => run((t) => changeBusTrip(t, tripId, 'depart')) }
    ]);

  const showArrival = async () => {
    const t = await token();
    if (!t) return;
    setBusy(true);
    try {
      await getBusCode(t, tripId, 'arrival'); // moves the trip to Arrived
      await loadTrip();
    } catch (error) {
      Alert.alert('Not done', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const endTrip = () =>
    Alert.alert(
      'End this trip?',
      notYet.length
        ? `${notYet.length} student${notYet.length === 1 ? ' has' : 's have'} not scanned on getting off. They will be recorded as "No arrival scan".`
        : 'Everyone who boarded has scanned off.',
      [
        { text: 'Keep it open', style: 'cancel' },
        { text: 'End trip', style: notYet.length ? 'destructive' : 'default', onPress: () => run((t) => changeBusTrip(t, tripId, 'end')) }
      ]
    );

  const removePassenger = (p: BusPassenger) =>
    Alert.alert('Not on this bus?', `${p.name} (${p.studentId}) will be removed from the trip. This is recorded with your name.`, [
      { text: 'Keep', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => run((t) => removeBusPassenger(t, tripId, p.studentId)) }
    ]);

  if (loading) {
    return (
      <SubScreen title="Bus trip">
        <LoadingBlock />
      </SubScreen>
    );
  }
  if (!trip) {
    return (
      <SubScreen title="Bus trip">
        <EmptyState icon="bus-outline" title="Trip not found" message="Go back and open the trip again." />
      </SubScreen>
    );
  }

  const full = trip.capacity !== null && boardedList.length >= trip.capacity;
  // A code fetched for the other phase (e.g. boarding, just after Depart) is never shown.
  const shownCode = phase && code?.phase === phase ? code : null;

  return (
    <SubScreen title={`${trip.origin} → ${trip.destination}`} subtitle={`Bus ${trip.busNumber}${trip.plateNumber ? ` · ${trip.plateNumber}` : ''} · ${trip.driver || ''}`}>
      <Card>
        <View style={styles.headRow}>
          <Text style={styles.headLabel}>{trip.reference}</Text>
          <StatusBadge status={trip.status} />
        </View>
        <Text style={styles.headMeta}>
          Departure {formatClock(trip.departureTime)}
          {trip.startedByName ? ` · started by ${trip.startedByName}` : ''}
        </Text>
      </Card>

      {phase ? (
        <Card centered>
          <Text style={styles.qrTitle}>{phase === 'boarding' ? 'Boarding QR' : 'Arrival QR'}</Text>
          <Text style={styles.qrHelp}>
            {phase === 'boarding'
              ? 'Students tap "Scan bus QR" and scan this as they board.'
              : 'Students scan this as they get off the bus.'}
          </Text>
          <View style={styles.qrBox}>
            {shownCode ? (
              <QRCode value={shownCode.qrValue} size={240} color={phase === 'boarding' ? c.navy : c.emerald} backgroundColor="#ffffff" />
            ) : (
              <Text style={styles.qrWaiting}>{codeError || 'Loading code…'}</Text>
            )}
          </View>
          <Text style={styles.qrNote}>The code changes every 10 seconds. A photo of it stops working almost at once.</Text>
        </Card>
      ) : null}

      {phase ? <StayAwake /> : null}

      <StatRow
        items={[
          { icon: 'people-outline', label: 'Boarded', value: trip.capacity ? `${boardedList.length}/${trip.capacity}` : boardedList.length, color: full ? c.danger : c.navySoft },
          { icon: 'flag-outline', label: 'Got off', value: gotOff.length, color: c.emerald },
          { icon: 'hourglass-outline', label: trip.status === 'Completed' ? 'No arrival scan' : 'Not yet off', value: trip.status === 'Completed' ? trip.counts.noArrival : notYet.length, color: c.amber }
        ]}
      />
      {full && trip.status === 'Boarding' ? (
        <InfoNote icon="warning-outline">The bus is at its capacity of {trip.capacity}. Check before more students board.</InfoNote>
      ) : null}

      {trip.status === 'Boarding' && (
        <PrimaryButton icon="navigate-outline" label="Depart (close boarding)" variant="navy" onPress={depart} loading={busy} />
      )}
      {trip.status === 'In Transit' && (
        <>
          <InfoNote icon="bus-outline">The bus is on its way. At {trip.destination}, show the arrival QR so students scan as they get off.</InfoNote>
          <PrimaryButton icon="qr-code-outline" label="Show arrival QR" onPress={showArrival} loading={busy} />
        </>
      )}
      {(trip.status === 'Arrived' || trip.status === 'In Transit') && (
        <PrimaryButton icon="stop-circle-outline" label="End trip" variant="ghost" onPress={endTrip} loading={busy} />
      )}

      {trip.status === 'Boarding' || trip.status === 'In Transit' ? (
        <Section title="On board" subtitle={`${boardedList.length} scanned`}>
          <PassengerList passengers={boardedList} onRemove={trip.status === 'Boarding' ? removePassenger : undefined} empty="No one has scanned yet." time="boarded" />
        </Section>
      ) : (
        <>
          <Section title={trip.status === 'Completed' ? 'No arrival scan' : 'Not yet scanned off'} subtitle={`${trip.status === 'Completed' ? trip.counts.noArrival : notYet.length}`}>
            <PassengerList
              passengers={trip.status === 'Completed' ? passengers.filter((p) => p.status === 'No Arrival') : notYet}
              onRemove={trip.status === 'Arrived' ? removePassenger : undefined}
              empty={trip.status === 'Completed' ? 'Everyone scanned off.' : 'Everyone has scanned off.'}
              time="boarded"
            />
          </Section>
          <Section title="Got off" subtitle={`${gotOff.length}`}>
            <PassengerList passengers={gotOff} empty="No one has scanned off yet." time="arrived" />
          </Section>
        </>
      )}

      {removed.length > 0 && (
        <Section title="Removed (not on bus)" subtitle={`${removed.length}`}>
          <PassengerList passengers={removed} empty="" time="removed" />
        </Section>
      )}

      {trip.status === 'Completed' && (
        <InfoNote icon="checkmark-done-outline">
          Trip ended {formatDateTime(trip.endedAt || undefined)}. It is in the Staff Portal under Student Movement › Bus Trips.
        </InfoNote>
      )}
    </SubScreen>
  );
}

// Mounted only while a QR is on screen, so the phone does not lock while students scan.
function StayAwake() {
  useKeepAwake('bus-qr');
  return null;
}

function PassengerList({
  passengers,
  onRemove,
  empty,
  time
}: {
  passengers: BusPassenger[];
  onRemove?: (p: BusPassenger) => void;
  empty: string;
  time: 'boarded' | 'arrived' | 'removed';
}) {
  if (passengers.length === 0) return empty ? <Text style={styles.empty}>{empty}</Text> : null;
  return (
    <Card>
      {passengers.map((p, index) => (
        <View key={p.studentId} style={[styles.passenger, index < passengers.length - 1 && styles.passengerDivider]}>
          <View style={styles.passengerText}>
            <Text style={styles.passengerName} numberOfLines={1}>{p.name}</Text>
            <Text style={styles.passengerMeta}>
              {p.studentId} ·{' '}
              {time === 'arrived'
                ? `off ${formatClock(p.arrivedAt)}`
                : time === 'removed'
                  ? `removed ${formatClock(p.removedAt)}${p.removedByName ? ` by ${p.removedByName}` : ''}`
                  : `on ${formatClock(p.boardedAt)}`}
            </Text>
          </View>
          {onRemove ? (
            <Pressable
              onPress={() => onRemove(p)}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${p.name}, not on bus`}
              hitSlop={6}
              style={({ pressed }) => [styles.remove, pressed && { opacity: 0.7 }]}
            >
              <Ionicons name="close-circle-outline" size={16} color={c.danger} />
              <Text style={styles.removeText}>Not on bus</Text>
            </Pressable>
          ) : null}
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headLabel: { color: c.text, fontSize: 15, fontWeight: '800' },
  headMeta: { color: c.muted, fontSize: 13, marginTop: 6 },
  qrTitle: { color: c.text, fontSize: 18, fontWeight: '800' },
  qrHelp: { color: c.muted, fontSize: 13, textAlign: 'center', marginTop: 4 },
  qrBox: { width: 264, height: 264, alignItems: 'center', justifyContent: 'center', marginTop: 14, backgroundColor: '#fff', borderRadius: 16 },
  qrWaiting: { color: c.muted, fontSize: 13, textAlign: 'center', paddingHorizontal: 20 },
  qrNote: { color: c.muted, fontSize: 12, textAlign: 'center', marginTop: 10 },
  empty: { color: c.muted, fontSize: 13, paddingVertical: 6 },
  passenger: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  passengerDivider: { borderBottomWidth: 1, borderBottomColor: c.border },
  passengerText: { flex: 1, minWidth: 0 },
  passengerName: { color: c.text, fontSize: 14, fontWeight: '700' },
  passengerMeta: { color: c.muted, fontSize: 12, marginTop: 2 },
  remove: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: '#fbe9e7' },
  removeText: { color: c.danger, fontSize: 12, fontWeight: '700' }
});
