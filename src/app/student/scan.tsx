import Ionicons from '@expo/vector-icons/Ionicons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
import { getExitRequests, scanStationQr } from '../../services/movementApi';
import { theme } from '../../theme';

type ExitRequest = { id: string; route: string; destination?: string; status: string };
type ScanResult = Awaited<ReturnType<typeof scanStationQr>>;

export default function StudentScanScreen() {
  const params = useLocalSearchParams<{ exitId?: string }>();
  const [exits, setExits] = useState<ExitRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const scanLock = useRef(false);
  const insets = useSafeAreaInsets();

  const loadExits = useCallback(async () => {
    const session = await getSession();
    if (!session) {
      router.replace('/');
      return;
    }
    const response = await getExitRequests(session.token);
    setExits(response.exits || []);
  }, []);

  const reportError = (error: unknown) =>
    Alert.alert('Unable to load exits', error instanceof Error ? error.message : 'Please try again.');

  useFocusEffect(useCallback(() => {
    loadExits().catch(reportError).finally(() => setLoading(false));
  }, [loadExits]));

  const onRefresh = async () => {
    setRefreshing(true);
    await loadExits().catch(reportError);
    setRefreshing(false);
  };

  // Same rule as the server: an exit that is already out needs a return; otherwise the latest approved exit departs.
  const outExit = exits.find((exit) => exit.status === 'Verified');
  const approvedExit = exits.find((exit) => exit.status === 'Approved');
  const requested = params.exitId ? exits.find((exit) => exit.id === params.exitId && ['Approved', 'Verified'].includes(exit.status)) : undefined;
  const target = requested || outExit || approvedExit;
  const nextAction = target?.status === 'Verified' ? 'return' : 'departure';

  const openScanner = async () => {
    if (!permission) return;
    if (!permission.granted) {
      const res = await requestPermission();
      if (!res.granted) {
        Alert.alert('Camera permission required', 'Allow camera access to scan the station QR code at the gate.');
        return;
      }
    }
    setResult(null);
    scanLock.current = false;
    setScanning(true);
  };

  const handleScanned = async ({ data }: { data: string }) => {
    if (scanLock.current) return;
    scanLock.current = true;
    setScanning(false);
    const session = await getSession();
    if (!session) {
      router.replace('/');
      return;
    }
    try {
      setSubmitting(true);
      const res = await scanStationQr(session.token, String(data || '').trim(), requested?.id);
      setResult(res);
      await loadExits().catch(() => undefined);
    } catch (error) {
      Alert.alert('Check-in failed', error instanceof Error ? error.message : 'This QR code could not be used. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (scanning) {
    return (
      <View style={styles.scannerContainer}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={handleScanned}
        />
        <View style={[styles.scannerOverlay, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 32 }]}>
          <Text style={styles.scannerTitle}>Scan the QR code displayed by staff at the gate</Text>
          <View style={styles.scannerFrame}>
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
          </View>
          <Pressable style={({ pressed }) => [styles.closeButton, pressed && { opacity: 0.7 }]} onPress={() => setScanning(false)}>
            <Ionicons name="close" size={18} color={theme.colors.navy} />
            <Text style={styles.closeText}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <SubScreen title="Gate check-in" subtitle="Scan the station QR to record your movement" refreshing={refreshing} onRefresh={onRefresh}>
      {loading ? (
        <LoadingBlock />
      ) : (
        <>
          {result ? (
            <Card centered>
              <View style={styles.successIcon}>
                <Ionicons name="checkmark-circle" size={44} color={theme.colors.emerald} />
              </View>
              <Text style={styles.successTitle}>{result.action === 'departure' ? 'Departure recorded' : 'Welcome back'}</Text>
              <Text style={styles.successText}>{result.message}</Text>
              <View style={styles.successMeta}>
                <Text style={styles.successMetaText} numberOfLines={1}>{result.exitId} · {result.route}</Text>
                <Text style={styles.successMetaText}>{new Date(result.timestamp).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</Text>
              </View>
              <Text style={styles.successHint}>Show this screen to the staff at the gate.</Text>
            </Card>
          ) : null}

          {target ? (
            <>
              <Section title={nextAction === 'return' ? 'Ready to return' : 'Ready to depart'}>
                <ListCard
                  icon={statusTone(target.status).icon}
                  iconColor={statusTone(target.status).fg}
                  iconBg={statusTone(target.status).bg}
                  title={target.route}
                  subtitle={`${target.id} · ${nextAction === 'return' ? 'Scan when you arrive back' : 'Scan as you leave'}`}
                  status={target.status}
                />
              </Section>
              <PrimaryButton
                icon="scan-outline"
                label={nextAction === 'return' ? 'Scan to check in' : 'Scan to check out'}
                onPress={openScanner}
                loading={submitting}
              />
              <InfoNote icon="shield-checkmark-outline">
                Staff at the gate display a QR code that refreshes every minute. Scan it with this screen to record your {nextAction}.
              </InfoNote>
            </>
          ) : !result ? (
            <>
              <EmptyState
                icon="walk-outline"
                title="No approved exit"
                message="You need an approved exit request before you can check out at the gate."
              />
              <PrimaryButton icon="add-circle-outline" label="Request an exit" onPress={() => router.push('/student/exit-request')} />
            </>
          ) : (
            <PrimaryButton variant="ghost" icon="home-outline" label="Back to dashboard" onPress={() => router.back()} />
          )}
        </>
      )}
    </SubScreen>
  );
}

const CORNER = 28;
const styles = StyleSheet.create({
  successIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#e3f5ee', alignItems: 'center', justifyContent: 'center' },
  successTitle: { color: theme.colors.text, fontSize: 20, fontWeight: '800', marginTop: 12 },
  successText: { color: theme.colors.muted, fontSize: 14, textAlign: 'center', marginTop: 4 },
  successMeta: { alignSelf: 'stretch', marginTop: 14, padding: 12, borderRadius: 12, backgroundColor: theme.colors.slate, gap: 4, alignItems: 'center' },
  successMetaText: { color: theme.colors.navy, fontSize: 13, fontWeight: '700' },
  successHint: { color: theme.colors.muted, fontSize: 12, marginTop: 10 },

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
