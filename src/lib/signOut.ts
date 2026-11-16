import { router } from 'expo-router';
import { tearDownNotifications } from './notifications';
import { clearSession, getSession } from './session';

/** Signs out: this phone stops receiving notifications, the session is cleared, back to sign-in. */
export async function signOut() {
  const session = await getSession();
  await tearDownNotifications(session?.token);
  await clearSession();
  router.replace('/');
}
