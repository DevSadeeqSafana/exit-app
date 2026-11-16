import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import {
  Card,
  EmptyState,
  InfoNote,
  ListCard,
  LoadingBlock,
  PrimaryButton,
  Section,
  SubScreen,
  statusTone
} from '../../components/dashboard';
import { getSession } from '../../lib/session';
import { generateExitQr, getExitRequests, type ExitRequest } from '../../services/movementApi';
import { theme } from '../../theme';

// The student's exit / return QR (decision D2): security scans it on the Staff Portal's
// Gate Verification page. A code works once and lasts 5 minutes, so it is renewed
// automatically while this screen is open; screenshots stop working.

const RENEW_BEFORE_EXPIRY_MS = 30 * 1000;
const STATUS_POLL_MS = 10 * 1000;

type Qr = { value: string; type: 'departure' | 'return'; expiresAt: number; exitId: string };
type Confirmed = { action: 'departure' | 'return'; exit: ExitRequest };

const isOpenForQr = (e?: ExitRequest) => !!e && (e.status === 'Approved' || e.status === 'Verified');

export default function StudentQrScreen() {
  const params = useLocalSearchParams<{ exitId?: string }>();
  const [exits, setExits] = useState<ExitRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [qr, setQr] = useState<Qr | null>(null);
  const [qrError, setQrError] = useState('');
  const [confirmed, setConfirmed] = useState<Confirmed | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const active = useRef(false);
  const renewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const qrRef = useRef<Qr | null>(null);
  // The latest loadQr, for the renewal timer (a callback cannot call itself before it is declared).
  const loadQrRef = useRef<(exitId: string) => void>(() => {});
  useEffect(() => {
    qrRef.current = qr;
  }, [qr]);

  // Same choice as the server: the requested exit, else one already out (needs a return), else the approved one.
  const pick = (list: ExitRequest[]) => {
    const requested = params.exitId ? list.find((e) => e.id === params.exitId) : undefined;
    if (isOpenForQr(requested)) return requested;
    return list.find((e) => e.status === 'Verified') || list.find((e) => e.status === 'Approved');
  };
  const target = pick(exits);

  const clearRenew = () => {
    if (renewTimer.current) clearTimeout(renewTimer.current);
    renewTimer.current = null;
  };

  const loadQr = useCallback(async (exitId: string) => {
    clearRenew();
    const session = await getSession();
    if (!session) {
      router.replace('/');
      return;
    }
    try {
      const res = await generateExitQr(session.token, exitId);
      if (!active.current) return;
      const expiresAt = new Date(res.expiresAt).getTime();
      setQr({ value: res.qrValue, type: res.type, expiresAt, exitId });
      setQrError('');
      renewTimer.current = setTimeout(() => {
        if (active.current) loadQrRef.current(exitId);
      }, Math.max(15 * 1000, expiresAt - Date.now() - RENEW_BEFORE_EXPIRY_MS));
    } catch (error) {
      if (!active.current) return;
      setQr(null);
      setQrError(error instanceof Error ? error.message : 'Unable to create your QR code.');
    }
  }, []);

  useEffect(() => {
    loadQrRef.current = loadQr;
  }, [loadQr]);

  const loadExits = useCallback(async () => {
    const session = await getSession();
    if (!session) {
      router.replace('/');
      return [] as ExitRequest[];
    }
    const res = await getExitRequests(session.token);
    const list = res.exits || [];
    if (active.current) setExits(list);
    return list;
  }, []);

  // Watch the request while the code is on screen: when security confirms the scan,
  // the status moves on (Approved -> Verified, or Verified -> Returned).
  const checkStatus = useCallback(async () => {
    const shown = qrRef.current;
    if (!shown) return;
    const list = await loadExits().catch(() => null);
    if (!list || !active.current) return;
    const current = list.find((e) => e.id === shown.exitId);
    if (!current) return;
    const done =
      (shown.type === 'departure' && (current.status === 'Verified' || current.status === 'Returned')) ||
      (shown.type === 'return' && current.status === 'Returned');
    if (done) {
      clearRenew();
      setQr(null);
      setConfirmed({ action: shown.type, exit: current });
    }
  }, [loadExits]);

  useFocusEffect(useCallback(() => {
    active.current = true;
    setConfirmed(null);
    loadExits()
      .then((list) => {
        const chosen = pick(list);
        if (chosen) loadQr(chosen.id);
      })
      .catch((error) => Alert.alert('Unable to load your requests', error instanceof Error ? error.message : 'Please try again.'))
      .finally(() => setLoading(false));
    const poll = setInterval(checkStatus, STATUS_POLL_MS);
    return () => {
      active.current = false;
      clearInterval(poll);
      clearRenew();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadExits, loadQr, checkStatus, params.exitId]));

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      const list = await loadExits();
      const chosen = pick(list);
      if (chosen && !confirmed) await loadQr(chosen.id);
    } catch (error) {
      Alert.alert('Unable to refresh', error instanceof Error ? error.message : 'Please try again.');
    }
    setRefreshing(false);
  };

  const showReturnQr = () => {
    if (!confirmed) return;
    setConfirmed(null);
    loadQr(confirmed.exit.id);
  };

  const secondsLeft = qr ? Math.max(0, Math.ceil((qr.expiresAt - now) / 1000)) : 0;
  const mm = Math.floor(secondsLeft / 60);
  const ss = String(secondsLeft % 60).padStart(2, '0');
  const isReturn = qr?.type === 'return';

  return (
    <SubScreen title="My exit QR" subtitle="Show this code to security at the gate" refreshing={refreshing} onRefresh={onRefresh}>
      {loading ? (
        <LoadingBlock />
      ) : confirmed ? (
        <>
          <Card centered>
            <View style={styles.successIcon}>
              <Ionicons name="checkmark-circle" size={44} color={theme.colors.emerald} />
            </View>
            <Text style={styles.successTitle}>{confirmed.action === 'departure' ? 'Exit confirmed' : 'Welcome back'}</Text>
            <Text style={styles.successText}>
              {confirmed.action === 'departure'
                ? 'Security has recorded your exit. Show your return QR when you come back.'
                : 'Security has recorded your return. This request is now closed.'}
            </Text>
            <View style={styles.successMeta}>
              <Text style={styles.successMetaText} numberOfLines={1}>
                {confirmed.exit.id} · {confirmed.exit.destination || confirmed.exit.route}
              </Text>
            </View>
          </Card>
          {confirmed.action === 'departure' ? (
            <PrimaryButton icon="qr-code-outline" label="Show my return QR" onPress={showReturnQr} />
          ) : (
            <PrimaryButton variant="ghost" icon="home-outline" label="Back to dashboard" onPress={() => router.back()} />
          )}
        </>
      ) : target ? (
        <>
          <Card centered>
            <View style={[styles.typeBadge, { backgroundColor: isReturn ? theme.colors.emerald : theme.colors.navy }]}>
              <Ionicons name={isReturn ? 'enter-outline' : 'exit-outline'} size={16} color="#fff" />
              <Text style={styles.typeBadgeText}>{isReturn ? 'RETURN' : 'EXIT'}</Text>
            </View>

            <View style={styles.qrWrap}>
              {qr && !qrError ? (
                <QRCode value={qr.value} size={250} color={theme.colors.navy} backgroundColor="#ffffff" />
              ) : (
                <View style={styles.qrPlaceholder}>
                  <Text style={styles.placeholderText}>{qrError || 'Creating your code…'}</Text>
                </View>
              )}
            </View>

            {qr && !qrError ? (
              <View style={styles.timer}>
                <Text style={styles.timerText}>Renews automatically · {mm}:{ss}</Text>
              </View>
            ) : null}

            <View style={styles.actions}>
              <PrimaryButton variant="ghost" icon="refresh-outline" label="New code" onPress={() => loadQr(target.id)} />
            </View>
          </Card>

          <Section title={isReturn ? 'Returning from' : 'Approved exit'}>
            <ListCard
              icon={statusTone(target.status).icon}
              iconColor={statusTone(target.status).fg}
              iconBg={statusTone(target.status).bg}
              title={target.destination || target.route}
              subtitle={`${target.id} · ${target.route}`}
              status={target.status}
              note={target.decisionNote ? `Staff note: ${target.decisionNote}` : undefined}
            />
          </Section>

          <InfoNote icon="shield-checkmark-outline">
            Security scans this code and checks your photo. Each code works once and changes every few minutes, so screenshots won’t work.
            Keep this screen open at the gate.
          </InfoNote>
        </>
      ) : (
        <>
          <EmptyState
            icon="walk-outline"
            title="No approved exit"
            message="Your QR appears here once a staff member approves your exit request."
          />
          <PrimaryButton icon="add-circle-outline" label="Request an exit" onPress={() => router.push('/student/exit-request')} />
        </>
      )}
    </SubScreen>
  );
}

const styles = StyleSheet.create({
  typeBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 7, borderRadius: 999 },
  typeBadgeText: { color: '#fff', fontSize: 14, fontWeight: '800', letterSpacing: 1 },
  qrWrap: { marginTop: 16, padding: 14, borderRadius: 20, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: '#fff' },
  qrPlaceholder: { width: 250, height: 250, alignItems: 'center', justifyContent: 'center', padding: 16 },
  placeholderText: { color: theme.colors.muted, fontSize: 13, textAlign: 'center' },
  timer: { marginTop: 14, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999, backgroundColor: '#e3f5ee' },
  timerText: { color: theme.colors.emerald, fontSize: 13, fontWeight: '700' },
  actions: { alignSelf: 'stretch', marginTop: 14 },
  successIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#e3f5ee', alignItems: 'center', justifyContent: 'center' },
  successTitle: { color: theme.colors.text, fontSize: 20, fontWeight: '800', marginTop: 12 },
  successText: { color: theme.colors.muted, fontSize: 14, textAlign: 'center', marginTop: 4 },
  successMeta: { alignSelf: 'stretch', marginTop: 14, padding: 12, borderRadius: 12, backgroundColor: theme.colors.slate, alignItems: 'center' },
  successMetaText: { color: theme.colors.navy, fontSize: 13, fontWeight: '700' }
});
