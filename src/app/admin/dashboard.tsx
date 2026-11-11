import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Alert } from 'react-native';
import {
  ActionListItem,
  DashboardHeader,
  DashboardScreen,
  EmptyState,
  ListCard,
  Section,
  StatRow,
  StatusBreakdown,
  formatDateTime,
  statusTone
} from '../../components/dashboard';
import { clearSession, getSession } from '../../lib/session';
import { getBusList, getDashboard, getExitRequests } from '../../services/movementApi';
import { theme } from '../../theme';

const STATUSES = ['Pending', 'Approved', 'Verified', 'Returned', 'Rejected'];

export default function AdminDashboard() {
  const [name, setName] = useState('Administrator');
  const [preview, setPreview] = useState(false);
  const [stats, setStats] = useState({ outstandingExits: 0, approvedToday: 0, activeBuses: 0, totalExits: 0 });
  const [exits, setExits] = useState<any[]>([]);
  const [buses, setBuses] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const active = useRef(true);

  const load = useCallback(async () => {
    const session = await getSession();
    if (!session) {
      router.replace('/');
      return;
    }
    if (!active.current) return;
    setName(session.user?.name || 'Administrator');
    setPreview(Boolean(session.preview));
    const [dash, exitRes, busRes] = await Promise.all([
      getDashboard(session.token),
      getExitRequests(session.token),
      getBusList(session.token)
    ]);
    if (!active.current) return;
    if (dash.dashboard?.summary) setStats((prev) => ({ ...prev, ...dash.dashboard.summary }));
    setExits(exitRes.exits || []);
    setBuses(busRes.buses || []);
  }, []);

  const reportError = (error: unknown) =>
    Alert.alert('Unable to load dashboard', error instanceof Error ? error.message : 'Please try again.');

  useFocusEffect(useCallback(() => {
    active.current = true;
    load().catch(reportError);
    return () => { active.current = false; };
  }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load().catch(reportError);
    setRefreshing(false);
  };

  const handleSignOut = async () => {
    await clearSession();
    router.replace('/');
  };

  const counts = Object.fromEntries(
    STATUSES.map((status) => [status, exits.filter((item) => String(item.status || '').toLowerCase() === status.toLowerCase()).length])
  );

  return (
    <DashboardScreen
      refreshing={refreshing}
      onRefresh={onRefresh}
      header={
        <DashboardHeader
          eyebrow="Central administration"
          name={name}
          preview={preview}
          onSignOut={handleSignOut}
          highlight={{
            icon: 'shield-checkmark-outline',
            label: 'Movement control room',
            value: stats.outstandingExits ? `${stats.outstandingExits} exit${stats.outstandingExits === 1 ? '' : 's'} outstanding` : 'No outstanding exits',
            caption: 'Institution-wide monitoring of student movement and transport.'
          }}
        />
      }
    >
      <Section title="Key metrics">
        <StatRow
          items={[
            { icon: 'hourglass-outline', label: 'Outstanding', value: stats.outstandingExits ?? 0, color: theme.colors.amber },
            { icon: 'checkmark-done-outline', label: 'Approved today', value: stats.approvedToday ?? 0, color: theme.colors.emerald },
            { icon: 'bus-outline', label: 'Active buses', value: stats.activeBuses ?? 0, color: theme.colors.navySoft }
          ]}
        />
      </Section>

      <ActionListItem
        icon="bar-chart-outline"
        title="Movement reports"
        caption="Exits, returns, pending approvals and routes tracked"
        onPress={() => router.push('/admin/reports')}
      />

      <Section title="Exit status mix" subtitle={exits.length ? `${exits.length} recent` : undefined}>
        {exits.length === 0 ? (
          <EmptyState icon="document-text-outline" title="No exit requests yet" message="Status distribution appears once students start submitting requests." />
        ) : (
          <StatusBreakdown counts={counts} />
        )}
      </Section>

      {exits.length > 0 && (
        <Section title="Latest requests">
          {exits.slice(0, 5).map((item) => {
            const tone = statusTone(item.status);
            return (
              <ListCard
                key={String(item.id)}
                icon={tone.icon}
                iconColor={tone.fg}
                iconBg={tone.bg}
                title={item.student || 'Student'}
                subtitle={`${item.route || 'Route'} · ${formatDateTime(item.time)}`}
                status={item.status}
              />
            );
          })}
        </Section>
      )}

      <Section title="Transport" subtitle={buses.length ? `${buses.length} journey${buses.length === 1 ? '' : 's'}` : undefined}>
        {buses.length === 0 ? (
          <EmptyState icon="bus-outline" title="No bus journeys" message="Bus journeys and occupancy will appear here once recorded." />
        ) : (
          buses.slice(0, 5).map((bus) => (
            <ListCard
              key={String(bus.id)}
              icon="bus-outline"
              iconColor={theme.colors.navySoft}
              iconBg={theme.colors.blueSoft}
              title={bus.route || String(bus.id)}
              subtitle={`${bus.id} · ${bus.occupancy}`}
              status={bus.status}
            />
          ))
        )}
      </Section>
    </DashboardScreen>
  );
}
