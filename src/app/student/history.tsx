import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import {
  CardButton,
  CardFooter,
  EmptyState,
  ListCard,
  LoadingBlock,
  PrimaryButton,
  Section,
  SubScreen,
  formatDateTime,
  statusTone
} from '../../components/dashboard';
import { getSession } from '../../lib/session';
import { confirmCancelExit } from '../../lib/cancelExit';
import { getExitRequests, getMyBusTrips, type MyBusTrip } from '../../services/movementApi';

export default function StudentHistoryScreen() {
  const [items, setItems] = useState<any[]>([]);
  const [busTrips, setBusTrips] = useState<MyBusTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const session = await getSession();
    if (!session) {
      router.replace('/');
      return;
    }
    const [res, busRes] = await Promise.all([
      getExitRequests(session.token),
      getMyBusTrips(session.token).catch(() => ({ success: false, trips: [] as MyBusTrip[], current: null }))
    ]);
    setItems(res.exits || []);
    setBusTrips(busRes.trips || []);
  }, []);

  const reportError = (error: unknown) =>
    Alert.alert('Unable to load history', error instanceof Error ? error.message : 'Please try again.');

  useFocusEffect(useCallback(() => {
    load().catch(reportError).finally(() => setLoading(false));
  }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load().catch(reportError);
    setRefreshing(false);
  };

  return (
    <SubScreen title="Exit history" subtitle="All your movement requests and their status" refreshing={refreshing} onRefresh={onRefresh}>
      {loading ? (
        <LoadingBlock />
      ) : items.length === 0 ? (
        <>
          <EmptyState icon="time-outline" title="No exit records yet" message="Requests you submit will be listed here with their approval status." />
          <PrimaryButton icon="add-circle-outline" label="Start a new exit request" onPress={() => router.push('/student/exit-request')} />
        </>
      ) : (
        <Section title="Requests" subtitle={`${items.length} total`}>
          {items.map((item) => {
            const tone = statusTone(item.status);
            return (
              <ListCard
                key={String(item.id)}
                onPress={() => router.push({ pathname: '/student/request/[id]', params: { id: item.id } })}
                icon={tone.icon}
                iconColor={tone.fg}
                iconBg={tone.bg}
                title={item.route || 'Movement request'}
                subtitle={`${item.id} · ${item.destination || 'Campus'} · ${formatDateTime(item.time)}`}
                status={item.status}
                note={
                  item.decisionNote
                    ? `${item.status === 'Rejected' ? 'Reason' : 'Staff note'}: ${item.decisionNote}`
                    : item.reason || undefined
                }
                footer={
                  item.canGenerateQR || item.canCancel ? (
                    <CardFooter>
                      {item.canGenerateQR ? (
                        <CardButton
                          icon="qr-code-outline"
                          label={item.nextQrAction === 'return' ? 'Show return QR' : 'Show exit QR'}
                          onPress={() => router.push({ pathname: '/student/qr', params: { exitId: item.id } })}
                        />
                      ) : null}
                      {item.canCancel ? (
                        <CardButton
                          icon="close-outline"
                          label="Cancel request"
                          variant="danger"
                          onPress={() => confirmCancelExit(item, () => { load().catch(reportError); })}
                        />
                      ) : null}
                    </CardFooter>
                  ) : undefined
                }
              />
            );
          })}
        </Section>
      )}
      {!loading && busTrips.length > 0 && (
        <Section title="Bus trips" subtitle={`${busTrips.length}`}>
          {busTrips.map((trip) => {
            const tone = statusTone(trip.status);
            return (
              <ListCard
                key={`bus-${trip.id}`}
                icon="bus-outline"
                iconColor={tone.fg}
                iconBg={tone.bg}
                title={`${trip.origin || '—'} → ${trip.destination || '—'}`}
                subtitle={`Bus ${trip.busNumber} · ${formatDateTime(trip.boardedAt || undefined)}`}
                status={trip.status === 'No Arrival' ? 'No arrival scan' : trip.status}
                note={
                  trip.status === 'Arrived'
                    ? `Got off ${formatDateTime(trip.arrivedAt || undefined)}`
                    : trip.status === 'Boarded'
                      ? 'On the bus: scan the arrival QR when you get off'
                      : trip.status === 'No Arrival'
                        ? 'You did not scan when getting off'
                        : trip.status === 'Removed'
                          ? 'Removed by the staff member on the bus'
                          : undefined
                }
              />
            );
          })}
        </Section>
      )}
    </SubScreen>
  );
}
