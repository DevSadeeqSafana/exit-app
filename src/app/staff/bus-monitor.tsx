import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { EmptyState, ListCard, LoadingBlock, Section, StatRow, SubScreen, statusTone } from '../../components/dashboard';
import { getSession } from '../../lib/session';
import { getBusList } from '../../services/movementApi';
import { theme } from '../../theme';

const isStatus = (bus: any, status: string) => String(bus?.status || '').toLowerCase() === status;

export default function BusMonitorScreen() {
  const [buses, setBuses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const session = await getSession();
    if (!session) {
      router.replace('/');
      return;
    }
    const res = await getBusList(session.token);
    setBuses(res.buses || []);
  }, []);

  const reportError = (error: unknown) =>
    Alert.alert('Unable to load buses', error instanceof Error ? error.message : 'Please try again.');

  useFocusEffect(useCallback(() => {
    load().catch(reportError).finally(() => setLoading(false));
  }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load().catch(reportError);
    setRefreshing(false);
  };

  const inTransit = buses.filter((bus) => isStatus(bus, 'in transit') || isStatus(bus, 'boarding')).length;
  const scheduled = buses.filter((bus) => isStatus(bus, 'scheduled')).length;
  const completed = buses.filter((bus) => isStatus(bus, 'completed') || isStatus(bus, 'arrived')).length;

  return (
    <SubScreen title="Bus monitor" subtitle="Live view of campus shuttle journeys" refreshing={refreshing} onRefresh={onRefresh}>
      {loading ? (
        <LoadingBlock />
      ) : (
        <>
          <StatRow
            items={[
              { icon: 'navigate-outline', label: 'On the move', value: inTransit, color: theme.colors.navySoft },
              { icon: 'calendar-outline', label: 'Scheduled', value: scheduled, color: theme.colors.amber },
              { icon: 'flag-outline', label: 'Completed', value: completed, color: theme.colors.emerald }
            ]}
          />

          <Section title="Journeys" subtitle={buses.length ? `${buses.length} total` : undefined}>
            {buses.length === 0 ? (
              <EmptyState icon="bus-outline" title="No bus journeys" message="Bus journeys will appear here once they are scheduled. Pull down to refresh." />
            ) : (
              buses.map((bus) => {
                const tone = statusTone(bus.status);
                return (
                  <ListCard
                    key={String(bus.id)}
                    icon="bus-outline"
                    iconColor={tone.fg}
                    iconBg={tone.bg}
                    title={bus.route || String(bus.id)}
                    subtitle={`${bus.id} · ${bus.station || 'Campus'}`}
                    status={bus.status}
                    note={`Driver: ${bus.driver || 'Unassigned'}  ·  Occupancy: ${bus.occupancy}`}
                  />
                );
              })
            )}
          </Section>
        </>
      )}
    </SubScreen>
  );
}
