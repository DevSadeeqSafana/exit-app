import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Alert } from 'react-native';
import {
  ActionListItem,
  ActionRow,
  ActionTile,
  DashboardHeader,
  DashboardScreen,
  EmptyState,
  InfoNote,
  ListCard,
  Section,
  StatRow,
  formatDateTime,
  statusTone
} from '../../components/dashboard';
import { getSession } from '../../lib/session';
import { signOut } from '../../lib/signOut';
import { getBusList, getDashboard, getExitRequests, getOffCampus } from '../../services/movementApi';
import { theme } from '../../theme';

// Operations view. Exit requests are approved or rejected in the Staff Portal (D3).
// Staff with the Gate Verification grant scan students' exit QR codes here (Gate scanner).

const isStatus = (item: any, status: string) => String(item?.status || '').toLowerCase() === status;

export default function StaffDashboard() {
  const [name, setName] = useState('Staff');
  const [station, setStation] = useState('Campus');
  const [preview, setPreview] = useState(false);
  const [items, setItems] = useState<any[]>([]);
  const [buses, setBuses] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [canScan, setCanScan] = useState(false);
  const [canRunBus, setCanRunBus] = useState(false);
  const [offCampus, setOffCampus] = useState<{ count: number; overdue: number } | null>(null);
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
    const [exits, busData, dash] = await Promise.all([
      getExitRequests(session.token),
      getBusList(session.token),
      getDashboard(session.token)
    ]);
    if (!active.current) return;
    setCanScan(Boolean(dash.canScanGate));
    setCanRunBus(Boolean(dash.canStartBusTrip));
    if (dash.canSeeOffCampus) {
      const oc = await getOffCampus(session.token).catch(() => null);
      if (active.current) setOffCampus(oc ? { count: oc.count, overdue: oc.overdue } : null);
    } else {
      setOffCampus(null);
    }
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

  const handleSignOut = () => signOut();

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
            caption: pending.length
              ? `${pending.length} exit request${pending.length === 1 ? '' : 's'} awaiting a decision in the Staff Portal`
              : 'Queue is clear — no requests awaiting a decision'
          }}
        />
      }
    >
      <ActionRow>
        {canScan && <ActionTile primary icon="scan-outline" label="Scan QR" onPress={() => router.push('/staff/gate-scan')} />}
        {canRunBus && <ActionTile primary={!canScan} icon="bus" label="Bus trips" onPress={() => router.push('/staff/bus')} />}
        <ActionTile primary={!canScan && !canRunBus} icon="bus-outline" label="Bus monitor" onPress={() => router.push('/staff/bus-monitor')} />
      </ActionRow>

      <InfoNote icon="desktop-outline">
        Exit requests are approved or rejected in the Staff Portal (Human Resource › Student Movement › Exit Requests).
        {canScan
          ? ' Use Scan QR to confirm students leaving and returning at the gate.'
          : ' To scan exit QR codes, ask for the Gate Verification page to be granted to your group.'}
      </InfoNote>

      {offCampus ? (
        <ActionListItem
          icon="walk-outline"
          title="Off campus now"
          caption={`${offCampus.count} out · ${offCampus.overdue} overdue${offCampus.overdue ? ' — tap to see who' : ''}`}
          onPress={() => router.push('/staff/off-campus')}
        />
      ) : null}

      <Section title="Today at a glance">
        <StatRow
          items={[
            { icon: 'hourglass-outline', label: 'Pending exits', value: pending.length, color: theme.colors.amber },
            { icon: 'return-down-back-outline', label: 'Returns', value: items.filter((item) => isStatus(item, 'returned')).length, color: theme.colors.emerald },
            { icon: 'bus-outline', label: 'Active buses', value: activeBuses.length, color: theme.colors.navySoft }
          ]}
        />
      </Section>

      <Section title="Awaiting a decision" subtitle={pending.length ? `${pending.length} pending · decide in the Staff Portal` : undefined}>
        {pending.length === 0 ? (
          <EmptyState icon="checkmark-done-outline" title="All caught up" message="New exit requests from students appear here, and are decided in the Staff Portal." />
        ) : (
          pending.map((item) => {
            const tone = statusTone(item.status);
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
