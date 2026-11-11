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
import { approveExitRequest, getBusList, getExitRequests, rejectExitRequest } from '../../services/movementApi';
import { theme } from '../../theme';

const isStatus = (item: any, status: string) => String(item?.status || '').toLowerCase() === status;

export default function StaffDashboard() {
  const [name, setName] = useState('Staff');
  const [station, setStation] = useState('Campus');
  const [preview, setPreview] = useState(false);
  const [items, setItems] = useState<any[]>([]);
  const [buses, setBuses] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const active = useRef(true);

  const load = useCallback(async () => {
    const session = await getSession();
    if (!session) {
      router.replace('/');
      return;
    }
    if (!active.current) return;
    setName(session.user?.name || 'Operations staff');
    setStation(session.user?.station || 'Campus');
    setPreview(Boolean(session.preview));
    const [exits, busData] = await Promise.all([getExitRequests(session.token), getBusList(session.token)]);
    if (!active.current) return;
    setItems(exits.exits || []);
    setBuses(busData.buses || []);
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

  const handleDecision = async (exitId: string, action: 'approve' | 'reject') => {
    const session = await getSession();
    if (!session) {
      router.replace('/');
      return;
    }
    try {
      setBusyId(exitId);
      if (action === 'approve') await approveExitRequest(session.token, exitId);
      else await rejectExitRequest(session.token, exitId);
      await load();
    } catch (error) {
      Alert.alert('Action failed', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBusyId(null);
    }
  };

  const confirmDecision = (exitId: string, action: 'approve' | 'reject') => {
    Alert.alert(
      action === 'approve' ? 'Approve exit request?' : 'Reject exit request?',
      `Request EXT-${exitId} will be ${action === 'approve' ? 'approved' : 'rejected'}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: action === 'approve' ? 'Approve' : 'Reject', style: action === 'reject' ? 'destructive' : 'default', onPress: () => handleDecision(exitId, action) }
      ]
    );
  };

  const pending = items.filter((item) => isStatus(item, 'pending'));
  const others = items.filter((item) => !isStatus(item, 'pending')).slice(0, 5);
  const activeBuses = buses.filter((bus) => !isStatus(bus, 'completed'));

  return (
    <DashboardScreen
      refreshing={refreshing}
      onRefresh={onRefresh}
      header={
        <DashboardHeader
          eyebrow="Operations desk"
          name={name}
          preview={preview}
          onSignOut={handleSignOut}
          highlight={{
            icon: 'location-outline',
            label: 'Assigned station',
            value: station,
            caption: pending.length ? `${pending.length} exit request${pending.length === 1 ? '' : 's'} awaiting your review` : 'Queue is clear — no requests awaiting review'
          }}
        />
      }
    >
      <ActionRow>
        <ActionTile primary icon="qr-code-outline" label="Station QR" onPress={() => router.push('/staff/station-qr')} />
        <ActionTile icon="bus-outline" label="Bus monitor" onPress={() => router.push('/staff/bus-monitor')} />
      </ActionRow>

      <Section title="Today at a glance">
        <StatRow
          items={[
            { icon: 'hourglass-outline', label: 'Pending exits', value: pending.length, color: theme.colors.amber },
            { icon: 'return-down-back-outline', label: 'Returns', value: items.filter((item) => isStatus(item, 'returned')).length, color: theme.colors.emerald },
            { icon: 'bus-outline', label: 'Active buses', value: activeBuses.length, color: theme.colors.navySoft }
          ]}
        />
      </Section>

      <Section title="Awaiting review" subtitle={pending.length ? `${pending.length} pending` : undefined}>
        {pending.length === 0 ? (
          <EmptyState icon="checkmark-done-outline" title="All caught up" message="New exit requests from students will appear here for approval." />
        ) : (
          pending.map((item) => {
            const exitId = String(item.id || '').replace(/^EXT-/, '');
            const tone = statusTone(item.status);
            const busy = busyId === exitId;
            return (
              <ListCard
                key={String(item.id)}
                icon="person-outline"
                iconColor={tone.fg}
                iconBg={tone.bg}
                title={item.student || 'Student'}
                subtitle={`${item.route || 'Route'} → ${item.destination || 'Campus'}`}
                status={item.status}
                note={item.reason ? `“${item.reason}” · ${formatDateTime(item.time)}` : formatDateTime(item.time)}
                footer={
                  <CardFooter>
                    <CardButton variant="success" icon="checkmark" label="Approve" disabled={busy} onPress={() => confirmDecision(exitId, 'approve')} />
                    <CardButton variant="danger" icon="close" label="Reject" disabled={busy} onPress={() => confirmDecision(exitId, 'reject')} />
                  </CardFooter>
                }
              />
            );
          })
        )}
      </Section>

      {others.length > 0 && (
        <Section title="Recently processed">
          {others.map((item) => {
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

      <Section title="Transport board" subtitle={buses.length ? `${buses.length} journey${buses.length === 1 ? '' : 's'}` : undefined}>
        {buses.length === 0 ? (
          <EmptyState icon="bus-outline" title="No bus journeys" message="Scheduled and active bus journeys will show here." />
        ) : (
          buses.slice(0, 5).map((bus) => (
            <ListCard
              key={String(bus.id)}
              icon="bus-outline"
              iconColor={theme.colors.navySoft}
              iconBg={theme.colors.blueSoft}
              title={bus.route || String(bus.id)}
              subtitle={`${bus.id} · ${bus.driver || 'Unassigned'} · ${bus.occupancy}`}
              status={bus.status}
            />
          ))
        )}
      </Section>
    </DashboardScreen>
  );
}
