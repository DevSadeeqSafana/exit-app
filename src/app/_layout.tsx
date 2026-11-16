import * as Notifications from 'expo-notifications';
import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { exitIdFromResponse } from '../lib/notifications';
import { getSession } from '../lib/session';

export default function RootLayout() {
  // A tapped notification (decision or return reminder) opens that request for a signed-in student.
  const response = Notifications.useLastNotificationResponse();
  useEffect(() => {
    const exitId = exitIdFromResponse(response);
    if (!exitId) return;
    (async () => {
      const session = await getSession();
      if (session?.role === 'student') router.push({ pathname: '/student/request/[id]', params: { id: exitId } });
      await Notifications.clearLastNotificationResponseAsync().catch(() => {});
    })();
  }, [response]);

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#f3f7fc' }
        }}
      />
    </>
  );
}
