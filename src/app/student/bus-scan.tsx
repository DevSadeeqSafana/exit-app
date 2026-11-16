import Ionicons from '@expo/vector-icons/Ionicons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card, InfoNote, PrimaryButton, SubScreen } from '../../components/dashboard';
import { formatClock } from '../../components/exitBanners';
import { getSession } from '../../lib/session';
import { ApiError, getMyBusTrips, scanBusCode, type BusTrip, type MyBusTrip } from '../../services/movementApi';
import { theme } from '../../theme';

// "Scan bus QR" (features plan, Phase 4d): the student scans the code on the staff
// member's phone when boarding, and again when getting off. The server decides which.

type Stage = 'idle' | 'scanning' | 'sending' | 'done' | 'problem';
type Done = { action: 'boarded' | 'arrived'; message: string; trip: BusTrip; at: string };

const c = theme.colors;
const CORNER = 34;

// What to do after each refusal (codes from POST /movement/bus/scan).
const ADVICE: Record<string, string> = {
  expired: 'The code changes every 10 seconds. Scan the staff member\'s screen again.',
  unreadable: 'Point the camera at the QR on the staff member\'s phone, not a photo or another code.',
  invalid: 'Point the camera at the QR on the staff member\'s phone.',
  closed: 'Speak to the staff member on the bus.',
  not_boarded: 'Speak to the staff member: your boarding was not recorded.',
  removed: 'Speak to the staff member on the bus.'
};

export default function BusScanScreen() {
  const [stage, setStage] = useState<Stage>('idle');
  const [done, setDone] = useState<Done | null>(null);
  const [problem, setProblem] = useState<{ message: string; code?: string } | null>(null);
  const [current, setCurrent] = useState<MyBusTrip | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const scanLock = useRef(false);
  const insets = useSafeAreaInsets();

  const loadCurrent = useCallback(async () => {
    const session = await getSession();
    if (!session) {
      router.replace('/');
      return;
    }
    const res = await getMyBusTrips(session.token);
    setCurrent(res.current);
  }, []);

  useFocusEffect(useCallback(() => {
    loadCurrent().catch(() => {});
  }, [loadCurrent]));

  const openScanner = async () => {
    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) {
        setProblem({ message: 'Allow camera access to scan the bus QR code.' });
        setStage('problem');
        return;
      }
    }
    setDone(null);
    setProblem(null);
    scanLock.current = false;
    setStage('scanning');
  };

  const onScanned = async ({ data }: { data: string }) => {
    if (scanLock.current) return;
    scanLock.current = true;
    setStage('sending');
    const session = await getSession();
    if (!session) {
      router.replace('/');
      return;
    }
    try {
      const res = await scanBusCode(session.token, String(data || '').trim());
      setDone({ action: res.action, message: res.message, trip: res.trip, at: res.at });
      setStage('done');
      loadCurrent().catch(() => {});
    } catch (error) {
      setProblem({
        message: error instanceof Error ? error.message : 'The code could not be checked.',
        code: error instanceof ApiError ? error.code : undefined
      });
      setStage('problem');
    }
  };

  if (stage === 'scanning') {
    return (
      <View style={styles.scanner}>
        <CameraView style={StyleSheet.absoluteFill} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={onScanned} />
        <View style={[styles.overlay, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 32 }]}>
          <Text style={styles.overlayTitle}>Scan the QR on the staff member’s phone</Text>
          <View style={styles.frame}>
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
          </View>
          <Pressable style={({ pressed }) => [styles.close, pressed && { opacity: 0.7 }]} onPress={() => setStage('idle')}>
            <Ionicons name="close" size={18} color={c.navy} />
            <Text style={styles.closeText}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <SubScreen title="Scan bus QR" subtitle="Scan when you board, and again when you get off">
      {stage === 'sending' ? (
        <Card centered>
          <ActivityIndicator size="large" color={c.navy} />
          <Text style={styles.waiting}>Checking the code…</Text>
        </Card>
      ) : stage === 'done' && done ? (
        <Card centered>
          <View style={[styles.result, { backgroundColor: done.action === 'boarded' ? '#e4eefc' : '#e3f5ee' }]}>
            <Ionicons name={done.action === 'boarded' ? 'bus' : 'flag'} size={40} color={done.action === 'boarded' ? c.navySoft : c.emerald} />
          </View>
          <Text style={styles.resultTitle}>{done.action === 'boarded' ? 'You are on board' : 'Arrival recorded'}</Text>
          <Text style={styles.resultText}>{done.message}</Text>
          <Text style={styles.resultMeta}>
            Bus {done.trip.busNumber}
            {done.trip.plateNumber ? ` · ${done.trip.plateNumber}` : ''} · {formatClock(done.at)}
          </Text>
          {done.action === 'boarded' ? (
            <Text style={styles.resultNext}>Scan again when you get off at {done.trip.destination}.</Text>
          ) : null}
        </Card>
      ) : stage === 'problem' && problem ? (
        <Card centered>
          <View style={[styles.result, { backgroundColor: '#fbe9e7' }]}>
            <Ionicons name="alert-circle" size={40} color={c.danger} />
          </View>
          <Text style={styles.resultTitle}>{problem.code === 'already' ? 'Already recorded' : 'Not recorded'}</Text>
          <Text style={styles.resultText}>{problem.message}</Text>
          {problem.code && ADVICE[problem.code] ? <Text style={styles.resultNext}>{ADVICE[problem.code]}</Text> : null}
        </Card>
      ) : current ? (
        <InfoNote icon="bus-outline">
          {`You are on bus ${current.busNumber} to ${current.destination}, boarded at ${formatClock(current.boardedAt)}. `}
          Scan the arrival QR when you get off.
        </InfoNote>
      ) : (
        <InfoNote icon="bus-outline">
          Getting on a bus? Ask the staff member for the boarding QR and scan it. Scan their arrival QR when you get off.
        </InfoNote>
      )}

      <PrimaryButton
        icon="scan-outline"
        label={stage === 'done' || stage === 'problem' ? 'Scan again' : current ? 'Scan arrival QR' : 'Scan bus QR'}
        onPress={openScanner}
        loading={stage === 'sending'}
      />
      {stage === 'done' || stage === 'problem' ? (
        <PrimaryButton icon="home-outline" label="Back to dashboard" variant="ghost" onPress={() => router.back()} />
      ) : null}
    </SubScreen>
  );
}

const styles = StyleSheet.create({
  scanner: { flex: 1, backgroundColor: '#000' },
  overlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(11,42,91,0.35)' },
  overlayTitle: { color: '#fff', fontSize: 16, fontWeight: '700', textAlign: 'center', paddingHorizontal: 32 },
  frame: { width: 250, height: 250 },
  corner: { position: 'absolute', width: CORNER, height: CORNER, borderColor: c.gold },
  cornerTL: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 16 },
  cornerTR: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 16 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 16 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 16 },
  close: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fff', borderRadius: 999, paddingHorizontal: 22, paddingVertical: 12 },
  closeText: { color: c.navy, fontWeight: '800' },
  waiting: { color: c.muted, fontSize: 14, marginTop: 12 },
  result: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center' },
  resultTitle: { color: c.text, fontSize: 19, fontWeight: '800', marginTop: 14, textAlign: 'center' },
  resultText: { color: '#3d4f66', fontSize: 14, lineHeight: 20, marginTop: 6, textAlign: 'center' },
  resultMeta: { color: c.muted, fontSize: 13, marginTop: 6, textAlign: 'center' },
  resultNext: { color: c.navySoft, fontSize: 13, fontWeight: '700', marginTop: 12, textAlign: 'center' }
});
