import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { saveSession } from '../lib/session';
import { devPreviewLogin, login, type AuthRole } from '../services/movementApi';
import { theme } from '../theme';

WebBrowser.maybeCompleteAuthSession();

const googleClientIds = {
  iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID
};

const configuredClientId = Platform.select({
  ios: googleClientIds.iosClientId,
  android: googleClientIds.androidClientId,
  default: googleClientIds.webClientId
});

// Developer role preview: skip Google sign-in during testing/review.
// Hidden unless EXPO_PUBLIC_DEV_ROLE_PREVIEW=true; the backend must also allow it.
const devRolePreviewEnabled = process.env.EXPO_PUBLIC_DEV_ROLE_PREVIEW === 'true';

type LoginResult = { success: boolean; role?: AuthRole; token: string; user: any };

const KNOWN_ROLES: AuthRole[] = ['student', 'staff', 'admin'];

// The role comes from the backend, which detects it from the account email.
async function startSession(result: LoginResult, preview = false) {
  const role = result.role;
  if (!result.success || !result.token || !role || !KNOWN_ROLES.includes(role)) {
    throw new Error('The server could not create a movement session.');
  }

  await saveSession({
    token: result.token,
    role,
    preview,
    user: {
      name: result.user?.StudentName || result.user?.name || result.user?.FirstName || 'User',
      email: result.user?.EmailAddress || result.user?.OfficialEmailAddress || result.user?.email,
      station: result.user?.station || 'Campus',
      StudentID: result.user?.StudentID,
      StaffID: result.user?.StaffID
    }
  });

  const destination = role === 'student' ? '/student/dashboard' : role === 'staff' ? '/staff/dashboard' : '/admin/dashboard';
  router.replace(destination);
}

const SAMPLE_ACCOUNTS: Array<{ id: AuthRole; label: string }> = [
  { id: 'student', label: 'Student' },
  { id: 'staff', label: 'Staff' },
  { id: 'admin', label: 'Admin' }
];

function DevPreview() {
  const [identifier, setIdentifier] = useState('');
  const [loading, setLoading] = useState<string | null>(null);

  const run = async (key: string, input: { identifier: string } | { sample: AuthRole }) => {
    try {
      setLoading(key);
      const result = await devPreviewLogin(input);
      await startSession(result, true);
    } catch (error) {
      Alert.alert('Preview sign-in failed', error instanceof Error ? error.message : 'Unable to start a preview session.');
    } finally {
      setLoading(null);
    }
  };

  const continueWithEmail = () => {
    const value = identifier.trim();
    if (!value) {
      Alert.alert('Email required', 'Enter a university email, or pick a sample account below.');
      return;
    }
    run('email', { identifier: value });
  };

  return (
    <View style={styles.previewBox}>
      <Text style={styles.previewTitle}>Developer preview</Text>
      <Text style={styles.previewHelper}>
        Skip Google for testing. Enter an email and the account type is detected automatically, the same way as Google sign-in.
      </Text>
      <TextInput
        style={styles.previewInput}
        value={identifier}
        onChangeText={setIdentifier}
        placeholder="e.g. name003@cosmopolitan.edu.ng"
        placeholderTextColor="#8a97a8"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
      />
      <Pressable style={styles.previewButton} onPress={continueWithEmail} disabled={loading !== null}>
        {loading === 'email' ? <ActivityIndicator color="#fff" /> : <Text style={styles.previewButtonText}>Continue (preview)</Text>}
      </Pressable>
      <Text style={styles.previewSampleLabel}>Or use a sample account</Text>
      <View style={styles.previewSampleRow}>
        {SAMPLE_ACCOUNTS.map((item) => (
          <Pressable key={item.id} style={styles.previewSample} onPress={() => run(item.id, { sample: item.id })} disabled={loading !== null}>
            {loading === item.id ? <ActivityIndicator color={theme.colors.navy} /> : <Text style={styles.previewSampleText}>{item.label}</Text>}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function GoogleSignInButton({ clientId }: { clientId: string }) {
  const [loading, setLoading] = useState(false);
  const processedAccessToken = useRef<string | null>(null);
  const [request, response, promptAsync] = Google.useAuthRequest({ clientId, selectAccount: true });

  useEffect(() => {
    if (!response) return;
    if (response.type === 'error') {
      Alert.alert('Google sign-in failed', response.error?.message || 'Google could not complete sign-in. Please try again.');
      return;
    }
    if (response.type !== 'success') return;

    const accessToken = response.authentication?.accessToken || response.params?.access_token;
    if (!accessToken) {
      Alert.alert('Google sign-in failed', 'Google did not return an access token. Please try again.');
      return;
    }
    if (processedAccessToken.current === accessToken) return;
    processedAccessToken.current = accessToken;

    const completeSignIn = async () => {
      try {
        setLoading(true);
        const result = await login(accessToken);
        await startSession(result);
      } catch (error) {
        Alert.alert('Sign-in failed', error instanceof Error ? error.message : 'Unable to sign in right now.');
      } finally {
        setLoading(false);
      }
    };

    completeSignIn();
  }, [response]);

  const handleGoogleSignIn = async () => {
    if (!request) {
      Alert.alert('Google sign-in unavailable', 'The sign-in request could not be initialized. Check the Google OAuth client configuration.');
      return;
    }

    processedAccessToken.current = null;
    try {
      await promptAsync();
    } catch (error) {
      Alert.alert('Google sign-in failed', error instanceof Error ? error.message : 'Unable to open Google sign-in.');
    }
  };

  return (
    <Pressable style={styles.primaryButton} onPress={handleGoogleSignIn} disabled={loading}>
      {loading ? <ActivityIndicator color={theme.colors.navy} /> : <Text style={styles.primaryButtonText}>Sign in with Google</Text>}
    </Pressable>
  );
}

export default function LoginScreen() {
  const missingClientId = () => {
    Alert.alert(
      'Google sign-in is not configured',
      `Set EXPO_PUBLIC_GOOGLE_${Platform.OS === 'ios' ? 'IOS' : Platform.OS === 'android' ? 'ANDROID' : 'WEB'}_CLIENT_ID in mobile-app/.env.`
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.logoWrap}>
          <View style={styles.logoBadge}>
            <Image
              source={require('../../assets/cu-logo.png')}
              style={styles.logoImage}
              resizeMode="contain"
              accessibilityLabel="Cosmopolitan University logo"
            />
          </View>
          <Text style={styles.brandName}>Cosmopolitan University</Text>
          <Text style={styles.subtitle}>Movement and Transportation Management</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.heading}>Continue with Google</Text>
          <Text style={styles.helper}>Sign in with your university email. We'll recognise whether you're a student or staff member automatically.</Text>

          {configuredClientId ? (
            <GoogleSignInButton clientId={configuredClientId} />
          ) : (
            <Pressable style={styles.primaryButton} onPress={missingClientId}>
              <Text style={styles.primaryButtonText}>Sign in with Google</Text>
            </Pressable>
          )}
          <Text style={styles.note}>Access is granted only after Google verifies your account and it matches an active university record.</Text>

          {devRolePreviewEnabled && <DevPreview />}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.navy },
  container: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 22, paddingTop: 32, paddingBottom: 42, backgroundColor: '#0b2a5b' },
  logoWrap: { alignItems: 'center', marginBottom: 24 },
  logoBadge: {
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6
  },
  logoImage: { width: 100, height: 100 },
  brandName: { color: '#fff', fontSize: 28, fontWeight: '700', marginTop: 16, textAlign: 'center' },
  subtitle: { color: '#dfeeff', fontSize: 14, marginTop: 6, textAlign: 'center' },
  card: { backgroundColor: '#fff', borderRadius: 24, padding: 22 },
  heading: { color: theme.colors.navy, fontSize: 24, fontWeight: '700' },
  helper: { color: '#5f7188', fontSize: 14, lineHeight: 20, marginTop: 8, marginBottom: 18 },
  primaryButton: { backgroundColor: theme.colors.gold, borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  primaryButtonText: { color: theme.colors.navy, fontSize: 15, fontWeight: '800' },
  note: { color: '#617089', fontSize: 12, lineHeight: 18, marginTop: 14, textAlign: 'center' },
  previewBox: { marginTop: 20, padding: 14, borderRadius: 14, borderWidth: 1, borderStyle: 'dashed', borderColor: '#d9a441', backgroundColor: '#fff8ea' },
  previewTitle: { color: '#8a5a00', fontSize: 14, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  previewHelper: { color: '#6b5a3a', fontSize: 12, lineHeight: 17, marginTop: 6, marginBottom: 10 },
  previewInput: { borderWidth: 1, borderColor: '#e6d3ad', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: theme.colors.navy, backgroundColor: '#fff', marginBottom: 10 },
  previewButton: { backgroundColor: theme.colors.navy, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  previewButtonText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  previewSampleLabel: { color: '#6b5a3a', fontSize: 12, fontWeight: '600', marginTop: 14, marginBottom: 8, textAlign: 'center' },
  previewSampleRow: { flexDirection: 'row', gap: 8 },
  previewSample: { flex: 1, borderWidth: 1, borderColor: '#e6d3ad', backgroundColor: '#fff', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  previewSampleText: { color: theme.colors.navy, fontSize: 13, fontWeight: '700' }
});
