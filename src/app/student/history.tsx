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
import { getExitRequests } from '../../services/movementApi';

export default function StudentHistoryScreen() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const session = await getSession();
    if (!session) {
      router.replace('/');
      return;
    }
    const res = await getExitRequests(session.token);
    setItems(res.exits || []);
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
          })}
        </Section>
      )}
    </SubScreen>
  );
}
