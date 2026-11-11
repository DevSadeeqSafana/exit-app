import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Alert } from 'react-native';
import {
  ActionRow,
  ActionTile,
  CardButton,
  CardFooter,
  DashboardHeader,
  DashboardScreen,
  EmptyState,
  ListCard,
  Section,
  StatRow,
  formatDateTime,
  statusTone
} from '../../components/dashboard';
import { clearSession, getSession } from '../../lib/session';
import { getDashboard, getExitRequests } from '../../services/movementApi';
import { theme } from '../../theme';

export default function StudentDashboard() {
  const [name, setName] = useState('Student');
  const [preview, setPreview] = useState(false);
  const [stats, setStats] = useState({ approvedExits: 0, pendingReviews: 0, busScans: 0, currentLocation: 'Unknown' });
  const [exits, setExits] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const active = useRef(true);

  const load = useCallback(async () => {
    const session = await getSession();
    if (!session) {
      router.replace('/');
      return;
    }
    if (!active.current) return;
    setName(session.user?.name || 'Student');
    setPreview(Boolean(session.preview));
    const [dashboardRes, exitsRes] = await Promise.all([getDashboard(session.token), getExitRequests(session.token)]);
    if (!active.current) return;
    if (dashboardRes.dashboard?.summary) setStats((prev) => ({ ...prev, ...dashboardRes.dashboard.summary }));
    setExits(exitsRes.exits || []);
  }, []);

  const reportError = (error: unknown) =>
    Alert.alert('Unable to load movement', error instanceof Error ? error.message : 'Please try again.');

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

  const latest = exits[0];

  return (
    <DashboardScreen
      refreshing={refreshing}
      onRefresh={onRefresh}
      header={
        <DashboardHeader
          eyebrow="Student portal"
          name={name}
          preview={preview}
          onSignOut={handleSignOut}
          highlight={
            latest
              ? { icon: statusTone(latest.status).icon, label: 'Latest exit request', value: `${latest.status} · ${latest.route}`, caption: formatDateTime(latest.time) }
              : { icon: 'location-outline', label: 'Current location', value: stats.currentLocation || 'Unknown', caption: 'No exit requests yet. Start one when you need to leave campus.' }
          }
        />
      }
    >
      <ActionRow>
        <ActionTile primary icon="add-circle-outline" label="New exit" onPress={() => router.push('/student/exit-request')} />
        <ActionTile icon="scan-outline" label="Gate check-in" onPress={() => router.push('/student/scan')} />
        <ActionTile icon="time-outline" label="History" onPress={() => router.push('/student/history')} />
      </ActionRow>

      <Section title="Overview">
        <StatRow
          items={[
            { icon: 'checkmark-done-outline', label: 'Approved exits', value: stats.approvedExits ?? 0, color: theme.colors.emerald },
            { icon: 'hourglass-outline', label: 'Pending review', value: stats.pendingReviews ?? 0, color: theme.colors.amber },
            { icon: 'bus-outline', label: 'Bus scans', value: stats.busScans ?? 0, color: theme.colors.navySoft }
          ]}
        />
      </Section>

      <Section title="Recent movement" subtitle={exits.length ? `${exits.length} request${exits.length === 1 ? '' : 's'}` : undefined}>
        {exits.length === 0 ? (
          <EmptyState icon="walk-outline" title="No movement yet" message="Your exit requests and their approval status will appear here." />
        ) : (
          exits.slice(0, 5).map((item) => {
            const tone = statusTone(item.status);
            return (
              <ListCard
                key={item.id}
                icon={tone.icon}
                iconColor={tone.fg}
                iconBg={tone.bg}
                title={item.route || 'Exit request'}
                subtitle={`${item.destination || 'Campus'} · ${formatDateTime(item.time)}`}
                status={item.status}
                note={item.reason}
                footer={
                  item.canGenerateQR ? (
                    <CardFooter>
                      <CardButton
                        icon="scan-outline"
                        label={item.nextQrAction === 'return' ? 'Scan to check in' : 'Scan to check out'}
                        onPress={() => router.push({ pathname: '/student/scan', params: { exitId: item.id } })}
                      />
                    </CardFooter>
                  ) : undefined
                }
              />
            );
          })
        )}
      </Section>
    </DashboardScreen>
  );
}
