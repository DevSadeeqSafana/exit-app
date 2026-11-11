import AsyncStorage from '@react-native-async-storage/async-storage';

export type AppSession = {
  token: string;
  role: 'student' | 'staff' | 'admin';
  /** True when the session came from the developer role preview (no Google sign-in). */
  preview?: boolean;
  user: {
    name?: string;
    email?: string;
    station?: string;
    StudentID?: string;
    StaffID?: string;
  };
};

const SESSION_KEY = 'movement_app_session_v1';

export async function saveSession(session: AppSession) {
  await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export async function getSession(): Promise<AppSession | null> {
  const value = await AsyncStorage.getItem(SESSION_KEY);
  if (!value) return null;
  try {
    return JSON.parse(value) as AppSession;
  } catch {
    return null;
  }
}

export async function clearSession() {
  await AsyncStorage.removeItem(SESSION_KEY);
}
