import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import {
  EmptyState,
  InfoNote,
  ListCard,
  LoadingBlock,
  PrimaryButton,
  Section,
  SubScreen,
  formatDateTime,
  statusTone
} from '../../../components/dashboard';
import { getSession } from '../../../lib/session';
import { getBusTrips, type BusTrip } from '../../../services/movementApi';

// Bus trips for staff with the Bus Boarding grant: open trips (anyone with the grant can
// continue one, for example at the destination) and today's finished trips.

const isOpen = (trip: BusTrip) => trip.status !== 'Completed';

const counts = (trip: BusTrip) =>
  trip.status === 'Boarding'
    ? `${trip.counts.boarded} on board`
    : `${trip.counts.boarded} boarded · ${trip.counts.arrived} got off`;

export default function BusTripsScreen() {
  const [trips, setTrips] = useState<BusTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const session = await getSession();
    if (!session) {
      router.replace('/');
      return;
    }
    const res = await getBusTrips(session.token);
    setTrips(res.trips || []);
  }, []);

  const reportError = (error: unknown) =>
    Alert.alert('Unable to load bus trips', error instanceof Error ? error.message : 'Please try again.');

  useFocusEffect(useCallback(() => {
    load().catch(reportError).finally(() => setLoading(false));
  }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load().catch(reportError);
    setRefreshing(false);
  };

  const open = trips.filter(isOpen);
  const done = trips.filter((trip) => !isOpen(trip));

  const card = (trip: BusTrip) => {
    const tone = statusTone(trip.status);
    return (
      <ListCard
        key={trip.id}
        onPress={() => router.push({ pathname: '/staff/bus/[id]', params: { id: String(trip.id) } })}
        icon="bus-outline"
        iconColor={tone.fg}
        iconBg={tone.bg}
        title={`${trip.origin || '—'} → ${trip.destination || '—'}`}
        subtitle={`Bus ${trip.busNumber}${trip.plateNumber ? ` · ${trip.plateNumber}` : ''} · ${formatDateTime(trip.departureTime || trip.createdAt)}`}
        status={trip.status}
        note={`${counts(trip)}${trip.startedByName ? ` · started by ${trip.startedByName}` : ''}`}
      />
    );
  };

  return (
    <SubScreen title="Bus trips" subtitle="Start a trip and let students scan on and off" refreshing={refreshing} onRefresh={onRefresh}>
      <PrimaryButton icon="add-circle-outline" label="Start bus trip" onPress={() => router.push('/staff/bus/new')} />

      {loading ? (
        <LoadingBlock />
      ) : (
        <>
          <Section title="Open trips" subtitle={open.length ? `${open.length}` : undefined}>
            {open.length === 0 ? (
              <EmptyState icon="bus-outline" title="No open trips" message="Start a trip when a bus is about to board." />
            ) : (
              open.map(card)
            )}
          </Section>

          {done.length > 0 && <Section title="Finished today">{done.map(card)}</Section>}

          <InfoNote icon="information-circle-outline">
            At the destination, any staff member with Bus Boarding can open an open trip and show its arrival QR.
          </InfoNote>
        </>
      )}
    </SubScreen>
  );
}
