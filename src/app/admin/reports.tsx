import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { EmptyState, ListCard, LoadingBlock, Section, StatRow, SubScreen, statusTone } from '../../components/dashboard';
import { getSession } from '../../lib/session';
import { getBusList, getReports } from '../../services/movementApi';
import { theme } from '../../theme';

export default function AdminReportsScreen() {
  const [reports, setReports] = useState<any>({});
  const [buses, setBuses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const session = await getSession();
    if (!session) {
      router.replace('/');
      return;
    }
    const [reportRes, busRes] = await Promise.all([getReports(session.token), getBusList(session.token)]);
    setReports(reportRes.reports || {});
    setBuses(busRes.buses || []);
  }, []);

  const reportError = (error: unknown) =>
    Alert.alert('Unable to load reports', error instanceof Error ? error.message : 'Please try again.');

  useFocusEffect(useCallback(() => {
    load().catch(reportError).finally(() => setLoading(false));
  }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load().catch(reportError);
    setRefreshing(false);
  };

  const totalExits = Number(reports.totalExits ?? 0);
  const totalReturns = Number(reports.totalReturns ?? 0);
  const returnRate = totalExits > 0 ? `${Math.round((totalReturns / totalExits) * 100)}%` : '—';

  return (
    <SubScreen title="Movement reports" subtitle="Institution-wide exit and transport summary" refreshing={refreshing} onRefresh={onRefresh}>
      {loading ? (
        <LoadingBlock />
      ) : (
        <>
          <Section title="Exit activity">
            <StatRow
              items={[
                { icon: 'document-text-outline', label: 'Total exits', value: totalExits, color: theme.colors.navy },
                { icon: 'hourglass-outline', label: 'Pending', value: reports.pendingApprovals ?? 0, color: theme.colors.amber }
              ]}
            />
            <StatRow
              items={[
                { icon: 'return-down-back-outline', label: 'Returns', value: totalReturns, color: theme.colors.emerald },
                { icon: 'analytics-outline', label: 'Return rate', value: returnRate, color: theme.colors.navySoft }
              ]}
            />
          </Section>

          <Section title="Active fleet" subtitle={`${reports.routesTracked ?? 0} route${Number(reports.routesTracked) === 1 ? '' : 's'} tracked`}>
            {buses.length === 0 ? (
              <EmptyState icon="bus-outline" title="No bus journeys" message="Fleet activity will appear here once journeys are recorded." />
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
                    subtitle={`${bus.id} · Occupancy ${bus.occupancy}`}
                    status={bus.status}
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
