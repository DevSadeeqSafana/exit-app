import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Image, Linking, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { EmptyState, InfoNote, LoadingBlock, Section, StatRow, SubScreen, initials } from '../../components/dashboard';
import { formatClock, formatMinutes } from '../../components/exitBanners';
import { getSession } from '../../lib/session';
import { getOffCampus, photoUrl, type OffCampusStudent } from '../../services/movementApi';
import { theme } from '../../theme';

// Who is off campus now, longest out first (features plan, Phase 5). Read-only, for staff
// whose group has the Off Campus page granted. "Mark returned" stays on the Staff Portal.

const c = theme.colors;

export default function OffCampusScreen() {
  const [students, setStudents] = useState<OffCampusStudent[]>([]);
  const [deadline, setDeadline] = useState<number | null>(null);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const session = await getSession();
    if (!session) {
      router.replace('/');
      return;
    }
    const res = await getOffCampus(session.token);
    setStudents(res.students || []);
    setDeadline(res.deadlineMinutes ?? null);
  }, []);

  const reportError = (error: unknown) =>
    Alert.alert('Unable to load', error instanceof Error ? error.message : 'Please try again.');

  useFocusEffect(useCallback(() => {
    load().catch(reportError).finally(() => setLoading(false));
    const timer = setInterval(() => { load().catch(() => {}); }, 60000);
    return () => clearInterval(timer);
  }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load().catch(reportError);
    setRefreshing(false);
  };

  const overdue = students.filter((s) => s.overdue);
  const shown = overdueOnly ? overdue : students;

  return (
    <SubScreen
      title="Off campus now"
      subtitle={deadline ? `Overdue after ${formatMinutes(deadline)} out` : 'Students checked out at the gate'}
      refreshing={refreshing}
      onRefresh={onRefresh}
    >
      {loading ? (
        <LoadingBlock />
      ) : (
        <>
          <StatRow
            items={[
              { icon: 'walk-outline', label: 'Off campus', value: students.length, color: c.navySoft },
              { icon: 'alert-circle-outline', label: 'Overdue', value: overdue.length, color: overdue.length ? c.danger : c.emerald }
            ]}
          />

          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Overdue only</Text>
            <Switch value={overdueOnly} onValueChange={setOverdueOnly} trackColor={{ true: c.danger }} />
          </View>

          <Section title={overdueOnly ? 'Overdue' : 'Students out'} subtitle={`${shown.length}`}>
            {shown.length === 0 ? (
              <EmptyState
                icon="checkmark-done-outline"
                title={overdueOnly ? 'No one is overdue' : 'No one is off campus'}
                message="Pull down to refresh. The list also refreshes every minute."
              />
            ) : (
              shown.map((s) => <StudentRow key={s.exitId} student={s} />)
            )}
          </Section>

          <InfoNote icon="desktop-outline">
            A student who came back without scanning can be marked as returned in the Staff Portal (Student Movement › Off Campus).
          </InfoNote>
        </>
      )}
    </SubScreen>
  );
}

function StudentRow({ student }: { student: OffCampusStudent }) {
  const [failed, setFailed] = useState(false);
  const uri = photoUrl(student.photoPath);
  const call = () => {
    if (student.phone) Linking.openURL(`tel:${student.phone}`).catch(() => Alert.alert('Cannot call', student.phone || ''));
  };
  return (
    <View style={[styles.card, student.overdue && styles.cardOverdue]}>
      <View style={styles.row}>
        {uri && !failed ? (
          <Image source={{ uri }} style={styles.photo} onError={() => setFailed(true)} />
        ) : (
          <View style={[styles.photo, styles.photoFallback]}>
            <Text style={styles.photoInitials}>{initials(student.name)}</Text>
          </View>
        )}
        <View style={styles.text}>
          <Text style={styles.name} numberOfLines={1}>{student.name}</Text>
          <Text style={styles.meta} numberOfLines={1}>
            {student.studentId}
            {student.courseCode ? ` · ${student.courseCode}` : ''}
            {student.level ? ` · ${student.level}L` : ''}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>{student.destination || student.route}</Text>
        </View>
        <View style={styles.right}>
          <Text style={[styles.out, student.overdue && { color: c.danger }]}>{formatMinutes(student.minutesOut)}</Text>
          <Text style={styles.since}>since {formatClock(student.departedAt)}</Text>
          {student.overdue ? (
            <View style={styles.overdueBadge}>
              <Text style={styles.overdueText}>OVERDUE</Text>
            </View>
          ) : null}
        </View>
      </View>
      {student.phone ? (
        <Pressable onPress={call} accessibilityRole="button" style={({ pressed }) => [styles.call, pressed && { opacity: 0.7 }]}>
          <Ionicons name="call-outline" size={15} color={c.navy} />
          <Text style={styles.callText}>Call {student.phone}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  switchLabel: { color: c.text, fontSize: 14, fontWeight: '700' },
  card: { backgroundColor: c.white, borderRadius: theme.radius.md, padding: 14, borderWidth: 1, borderColor: c.border, gap: 10 },
  cardOverdue: { borderColor: '#f2c6c0', backgroundColor: '#fffafa' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  photo: { width: 48, height: 48, borderRadius: 24, backgroundColor: c.slate },
  photoFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: c.gold },
  photoInitials: { color: c.navy, fontSize: 16, fontWeight: '800' },
  text: { flex: 1, minWidth: 0 },
  name: { color: c.text, fontSize: 15, fontWeight: '700' },
  meta: { color: c.muted, fontSize: 12, marginTop: 1 },
  right: { alignItems: 'flex-end' },
  out: { color: c.text, fontSize: 15, fontWeight: '800' },
  since: { color: c.muted, fontSize: 11, marginTop: 1 },
  overdueBadge: { marginTop: 4, backgroundColor: c.danger, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  overdueText: { color: c.white, fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  call: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: c.blueSoft, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  callText: { color: c.navy, fontSize: 12, fontWeight: '700' }
});
