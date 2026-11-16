import Ionicons from '@expo/vector-icons/Ionicons';
import Constants from 'expo-constants';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Image, StyleSheet, Text, View } from 'react-native';
import {
  Card,
  InfoNote,
  LoadingBlock,
  PrimaryButton,
  Section,
  SubScreen,
  initials,
  type IconName
} from '../../components/dashboard';
import { clearSession, getSession } from '../../lib/session';
import { getMe, photoUrl, type StudentProfile } from '../../services/movementApi';
import { theme } from '../../theme';

const c = theme.colors;

// "computer science" -> "Computer Science"; the backend's placeholder for a missing course -> null.
const courseName = (value?: string | null) => {
  const text = String(value || '').trim();
  if (!text || /course not found/i.test(text)) return null;
  return text.replace(/(^|\s)([a-z])/g, (_match, space: string, ch: string) => space + ch.toUpperCase());
};

const facultyName = (value?: string | null) => {
  const text = String(value || '').trim();
  return !text || /no faculty name/i.test(text) ? null : text;
};

export default function StudentProfileScreen() {
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const session = await getSession();
    if (!session) {
      router.replace('/');
      return;
    }
    const res = await getMe(session.token);
    setProfile(res.user);
  }, []);

  const reportError = (error: unknown) =>
    Alert.alert('Unable to load your profile', error instanceof Error ? error.message : 'Please try again.');

  useFocusEffect(useCallback(() => {
    load().catch(reportError).finally(() => setLoading(false));
  }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load().catch(reportError);
    setRefreshing(false);
  };

  const signOut = () =>
    Alert.alert('Sign out?', 'You will need to sign in again with your university Google account.', [
      { text: 'Stay signed in', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          await clearSession();
          router.replace('/');
        }
      }
    ]);

  const name = profile?.name || [profile?.FirstName, profile?.Surname].filter(Boolean).join(' ') || 'Student';
  const course = courseName(profile?.StudentCourse);
  const level = profile?.StudentLevel ? `${profile.StudentLevel} Level` : null;
  const version = Constants.expoConfig?.version;

  return (
    <SubScreen title="My profile" subtitle="Your details as the university holds them" refreshing={refreshing} onRefresh={onRefresh}>
      {loading ? (
        <LoadingBlock />
      ) : !profile ? (
        <InfoNote icon="alert-circle-outline">Your profile could not be loaded. Pull down to try again.</InfoNote>
      ) : (
        <>
          <Card centered>
            <Photo uri={photoUrl(profile.photoPath)} name={name} />
            <Text style={styles.name}>{name}</Text>
            <Text style={styles.id}>{profile.StudentID}</Text>
          </Card>

          <InfoNote icon="shield-checkmark-outline">
            {profile.photoPath
              ? 'This is the photo security will see when they scan your exit QR at the gate.'
              : 'You have no passport photo on record. Security may ask for your ID card at the gate. Ask the university to add one to your record.'}
          </InfoNote>

          <Section title="Details">
            <Card>
              <Row icon="school-outline" label="Course" value={[profile.CourseCode, course].filter(Boolean).join(' · ') || '—'} />
              <Row icon="layers-outline" label="Level" value={level || '—'} />
              <Row icon="business-outline" label="Faculty" value={facultyName(profile.StudentFaculty) || '—'} />
              <Row icon="call-outline" label="Phone" value={profile.PhoneNumber || '—'} />
              <Row icon="mail-outline" label="Email" value={profile.email || '—'} last />
            </Card>
          </Section>

          <InfoNote icon="information-circle-outline">
            Something wrong? Ask the university to correct your record. The app shows what the university holds and cannot change it.
          </InfoNote>

          <PrimaryButton icon="log-out-outline" label="Sign out" variant="navy" onPress={signOut} />
          {version ? <Text style={styles.version}>CUA Movement · version {version}</Text> : null}
        </>
      )}
    </SubScreen>
  );
}

function Photo({ uri, name }: { uri: string | null; name: string }) {
  const [failed, setFailed] = useState(false);
  if (uri && !failed) {
    return (
      <Image
        source={{ uri }}
        style={styles.photo}
        onError={() => setFailed(true)}
        accessibilityLabel={`Passport photo of ${name}`}
      />
    );
  }
  return (
    <View style={[styles.photo, styles.photoFallback]}>
      <Text style={styles.photoInitials}>{initials(name)}</Text>
    </View>
  );
}

function Row({ icon, label, value, last }: { icon: IconName; label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.row, !last && styles.rowDivider]}>
      <Ionicons name={icon} size={18} color={c.navySoft} />
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowValue} selectable>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  photo: { width: 120, height: 120, borderRadius: 60, backgroundColor: c.slate },
  photoFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: c.gold },
  photoInitials: { color: c.navy, fontSize: 40, fontWeight: '800' },
  name: { color: c.text, fontSize: 19, fontWeight: '800', marginTop: 12, textAlign: 'center' },
  id: { color: c.muted, fontSize: 14, marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: c.border },
  rowText: { flex: 1, minWidth: 0 },
  rowLabel: { color: c.muted, fontSize: 12, fontWeight: '700' },
  rowValue: { color: c.text, fontSize: 14, marginTop: 1 },
  version: { color: c.muted, fontSize: 12, textAlign: 'center', marginTop: 4 }
});
