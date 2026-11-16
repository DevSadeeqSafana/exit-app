import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { AndroidImportance, IosAuthorizationStatus } from 'expo-notifications';
import { Alert, Platform } from 'react-native';
import { registerPushToken, removePushToken, type ExitRequest } from '../services/movementApi';

// Student notifications (features plan, Phase 6):
//   - remote push from the server when the Staff Portal approves or rejects a request
//     (needs a development/EAS build: Expo Go on Android cannot receive remote push);
//   - a local reminder 15 minutes before the return deadline while off campus
//     (works in Expo Go too).
// Every function here is best effort: a failure never blocks the screen that calls it.

const CHANNEL_ID = 'movement'; // the server sends with this channelId
const PUSH_TOKEN_KEY = 'movement_push_token_v1';
const ASKED_KEY = 'movement_push_asked_v1';
const REMINDERS_KEY = 'movement_return_reminders_v1'; // { [exitId]: { id, at } }
export const REMINDER_MINUTES_BEFORE = 15;

// Show notifications while the app is open, too.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false
  })
});

const isExpoGoAndroid = () =>
  Platform.OS === 'android' && Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

const projectId = () =>
  (Constants as any).easConfig?.projectId || (Constants.expoConfig as any)?.extra?.eas?.projectId || null;

async function ensureChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Exit requests',
    description: 'Decisions on your exit requests and return reminders',
    importance: AndroidImportance.HIGH
  });
}

/**
 * Asks once, with a short explanation first. Returns true when notifications are allowed.
 * The channel is created first: on Android 13+ the system prompt only appears after that.
 */
async function ensurePermission(): Promise<boolean> {
  await ensureChannel();
  const current = await Notifications.getPermissionsAsync();
  if (current.granted || current.ios?.status === IosAuthorizationStatus.PROVISIONAL) return true;
  if (!current.canAskAgain) return false;
  if (await AsyncStorage.getItem(ASKED_KEY)) return false;
  await AsyncStorage.setItem(ASKED_KEY, '1');

  const agreed = await new Promise<boolean>((resolve) =>
    Alert.alert(
      'Get notified?',
      'CUA Movement can tell you as soon as your exit request is approved or rejected, and remind you before your return time.',
      [
        { text: 'Not now', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Allow', onPress: () => resolve(true) }
      ]
    )
  );
  if (!agreed) return false;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted || asked.ios?.status === IosAuthorizationStatus.PROVISIONAL;
}

/**
 * After a student signs in: permission, then (where possible) the Expo push token, sent to the server.
 * In Expo Go on Android, or without an EAS projectId, only local reminders are set up.
 */
export async function setUpStudentNotifications(sessionToken: string) {
  try {
    if (!Device.isDevice) return;
    if (!(await ensurePermission())) return;
    if (isExpoGoAndroid()) return; // remote push needs a development build
    const id = projectId();
    if (!id) return; // run "eas init" to add extra.eas.projectId to app.json
    const { data: pushToken } = await Notifications.getExpoPushTokenAsync({ projectId: id });
    if (!pushToken) return;
    const saved = await AsyncStorage.getItem(PUSH_TOKEN_KEY);
    if (saved === pushToken) return; // already registered on this phone
    await registerPushToken(sessionToken, pushToken, Platform.OS);
    await AsyncStorage.setItem(PUSH_TOKEN_KEY, pushToken);
  } catch {
    // Network, server not configured (migration 096) or no permission: try again next time.
  }
}

/** Before signing out: the server stops sending to this phone; reminders are cleared. */
export async function tearDownNotifications(sessionToken?: string) {
  try {
    const pushToken = await AsyncStorage.getItem(PUSH_TOKEN_KEY);
    if (pushToken && sessionToken) await removePushToken(sessionToken, pushToken).catch(() => {});
    await AsyncStorage.removeItem(PUSH_TOKEN_KEY);
    await clearAllReminders();
  } catch {
    // Signing out must always work.
  }
}

/* ------------------------------ Return reminders ------------------------------ */

type ReminderMap = Record<string, { id: string; at: string }>;

async function readReminders(): Promise<ReminderMap> {
  try {
    return JSON.parse((await AsyncStorage.getItem(REMINDERS_KEY)) || '{}') as ReminderMap;
  } catch {
    return {};
  }
}

const writeReminders = (map: ReminderMap) => AsyncStorage.setItem(REMINDERS_KEY, JSON.stringify(map));

async function clearAllReminders() {
  const map = await readReminders();
  await Promise.all(Object.values(map).map((r) => Notifications.cancelScheduledNotificationAsync(r.id).catch(() => {})));
  await AsyncStorage.removeItem(REMINDERS_KEY);
}

/**
 * Keeps one reminder per off-campus request, at returnBy - 15 minutes, and removes reminders
 * for requests that are no longer off campus. Call with the student's request list.
 * offsetMs: server clock minus phone clock (the reminder fires on the phone's clock).
 */
export async function syncReturnReminders(exits: ExitRequest[], offsetMs = 0) {
  try {
    const permission = await Notifications.getPermissionsAsync();
    if (!permission.granted) return;
    await ensureChannel();

    const map = await readReminders();
    const out = exits.filter((e) => e.status === 'Verified' && e.returnBy);
    const keep = new Set(out.map((e) => e.id));

    // Back on campus (or cancelled / closed): drop the reminder.
    for (const [exitId, reminder] of Object.entries(map)) {
      if (!keep.has(exitId)) {
        await Notifications.cancelScheduledNotificationAsync(reminder.id).catch(() => {});
        delete map[exitId];
      }
    }

    for (const exit of out) {
      const returnBy = Date.parse(String(exit.returnBy));
      if (Number.isNaN(returnBy)) continue;
      const at = new Date(returnBy - REMINDER_MINUTES_BEFORE * 60000 - offsetMs);
      if (at.getTime() <= Date.now()) continue; // too late for a reminder
      if (map[exit.id]?.at === at.toISOString()) continue; // already scheduled for this time
      if (map[exit.id]) await Notifications.cancelScheduledNotificationAsync(map[exit.id].id).catch(() => {});
      const back = new Date(returnBy - offsetMs).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Return to campus soon',
          body: `You are due back by ${back}. Show your return QR at the gate.`,
          data: { type: 'return_reminder', exitId: exit.id },
          ...(Platform.OS === 'android' ? {} : { sound: 'default' })
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at, channelId: CHANNEL_ID }
      });
      map[exit.id] = { id, at: at.toISOString() };
    }
    await writeReminders(map);
  } catch {
    // Reminders are a convenience; the dashboard banner still shows the countdown.
  }
}

/** The exit request a tapped notification is about, if any ("EXT-12"). */
export function exitIdFromResponse(response: Notifications.NotificationResponse | null | undefined): string | null {
  const data = response?.notification?.request?.content?.data as Record<string, unknown> | undefined;
  const exitId = data && typeof data.exitId === 'string' ? data.exitId : null;
  return exitId && /^EXT-\d+$/.test(exitId) ? exitId : null;
}
