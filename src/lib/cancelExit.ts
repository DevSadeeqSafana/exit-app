import { Alert } from 'react-native';
import { cancelExitRequest } from '../services/movementApi';
import { getSession } from './session';

/**
 * Asks the student to confirm, then cancels the request. `onDone` runs afterwards whether
 * it worked or not, so the screen can reload and show the request's real status.
 */
export function confirmCancelExit(item: { id: string; status: string; route?: string }, onDone: () => void) {
  const approved = item.status === 'Approved';
  Alert.alert(
    'Cancel this request?',
    approved
      ? 'Your approval will be withdrawn and its QR code will stop working at the gate. You can make a new request later.'
      : 'Your request will be withdrawn before it is decided. You can make a new request later.',
    [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Cancel request',
        style: 'destructive',
        onPress: async () => {
          try {
            const session = await getSession();
            if (!session) return;
            const res = await cancelExitRequest(session.token, item.id);
            Alert.alert('Request cancelled', res.message || 'Your request has been cancelled.');
          } catch (error) {
            Alert.alert('Could not cancel', error instanceof Error ? error.message : 'Please try again.');
          } finally {
            onDone();
          }
        }
      }
    ]
  );
}
