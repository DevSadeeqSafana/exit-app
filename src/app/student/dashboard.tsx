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
import { OffCampusBanner, PendingBanner, serverOffset, useServerNow } from '../../components/exitBanners';
import { clearSession, getSession } from '../../lib/session';
import { confirmCancelExit } from '../../lib/cancelExit';
import { getDashboard, getExitRequests, getMyBusTrips, type MyBusTrip } from '../../services/movementApi';
import { formatClock } from '../../components/exitBanners';
import { theme } from '../../theme';

export default function StudentDashboard() {
  const [name, setName] = useState('Student');
  const [preview, setPreview] = useState(false);
  const [stats, setStats] = useState({ approvedExits: 0, pendingReviews: 0, busScans: 0, currentLocation: 'Unknown' });
  const [exits, setExits] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [offset, setOffset] = useState(0);
  const [onBus, setOnBus] = useState<MyBusTrip | null>(null);
  const now = useServerNow(offset);
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
    const [dashboardRes, exitsRes, busRes] = await Promise.all([
      getDashboard(session.token),
      getExitRequests(session.token),
      getMyBusTrips(session.token).catch(() => ({ success: false, trips: [], current: null }))
    ]);
    if (!active.current) return;
    if (dashboardRes.dashboard?.summary) setStats((prev) => ({ ...prev, ...dashboardRes.dashboard.summary }));
    setExits(exitsRes.exits || []);
    setOffset(serverOffset(exitsRes.serverTime));
    setOnBus(busRes.current || null);
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
  const offCampus = exits.find((item) => item.status === 'Verified');
  const pending = offCampus ? undefined : exits.find((item) => item.status === 'Pending');
  const openRequest = (exitId: string) => router.push({ pathname: '/student/request/[id]', params: { id: exitId } });

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
          onProfile={() => router.push('/student/profile')}
          highlight={
            latest
              ? { icon: statusTone(latest.status).icon, label: 'Latest exit request', value: `${latest.status} · ${latest.route}`, caption: formatDateTime(latest.time) }
              : { icon: 'location-outline', label: 'Current location', value: stats.currentLocation || 'Unknown', caption: 'No exit requests yet. Start one when you need to leave campus.' }
          }
        />
      }
    >
      {offCampus ? (
        <OffCampusBanner
          exit={offCampus}
          now={now}
          onShowQr={() => router.push({ pathname: '/student/qr', params: { exitId: offCampus.id } })}
        />
      ) : pending ? (
        <PendingBanner exit={pending} now={now} onPress={() => openRequest(pending.id)} />
      ) : null}

      {onBus ? (
        <ListCard
          icon="bus"
          iconColor={theme.colors.navySoft}
          iconBg="#e4eefc"
          title={`On bus ${onBus.busNumber} to ${onBus.destination}`}
          subtitle={`Boarded at ${onBus.origin} · ${formatClock(onBus.boardedAt)}`}
          note="Scan the arrival QR when you get off."
          onPress={() => router.push('/student/bus-scan')}
        />
      ) : null}

      <ActionRow>
        <ActionTile primary icon="add-circle-outline" label="New exit" onPress={() => router.push('/student/exit-request')} />
        <ActionTile icon="qr-code-outline" label="My exit QR" onPress={() => router.push('/student/qr')} />
        <ActionTile icon="bus-outline" label="Scan bus QR" onPress={() => router.push('/student/bus-scan')} />
        <ActionTile icon="time-outline" label="History" onPress={() => router.push('/student/history')} />
      </ActionRow>

      <Section title="Overview">
        <StatRow
          items={[
            { icon: 'checkmark-done-outline', label: 'Approved exits', value: stats.approvedExits ?? 0, color: theme.colors.emerald },
            { icon: 'hourglass-outline', label: 'Pending review', value: stats.pendingReviews ?? 0, color: theme.colors.amber },
            { icon: 'bus-outline', label: 'Bus trips', value: stats.busScans ?? 0, color: theme.colors.navySoft }
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
                onPress={() => openRequest(item.id)}
                icon={tone.icon}
                iconColor={tone.fg}
                iconBg={tone.bg}
                title={item.route || 'Exit request'}
                subtitle={`${item.destination || 'Campus'} · ${formatDateTime(item.time)}`}
                status={item.status}
                note={
                  item.decisionNote
                    ? `${item.status === 'Rejected' ? 'Reason' : 'Staff note'}: ${item.decisionNote}`
                    : item.reason
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
                  ) : item.status === 'Rejected' || (item.status === 'Cancelled' && item === latest) ? (
                    <CardFooter>
                      <CardButton icon="add-circle-outline" label="Make a new request" onPress={() => router.push('/student/exit-request')} />
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
