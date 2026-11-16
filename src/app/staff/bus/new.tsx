import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import {
  Card,
  ChipGroup,
  EmptyState,
  FormField,
  InfoNote,
  LoadingBlock,
  PrimaryButton,
  Section,
  SubScreen
} from '../../../components/dashboard';
import { getSession } from '../../../lib/session';
import { getBusStations, startBusTrip } from '../../../services/movementApi';
import { theme } from '../../../theme';

// Start a bus trip: From, To and the bus details. The trip opens in Boarding and the
// next screen shows the boarding QR.

const DEPARTURES = ['Now', 'In 15 min', 'In 30 min', 'In 1 hour'];
const DEPARTURE_MINUTES: Record<string, number> = { Now: 0, 'In 15 min': 15, 'In 30 min': 30, 'In 1 hour': 60 };

export default function NewBusTripScreen() {
  const [stations, setStations] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [busNumber, setBusNumber] = useState('');
  const [plateNumber, setPlateNumber] = useState('');
  const [driver, setDriver] = useState('');
  const [capacity, setCapacity] = useState('');
  const [departure, setDeparture] = useState('Now');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const session = await getSession();
    if (!session) {
      router.replace('/');
      return;
    }
    const res = await getBusStations(session.token);
    const list = res.stations || [];
    setStations(list);
    // Default From: the staff member's assigned station when it is a bus station.
    setOrigin((current) => current || (res.defaultOrigin && list.includes(res.defaultOrigin) ? res.defaultOrigin : ''));
  }, []);

  useFocusEffect(useCallback(() => {
    load()
      .catch((error) => Alert.alert('Unable to load stations', error instanceof Error ? error.message : 'Please try again.'))
      .finally(() => setLoading(false));
  }, [load]));

  const problem = (() => {
    if (!origin) return 'Choose where the bus is leaving from.';
    if (!destination) return 'Choose where the bus is going.';
    if (origin === destination) return 'From and To must be different.';
    if (!busNumber.trim()) return 'Enter the bus number.';
    if (!plateNumber.trim()) return 'Enter the plate number.';
    if (!driver.trim()) return "Enter the driver's name.";
    if (capacity.trim() && !/^\d{1,3}$/.test(capacity.trim())) return 'Capacity must be a number, or leave it empty.';
    return null;
  })();

  const submit = async () => {
    if (problem) {
      Alert.alert('Check the trip', problem);
      return;
    }
    const session = await getSession();
    if (!session) return;
    setSaving(true);
    try {
      const departureTime = new Date(Date.now() + DEPARTURE_MINUTES[departure] * 60000).toISOString();
      const res = await startBusTrip(session.token, {
        origin,
        destination,
        busNumber: busNumber.trim(),
        plateNumber: plateNumber.trim(),
        driver: driver.trim(),
        departureTime,
        capacity: capacity.trim() ? Number(capacity.trim()) : null
      });
      router.replace({ pathname: '/staff/bus/[id]', params: { id: String(res.trip.id) } });
    } catch (error) {
      Alert.alert('Trip not started', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SubScreen title="Start bus trip" subtitle="Students scan your QR when they board">
      {loading ? (
        <LoadingBlock />
      ) : stations.length < 2 ? (
        <EmptyState
          icon="location-outline"
          title="Not enough stations"
          message="A trip needs at least two bus stations. They are added in the Staff Portal: Student Movement › Settings › Bus stations."
        />
      ) : (
        <>
          <Section title="From">
            <ChipGroup options={stations} value={origin} onChange={setOrigin} />
          </Section>
          <Section title="To">
            <ChipGroup options={stations.filter((s) => s !== origin)} value={destination} onChange={setDestination} />
          </Section>

          <Section title="Bus">
            <Card>
              <View style={styles.form}>
                <FormField label="Bus number" value={busNumber} onChangeText={setBusNumber} placeholder="e.g. Bus 3" maxLength={50} />
                <FormField label="Plate number" value={plateNumber} onChangeText={(v) => setPlateNumber(v.toUpperCase())} placeholder="e.g. ABC 123 XY" autoCapitalize="characters" maxLength={20} />
                <FormField label="Driver" value={driver} onChangeText={setDriver} placeholder="Driver's name" maxLength={120} />
                <FormField
                  label="Capacity (optional)"
                  value={capacity}
                  onChangeText={(v) => setCapacity(v.replace(/[^\d]/g, ''))}
                  placeholder="Seats"
                  keyboardType="number-pad"
                  maxLength={3}
                  hint="You get a warning when the bus is full. Leave empty to skip."
                />
              </View>
            </Card>
          </Section>

          <Section title="Departure">
            <ChipGroup options={DEPARTURES} value={departure} onChange={setDeparture} />
          </Section>

          {origin && destination ? (
            <InfoNote icon="bus-outline">
              {`${origin} → ${destination}. `}Boarding opens as soon as you start. Tap Depart when the bus leaves.
            </InfoNote>
          ) : null}

          <PrimaryButton icon="play-circle-outline" label="Start trip and show QR" onPress={submit} loading={saving} />
          {problem ? <Text style={styles.hint}>{problem}</Text> : null}
        </>
      )}
    </SubScreen>
  );
}

const styles = StyleSheet.create({
  form: { gap: 14 },
  hint: { color: theme.colors.muted, fontSize: 12, textAlign: 'center' }
});
