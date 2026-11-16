import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ExitRequest } from '../services/movementApi';
import { theme } from '../theme';

const c = theme.colors;

/* --------------------------------- Time --------------------------------- */

/** Milliseconds to add to the phone's clock to match the server (from a response's serverTime). */
export function serverOffset(serverTime?: string | null) {
  const t = serverTime ? Date.parse(serverTime) : NaN;
  return Number.isNaN(t) ? 0 : t - Date.now();
}

/** The current time on the server's clock, refreshed every `everyMs`. */
export function useServerNow(offsetMs: number, everyMs = 15000) {
  const [now, setNow] = useState(() => Date.now() + offsetMs);
  useEffect(() => {
    setNow(Date.now() + offsetMs);
    const timer = setInterval(() => setNow(Date.now() + offsetMs), everyMs);
    return () => clearInterval(timer);
  }, [offsetMs, everyMs]);
  return now;
}

export function formatClock(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function formatMinutes(minutes: number) {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h} h ${rest} min` : `${h} h`;
}

const minutesBetween = (from: number, to: number) => Math.floor((to - from) / 60000);

/* -------------------------------- Banners -------------------------------- */

/**
 * Shown while the student is off campus (Verified): "back by 3:40 PM" with a countdown,
 * red once overdue, and a button for the return QR.
 */
export function OffCampusBanner({ exit, now, onShowQr }: { exit: ExitRequest; now: number; onShowQr: () => void }) {
  const returnBy = exit.returnBy ? Date.parse(exit.returnBy) : NaN;
  const known = !Number.isNaN(returnBy);
  const left = known ? minutesBetween(now, returnBy) : 0;
  const overdue = known && now >= returnBy;
  const soon = known && !overdue && left < 15;

  const tone = overdue ? styles.danger : soon ? styles.warning : styles.info;
  const fg = overdue ? c.danger : soon ? c.amber : c.navySoft;

  return (
    <View style={[styles.banner, tone]} accessibilityRole="summary">
      <View style={styles.row}>
        <Ionicons name={overdue ? 'alert-circle' : 'walk-outline'} size={22} color={fg} />
        <View style={styles.text}>
          <Text style={[styles.title, { color: fg }]}>
            {known ? `You're off campus · back by ${formatClock(exit.returnBy)}` : "You're off campus"}
          </Text>
          <Text style={styles.caption}>
            {!known
              ? `${exit.destination || exit.route} · scan your return QR at the gate when you are back.`
              : overdue
                ? `Overdue by ${formatMinutes(minutesBetween(returnBy, now))}. Return to campus now.`
                : `${formatMinutes(left)} left · ${exit.destination || exit.route}`}
          </Text>
        </View>
      </View>
      <Pressable
        onPress={onShowQr}
        accessibilityRole="button"
        style={({ pressed }) => [styles.button, { backgroundColor: fg }, pressed && styles.pressed]}
      >
        <Ionicons name="qr-code-outline" size={16} color={c.white} />
        <Text style={styles.buttonText}>Show return QR</Text>
      </Pressable>
    </View>
  );
}

/** Shown while a request waits for a decision in the Staff Portal. */
export function PendingBanner({ exit, now, onPress }: { exit: ExitRequest; now: number; onPress: () => void }) {
  const submitted = Date.parse(exit.time);
  const waited = Number.isNaN(submitted) ? null : Math.max(0, minutesBetween(submitted, now));
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.banner, styles.warning, pressed && styles.pressed]}
    >
      <View style={styles.row}>
        <Ionicons name="hourglass-outline" size={22} color={c.amber} />
        <View style={styles.text}>
          <Text style={[styles.title, { color: c.amber }]}>Waiting for approval</Text>
          <Text style={styles.caption}>
            {waited === null ? 'Submitted' : waited < 1 ? 'Submitted just now' : `Submitted ${formatMinutes(waited)} ago`}
            {` · ${exit.destination || exit.route}`}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={c.muted} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: { borderRadius: theme.radius.md, padding: 14, borderWidth: 1, gap: 12 },
  info: { backgroundColor: '#e8f0fb', borderColor: '#d3e1f4' },
  warning: { backgroundColor: '#fdf1df', borderColor: '#f5dcb4' },
  danger: { backgroundColor: '#fbe9e7', borderColor: '#f2c6c0' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  text: { flex: 1, minWidth: 0 },
  title: { fontSize: 15, fontWeight: '800' },
  caption: { color: '#3d4f66', fontSize: 13, lineHeight: 19, marginTop: 2 },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10
  },
  buttonText: { color: c.white, fontSize: 13, fontWeight: '700' },
  pressed: { opacity: 0.75 }
});
