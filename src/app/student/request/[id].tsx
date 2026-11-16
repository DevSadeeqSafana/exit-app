import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import {
  Card,
  CardButton,
  CardFooter,
  EmptyState,
  LoadingBlock,
  PrimaryButton,
  Section,
  StatusBadge,
  SubScreen,
  formatDateTime,
  type IconName
} from '../../../components/dashboard';
import { OffCampusBanner, PendingBanner, serverOffset, useServerNow } from '../../../components/exitBanners';
import { confirmCancelExit } from '../../../lib/cancelExit';
import { getSession } from '../../../lib/session';
import { ApiError, getExitRequest, type ExitRequest, type TimelineStep } from '../../../services/movementApi';
import { theme } from '../../../theme';

const c = theme.colors;

const STEP_STYLE: Record<string, { icon: IconName; fg: string; bg: string }> = {
  submitted: { icon: 'paper-plane-outline', fg: c.navySoft, bg: '#e4eefc' },
  approved: { icon: 'checkmark-circle-outline', fg: c.emerald, bg: '#e3f5ee' },
  rejected: { icon: 'close-circle-outline', fg: c.danger, bg: '#fbe9e7' },
  departed: { icon: 'log-out-outline', fg: c.navySoft, bg: '#e4eefc' },
  returned: { icon: 'log-in-outline', fg: c.emerald, bg: '#e3f5ee' },
  cancelled: { icon: 'ban-outline', fg: '#6b7a8f', bg: '#eef0f3' }
};

// What the student should do next, for statuses that have no button.
const NEXT_STEP: Record<string, string> = {
  Pending: 'Your request is with the Student Movement office. You will see the decision here.',
  Approved: 'Show your exit QR to security at the gate when you leave.',
  Verified: 'Show your return QR to security at the gate when you are back.',
  Returned: 'You are back on campus. This request is closed.',
  Rejected: 'This request was not approved. You can make a new request if you still need to go out.',
  Cancelled: 'You cancelled this request. You can make a new request when you need one.'
};

type Detail = ExitRequest & { timeline: TimelineStep[] };

export default function ExitRequestDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const exitId = String(id || '');
  const [exit, setExit] = useState<Detail | null>(null);
  const [offset, setOffset] = useState(0);
  const [missing, setMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const now = useServerNow(offset);

  const load = useCallback(async () => {
    const session = await getSession();
    if (!session) {
      router.replace('/');
      return;
    }
    try {
      const res = await getExitRequest(session.token, exitId);
      setExit(res.exit);
      setOffset(serverOffset(res.serverTime));
      setMissing(false);
    } catch (error) {
      if (error instanceof ApiError && (error.status === 404 || error.status === 400)) {
        setMissing(true);
        return;
      }
      throw error;
    }
  }, [exitId]);

  const reportError = (error: unknown) =>
    Alert.alert('Unable to load request', error instanceof Error ? error.message : 'Please try again.');

  useFocusEffect(useCallback(() => {
    load().catch(reportError).finally(() => setLoading(false));
  }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load().catch(reportError);
    setRefreshing(false);
  };

  const showQr = () => router.push({ pathname: '/student/qr', params: { exitId } });

  return (
    <SubScreen title="Exit request" subtitle={exitId} refreshing={refreshing} onRefresh={onRefresh}>
      {loading ? (
        <LoadingBlock />
      ) : missing || !exit ? (
        <EmptyState icon="document-text-outline" title="Request not found" message="It may have been removed, or it belongs to another account." />
      ) : (
        <>
          {exit.status === 'Verified' && <OffCampusBanner exit={exit} now={now} onShowQr={showQr} />}
          {exit.status === 'Pending' && <PendingBanner exit={exit} now={now} onPress={onRefresh} />}

          <Card>
            <View style={styles.headRow}>
              <View style={styles.headText}>
                <Text style={styles.route} numberOfLines={2}>{exit.route || 'Exit request'}</Text>
                <Text style={styles.meta}>{exit.destination || 'Campus'}</Text>
              </View>
              <StatusBadge status={exit.status} />
            </View>
            {exit.reason ? <Field label="Reason" value={exit.reason} /> : null}
            {exit.decisionNote ? (
              <Field label={exit.status === 'Rejected' ? 'Why it was rejected' : 'Note from staff'} value={exit.decisionNote} />
            ) : null}
            <Field label="Submitted" value={formatDateTime(exit.time)} />
            {NEXT_STEP[exit.status] ? <Text style={styles.next}>{NEXT_STEP[exit.status]}</Text> : null}

            {exit.canGenerateQR || exit.canCancel ? (
              <CardFooter>
                {exit.canGenerateQR && exit.status !== 'Verified' ? (
                  <CardButton icon="qr-code-outline" label="Show exit QR" onPress={showQr} />
                ) : null}
                {exit.canCancel ? (
                  <CardButton
                    icon="close-outline"
                    label="Cancel request"
                    variant="danger"
                    onPress={() => confirmCancelExit(exit, () => { load().catch(reportError); })}
                  />
                ) : null}
              </CardFooter>
            ) : null}
          </Card>

          {exit.status === 'Rejected' || exit.status === 'Cancelled' ? (
            <PrimaryButton icon="add-circle-outline" label="Make a new request" onPress={() => router.push('/student/exit-request')} />
          ) : null}

          <Section title="Timeline">
            <Card>
              {exit.timeline.map((step, index) => (
                <Step key={`${step.type}-${index}`} step={step} last={index === exit.timeline.length - 1} />
              ))}
            </Card>
          </Section>
        </>
      )}
    </SubScreen>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value}</Text>
    </View>
  );
}

function Step({ step, last }: { step: TimelineStep; last: boolean }) {
  const style = STEP_STYLE[step.type] || { icon: 'ellipse-outline' as IconName, fg: c.muted, bg: c.slate };
  return (
    <View style={styles.step}>
      <View style={styles.stepRail}>
        <View style={[styles.stepIcon, { backgroundColor: style.bg }]}>
          <Ionicons name={style.icon} size={16} color={style.fg} />
        </View>
        {!last && <View style={styles.stepLine} />}
      </View>
      <View style={[styles.stepBody, !last && styles.stepBodyGap]}>
        <Text style={styles.stepLabel}>{step.label}</Text>
        <Text style={styles.stepTime}>{step.at ? formatDateTime(step.at) : '—'}</Text>
        {step.note ? <Text style={styles.stepNote}>“{step.note}”</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  headText: { flex: 1, minWidth: 0 },
  route: { color: c.text, fontSize: 17, fontWeight: '800' },
  meta: { color: c.muted, fontSize: 13, marginTop: 2 },
  field: { marginTop: 12 },
  fieldLabel: { color: c.muted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  fieldValue: { color: c.text, fontSize: 14, lineHeight: 20, marginTop: 2 },
  next: { color: '#33507a', fontSize: 13, lineHeight: 19, marginTop: 14 },
  step: { flexDirection: 'row', gap: 12 },
  stepRail: { alignItems: 'center', width: 32 },
  stepIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  stepLine: { flex: 1, width: 2, backgroundColor: c.border, marginVertical: 4 },
  stepBody: { flex: 1, minWidth: 0, paddingTop: 5 },
  stepBodyGap: { paddingBottom: 16 },
  stepLabel: { color: c.text, fontSize: 14, fontWeight: '700' },
  stepTime: { color: c.muted, fontSize: 12, marginTop: 2 },
  stepNote: { color: '#3d4f66', fontSize: 13, lineHeight: 19, marginTop: 4 }
});
