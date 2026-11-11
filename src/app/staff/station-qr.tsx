import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { Card, EmptyState, InfoNote, ListCard, PrimaryButton, Section, SubScreen, formatDateTime } from '../../components/dashboard';
import { getSession } from '../../lib/session';
import { getStationCheckins, getStationQr } from '../../services/movementApi';
import { theme } from '../../theme';

type Checkin = Awaited<ReturnType<typeof getStationCheckins>>['checkins'][number];

const REFRESH_BEFORE_EXPIRY_MS = 8000;
const CHECKIN_POLL_MS = 5000;

export default function StationQrScreen() {
  const [qrValue, setQrValue] = useState('');
  const [station, setStation] = useState('');
  const [expiresAt, setExpiresAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState('');
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const active = useRef(false);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadQr = useCallback(async () => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    const session = await getSession();
    if (!session) {
      router.replace('/');
      return;
    }
    try {
      const res = await getStationQr(session.token);
      if (!active.current) return;
      setQrValue(res.qrValue);
      setStation(res.station);
      const exp = new Date(res.expiresAt).getTime();
      setExpiresAt(exp);
      setError('');
      // Rotate automatically shortly before the code expires.
      refreshTimer.current = setTimeout(() => { if (active.current) loadQr(); }, Math.max(5000, exp - Date.now() - REFRESH_BEFORE_EXPIRY_MS));
    } catch (e) {
      if (!active.current) return;
      setError(e instanceof Error ? e.message : 'Unable to load the station QR code.');
      refreshTimer.current = setTimeout(() => { if (active.current) loadQr(); }, 10000);
    }
  }, []);

  const loadCheckins = useCallback(async () => {
    const session = await getSession();
    if (!session) return;
    const res = await getStationCheckins(session.token).catch(() => null);
    if (res && active.current) setCheckins(res.checkins || []);
  }, []);

  useFocusEffect(useCallback(() => {
    active.current = true;
    loadQr();
    loadCheckins();
    const poll = setInterval(loadCheckins, CHECKIN_POLL_MS);
    return () => {
      active.current = false;
      clearInterval(poll);
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, [loadQr, loadCheckins]));

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadQr(), loadCheckins()]);
    setRefreshing(false);
  };

  const secondsLeft = Math.max(0, Math.ceil((expiresAt - now) / 1000));

  return (
    <SubScreen title="Station QR" subtitle="Students scan this code to check out or check in" refreshing={refreshing} onRefresh={onRefresh}>
      <Card centered>
        <Text style={styles.stationLabel}>Station</Text>
        <Text style={styles.stationName} numberOfLines={1}>{station || '—'}</Text>

        <View style={styles.qrWrap}>
          {qrValue && !error ? (
            <QRCode value={qrValue} size={240} color={theme.colors.navy} backgroundColor="#ffffff" />
          ) : (
            <View style={styles.qrPlaceholder}>
              <Text style={styles.placeholderText}>{error || 'Loading…'}</Text>
            </View>
          )}
        </View>

        {qrValue && !error ? (
          <View style={styles.timer}>
            <Text style={styles.timerText}>Refreshes automatically · {secondsLeft}s</Text>
          </View>
        ) : null}

        <View style={styles.actions}>
          <PrimaryButton variant="ghost" icon="refresh-outline" label="Refresh now" onPress={loadQr} />
        </View>
      </Card>

      <InfoNote icon="shield-checkmark-outline">
        The code changes every minute, so photos or screenshots of it stop working. Ask each student to show you their confirmation screen after scanning.
      </InfoNote>

      <Section title="Recent check-ins" subtitle={checkins.length ? `${checkins.length} in last 12h` : undefined}>
        {checkins.length === 0 ? (
          <EmptyState icon="people-outline" title="No check-ins yet" message="Students who scan this station's QR code will appear here in real time." />
        ) : (
          checkins.map((item, index) => (
            <ListCard
              key={`${item.exitId}-${item.action}-${index}`}
              icon={item.action === 'departure' ? 'exit-outline' : 'enter-outline'}
              iconColor={item.action === 'departure' ? theme.colors.navySoft : theme.colors.emerald}
              iconBg={item.action === 'departure' ? '#e4eefc' : '#e3f5ee'}
              title={item.name}
              subtitle={`${item.exitId} · ${item.route} · ${formatDateTime(item.at)}`}
              status={item.action === 'departure' ? 'Departed' : 'Returned'}
            />
          ))
        )}
      </Section>
    </SubScreen>
  );
}

const styles = StyleSheet.create({
  stationLabel: { color: theme.colors.muted, fontSize: 12, fontWeight: '700' },
  stationName: { alignSelf: 'stretch', textAlign: 'center', color: theme.colors.navy, fontSize: 22, fontWeight: '800', marginTop: 2 },
  qrWrap: { marginTop: 16, padding: 14, borderRadius: 20, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: '#fff' },
  qrPlaceholder: { width: 240, height: 240, alignItems: 'center', justifyContent: 'center', padding: 16 },
  placeholderText: { color: theme.colors.muted, fontSize: 13, textAlign: 'center' },
  timer: { marginTop: 14, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999, backgroundColor: '#e3f5ee' },
  timerText: { color: theme.colors.emerald, fontSize: 13, fontWeight: '700' },
  actions: { alignSelf: 'stretch', marginTop: 14 }
});
