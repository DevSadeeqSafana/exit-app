import { router } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';
import { Card, ChipGroup, FormField, InfoNote, PrimaryButton, Section, SubScreen } from '../../components/dashboard';
import { getSession } from '../../lib/session';
import { createExitRequest } from '../../services/movementApi';

const COMMON_ROUTES = ['Hostel → Campus', 'Campus → Hostel', 'Campus → Off-campus', 'Hostel → Off-campus'];

export default function ExitRequestScreen() {
  const [route, setRoute] = useState(COMMON_ROUTES[0]);
  const [destination, setDestination] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  const canSubmit = route.trim().length > 0 && reason.trim().length > 0;

  const submit = async () => {
    if (!canSubmit) {
      Alert.alert('Missing details', 'Please choose a route and tell us the reason for your exit.');
      return;
    }
    const session = await getSession();
    if (!session) {
      router.replace('/');
      return;
    }

    try {
      setLoading(true);
      const result = await createExitRequest(session.token, route.trim(), reason.trim(), destination.trim() || 'Campus');
      Alert.alert(
        'Request submitted',
        result.exit?.id ? `Request ${result.exit.id} is now awaiting staff approval.` : 'Your request is now awaiting staff approval.'
      );
      router.back();
    } catch (error) {
      Alert.alert('Unable to submit', error instanceof Error ? error.message : 'Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SubScreen title="New exit request" subtitle="Apply for campus or hostel movement approval">
      <Section title="Route">
        <ChipGroup options={COMMON_ROUTES} value={route} onChange={setRoute} />
        <FormField label="Or enter a custom route" value={route} onChangeText={setRoute} maxLength={100} placeholder="e.g. Hostel → Teaching Hospital" />
      </Section>

      <Card>
        <Section title="Details">
          <FormField
            label="Destination"
            value={destination}
            onChangeText={setDestination}
            maxLength={100}
            placeholder="e.g. University Library"
            hint="Optional — defaults to Campus"
          />
          <FormField
            label="Reason"
            value={reason}
            onChangeText={setReason}
            multiline
            numberOfLines={4}
            maxLength={500}
            placeholder="Briefly explain why you need to leave"
          />
        </Section>
      </Card>

      <InfoNote>Once staff approve your request, scan the station QR code at the gate (Gate check-in) as you leave and when you return.</InfoNote>

      <PrimaryButton icon="paper-plane-outline" label="Submit request" onPress={submit} loading={loading} disabled={!canSubmit} />
    </SubScreen>
  );
}
