import Ionicons from '@expo/vector-icons/Ionicons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card, InfoNote, PrimaryButton, SubScreen, formatDateTime, initials } from '../../components/dashboard';
import { getSession } from '../../lib/session';
import { gateConfirm, gateVerify, GateError, photoUrl, type GateExit } from '../../services/movementApi';
import { theme } from '../../theme';

// Gate scanner for staff/admin (decision D4, revised 2026-11-11): scan the student's exit QR,
// compare the photo with the person at the gate, then confirm the exit or return.
// Needs the Staff Portal's Gate Verification page granted to the staff member's group.

type Stage = 'idle' | 'scanning' | 'checking' | 'review' | 'confirming' | 'done' | 'problem';
type Check = { action: 'departure' | 'return'; station: string; exit: GateExit };
type Problem = { message: string; exit: GateExit | null };
type Recent = { at: Date; action: 'departure' | 'return'; exit: GateExit };

const ACTION = {
  departure: { label: 'EXIT', verb: 'Confirm exit', icon: 'exit-outline' as const, color: theme.colors.navy },
  return: { label: 'RETURN', verb: 'Confirm return', icon: 'enter-outline' as const, color: theme.colors.emerald }
};

function StudentPhoto({ exit, size }: { exit: GateExit; size: number }) {
  const [failed, setFailed] = useState(false);
  const uri = photoUrl(exit.student.photoPath);
  return (
    <View style={[styles.photo, { width: size, height: size, borderRadius: size / 2 }]}>
      {uri && !failed ? (
        <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} onError={() => setFailed(true)} />
      ) : (
        <Text style={[styles.photoInitials, { fontSize: size / 3 }]}>{initials(exit.student.name)}</Text>
      )}
    </View>
  );
}

function RequestFacts({ exit }: { exit: GateExit }) {
  return (
    <View style={styles.facts}>
      <Text style={styles.factsTitle}>
        {exit.route}
        {exit.destination ? ` → ${exit.destination}` : ''}
      </Text>
      {exit.reason ? <Text style={styles.factsText}>“{exit.reason}”</Text> : null}
      {exit.decidedByName || exit.decidedAt ? (
        <Text style={styles.factsMeta}>
          Approved{exit.decidedByName ? ` by ${exit.decidedByName}` : ''}
          {exit.decidedAt ? ` · ${formatDateTime(exit.decidedAt)}` : ''}
        </Text>
      ) : null}
      {exit.decisionNote ? <Text style={styles.factsMeta}>Note: {exit.decisionNote}</Text> : null}
      <Text style={styles.factsRef}>{exit.id}</Text>
    </View>
  );
}

export default function GateScanScreen() {
  const [stage, setStage] = useState<Stage>('idle');
  const [qrValue, setQrValue] = useState('');
  const [check, setCheck] = useState<Check | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [recent, setRecent] = useState<Recent[]>([]);
  const [permission, requestPermission] = useCameraPermissions();
  const scanLock = useRef(false);
  const insets = useSafeAreaInsets();

  const token = async () => {
    const session = await getSession();
    if (!session) {
      router.replace('/');
      return null;
    }
    return session.token;
  };

  const fail = (error: unknown, fallbackExit: GateExit | null = null) => {
    setProblem({
      message: error instanceof Error ? error.message : 'This code could not be checked.',
      exit: error instanceof GateError ? error.exit || fallbackExit : fallbackExit
    });
    setStage('problem');
  };

  const openScanner = async () => {
    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) {
        setProblem({ message: 'Allow camera access to scan exit QR codes.', exit: null });
        setStage('problem');
        return;
      }
    }
    setCheck(null);
    setProblem(null);
    setQrValue('');
    scanLock.current = false;
    setStage('scanning');
  };

  const onScanned = async ({ data }: { data: string }) => {
    if (scanLock.current) return;
    scanLock.current = true;
    const value = String(data || '').trim();
    setQrValue(value);
    setStage('checking');
    const t = await token();
    if (!t) return;
    try {
      const res = await gateVerify(t, value);
      setCheck({ action: res.action, station: res.station, exit: res.exit });
      setStage('review');
    } catch (error) {
      fail(error);
    }
  };

  const confirm = async () => {
    if (!check) return;
    setStage('confirming');
    const t = await token();
    if (!t) return;
    try {
      const res = await gateConfirm(t, qrValue);
      setCheck({ action: res.action, station: res.station, exit: res.exit });
      setRecent((list) => [{ at: new Date(), action: res.action, exit: res.exit }, ...list].slice(0, 10));
      setStage('done');
    } catch (error) {
      fail(error, check.exit);
    }
  };

  if (stage === 'scanning') {
    return (
      <View style={styles.scannerContainer}>
        <CameraView style={StyleSheet.absoluteFill} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={onScanned} />
        <View style={[styles.scannerOverlay, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 32 }]}>
          <Text style={styles.scannerTitle}>Scan the student's exit QR code</Text>
          <View style={styles.scannerFrame}>
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
          </View>
          <Pressable style={({ pressed }) => [styles.closeButton, pressed && { opacity: 0.7 }]} onPress={() => setStage('idle')}>
            <Ionicons name="close" size={18} color={theme.colors.navy} />
            <Text style={styles.closeText}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const action = check ? ACTION[check.action] : null;

  return (
    <SubScreen title="Gate scanner" subtitle="Confirm students leaving and returning">
      {stage === 'idle' && (
        <>
          <Card centered>
            <View style={styles.bigIcon}>
              <Ionicons name="qr-code-outline" size={44} color={theme.colors.navy} />
            </View>
            <Text style={styles.title}>Scan an exit QR</Text>
            <Text style={styles.text}>The student opens "My exit QR" in their app. You'll see their photo and approved request before confirming.</Text>
          </Card>
          <PrimaryButton icon="scan-outline" label="Start scanning" onPress={openScanner} />
          <InfoNote icon="shield-checkmark-outline">Check that the person in front of you is the student in the photo before confirming.</InfoNote>
        </>
      )}

      {(stage === 'checking' || stage === 'confirming') && (
        <Card centered>
          <ActivityIndicator size="large" color={theme.colors.navy} />
          <Text style={[styles.text, { marginTop: 12 }]}>{stage === 'checking' ? 'Checking the code…' : 'Recording…'}</Text>
        </Card>
      )}

      {stage === 'review' && check && action && (
        <>
          <Card centered>
            <View style={[styles.badge, { backgroundColor: action.color }]}>
              <Ionicons name={action.icon} size={16} color="#fff" />
              <Text style={styles.badgeText}>{action.label}</Text>
            </View>
            <StudentPhoto exit={check.exit} size={150} />
            <Text style={styles.name}>{check.exit.student.name}</Text>
            <Text style={styles.text}>
              {check.exit.student.studentId}
              {check.exit.student.courseCode ? ` · ${check.exit.student.courseCode}` : ''}
              {check.exit.student.level ? ` · ${check.exit.student.level}L` : ''}
            </Text>
            <RequestFacts exit={check.exit} />
            <Text style={styles.station}>Gate: {check.station}</Text>
          </Card>
          <InfoNote icon="alert-circle-outline">Check that the person in front of you is the student in the photo.</InfoNote>
          <PrimaryButton icon={action.icon} label={action.verb} onPress={confirm} />
          <PrimaryButton variant="ghost" icon="close-outline" label="Cancel" onPress={() => setStage('idle')} />
        </>
      )}

      {stage === 'done' && check && (
        <>
          <Card centered>
            <View style={[styles.bigIcon, { backgroundColor: '#e3f5ee' }]}>
              <Ionicons name="checkmark-circle" size={48} color={theme.colors.emerald} />
            </View>
            <Text style={[styles.title, { color: theme.colors.emerald }]}>{check.action === 'departure' ? 'Exit confirmed' : 'Return confirmed'}</Text>
            <Text style={styles.name}>{check.exit.student.name}</Text>
            <Text style={styles.text}>
              {check.exit.student.studentId} · {check.action === 'departure' ? 'now off campus' : 'back on campus'} · {check.station}
            </Text>
          </Card>
          <PrimaryButton icon="scan-outline" label="Scan next student" onPress={openScanner} />
        </>
      )}

      {stage === 'problem' && problem && (
        <>
          <Card centered>
            <View style={[styles.bigIcon, { backgroundColor: '#fbe9e7' }]}>
              <Ionicons name="close-circle" size={48} color={theme.colors.danger} />
            </View>
            <Text style={[styles.title, { color: theme.colors.danger }]}>Do not let the student through</Text>
            <Text style={styles.problemText}>{problem.message}</Text>
            {problem.exit && (
              <>
                <StudentPhoto exit={problem.exit} size={90} />
                <Text style={styles.nameSmall}>
                  {problem.exit.student.name} · {problem.exit.student.studentId}
                </Text>
                <RequestFacts exit={problem.exit} />
              </>
            )}
          </Card>
          <PrimaryButton icon="scan-outline" label="Scan again" onPress={openScanner} />
        </>
      )}

      {recent.length > 0 && stage !== 'review' && (
        <Card>
          <Text style={styles.recentTitle}>Confirmed on this phone</Text>
          {recent.map((r, i) => (
            <View key={`${r.exit.id}-${i}`} style={styles.recentRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.recentName} numberOfLines={1}>{r.exit.student.name}</Text>
                <Text style={styles.recentMeta}>
                  {r.exit.student.studentId} · {r.exit.id}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[styles.recentAction, { color: ACTION[r.action].color }]}>{ACTION[r.action].label}</Text>
                <Text style={styles.recentMeta}>{r.at.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</Text>
              </View>
            </View>
          ))}
        </Card>
      )}
    </SubScreen>
  );
}

const CORNER = 28;
const styles = StyleSheet.create({
  bigIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: theme.colors.blueSoft, alignItems: 'center', justifyContent: 'center' },
  title: { color: theme.colors.text, fontSize: 20, fontWeight: '800', marginTop: 12, textAlign: 'center' },
  text: { color: theme.colors.muted, fontSize: 14, textAlign: 'center', marginTop: 4 },
  problemText: { color: theme.colors.text, fontSize: 15, textAlign: 'center', marginTop: 8, marginBottom: 12 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 18, paddingVertical: 8, borderRadius: 999, marginBottom: 16 },
  badgeText: { color: '#fff', fontSize: 18, fontWeight: '800', letterSpacing: 1 },
  photo: { backgroundColor: theme.colors.blueSoft, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  photoInitials: { color: theme.colors.navy, fontWeight: '800' },
  name: { color: theme.colors.text, fontSize: 22, fontWeight: '800', marginTop: 12, textAlign: 'center' },
  nameSmall: { color: theme.colors.text, fontSize: 15, fontWeight: '700', marginTop: 8, textAlign: 'center' },
  facts: { alignSelf: 'stretch', marginTop: 14, padding: 12, borderRadius: 12, backgroundColor: theme.colors.slate, gap: 3 },
  factsTitle: { color: theme.colors.navy, fontSize: 14, fontWeight: '700' },
  factsText: { color: theme.colors.muted, fontSize: 13 },
  factsMeta: { color: theme.colors.text, fontSize: 12 },
  factsRef: { color: theme.colors.muted, fontSize: 11 },
  station: { color: theme.colors.muted, fontSize: 12, marginTop: 10 },
  recentTitle: { color: theme.colors.text, fontSize: 15, fontWeight: '800', marginBottom: 6 },
  recentRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: theme.colors.border, gap: 10 },
  recentName: { color: theme.colors.text, fontSize: 14, fontWeight: '700' },
  recentMeta: { color: theme.colors.muted, fontSize: 11 },
  recentAction: { fontSize: 12, fontWeight: '800' },

  scannerContainer: { flex: 1, backgroundColor: '#000' },
  scannerOverlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(11,42,91,0.35)' },
  scannerTitle: { color: '#fff', fontSize: 16, fontWeight: '700', textAlign: 'center', paddingHorizontal: 32 },
  scannerFrame: { width: 250, height: 250 },
  corner: { position: 'absolute', width: CORNER, height: CORNER, borderColor: theme.colors.gold },
  cornerTL: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 16 },
  cornerTR: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 16 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 16 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 16 },
  closeButton: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fff', borderRadius: 999, paddingHorizontal: 22, paddingVertical: 12 },
  closeText: { color: theme.colors.navy, fontWeight: '800' }
});
