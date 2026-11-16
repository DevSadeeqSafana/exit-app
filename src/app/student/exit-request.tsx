import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { Card, ChipGroup, FormField, InfoNote, LoadingBlock, PrimaryButton, Section, SubScreen } from '../../components/dashboard';
import { getSession } from '../../lib/session';
import { ApiError, createExitRequest, getExitOptions, type ExitOptions } from '../../services/movementApi';

const COMMON_ROUTES = ['Hostel → Campus', 'Campus → Hostel', 'Campus → Off-campus', 'Hostel → Off-campus'];

const formatMinutes = (minutes: number) => {
  if (minutes < 60) return `${minutes} minutes`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h} hour${h === 1 ? '' : 's'}${m ? ` ${m} minutes` : ''}`;
};

export default function ExitRequestScreen() {
  const [route, setRoute] = useState(COMMON_ROUTES[0]);
  const [destination, setDestination] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<ExitOptions | null>(null);
  const [optionsLoading, setOptionsLoading] = useState(true);

  // The rules come from the Staff Portal (Student Movement > Settings) and are checked
  // again by the server on submit; checking here just saves the student a wasted attempt.
  const loadOptions = useCallback(async () => {
    const session = await getSession();
    if (!session) {
      router.replace('/');
      return;
    }
    try {
      const res = await getExitOptions(session.token);
      setOptions(res.options);
    } catch {
      setOptions(null); // the server still enforces the rules on submit
    } finally {
      setOptionsLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    loadOptions();
  }, [loadOptions]));

  const hasList = !!options && options.destinations.length > 0;
  const outsideHours = !!options && !options.withinExitHours;
  const atLimit = !!options && options.openRequests >= options.maxOpenRequests;
  const blocked = outsideHours || atLimit;

  const canSubmit =
    !blocked && route.trim().length > 0 && reason.trim().length > 0 && (!hasList || options!.destinations.includes(destination));

  const submit = async () => {
    if (!canSubmit) {
      Alert.alert(
        'Missing details',
        hasList ? 'Choose a route and a destination, and tell us the reason for your exit.' : 'Please choose a route and tell us the reason for your exit.'
      );
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
        result.exit?.id
          ? `Request ${result.exit.id} is waiting for approval. You'll see the decision here, and your exit QR once it's approved.`
          : "Your request is waiting for approval. You'll see the decision here."
      );
      router.back();
    } catch (error) {
      // outside_hours / destination / open_request: the server's message explains the rule.
      if (error instanceof ApiError && ['outside_hours', 'destination', 'open_request'].includes(error.code || '')) {
        Alert.alert('Request not allowed', error.message);
        loadOptions();
      } else {
        Alert.alert('Unable to submit', error instanceof Error ? error.message : 'Please try again later.');
      }
    } finally {
      setLoading(false);
    }
  };

  if (optionsLoading) {
    return (
      <SubScreen title="New exit request" subtitle="Ask for permission to leave campus">
        <LoadingBlock />
      </SubScreen>
    );
  }

  return (
    <SubScreen title="New exit request" subtitle="Ask for permission to leave campus">
      {outsideHours && (
        <InfoNote icon="time-outline">
          Exit requests can only be made between {options!.exitHoursStart} and {options!.exitHoursEnd}. Please try again then.
        </InfoNote>
      )}
      {atLimit && (
        <InfoNote icon="alert-circle-outline">
          {options!.maxOpenRequests === 1
            ? 'You already have an exit request in progress. Wait until it is decided, or until you return, before making another.'
            : `You already have ${options!.openRequests} exit requests in progress (the limit is ${options!.maxOpenRequests}).`}
        </InfoNote>
      )}

      <Section title="Route">
        <ChipGroup options={COMMON_ROUTES} value={route} onChange={setRoute} />
        <FormField label="Or enter a custom route" value={route} onChangeText={setRoute} maxLength={100} placeholder="e.g. Hostel → Teaching Hospital" />
      </Section>

      <Card>
        <Section title="Details">
          {hasList ? (
            <Section title="Destination" subtitle="Choose one">
              <ChipGroup options={options!.destinations} value={destination} onChange={setDestination} />
            </Section>
          ) : (
            <FormField
              label="Destination"
              value={destination}
              onChangeText={setDestination}
              maxLength={100}
              placeholder="e.g. Pharmacy opposite the main gate"
              hint="Optional — defaults to Campus"
            />
          )}
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

      <InfoNote>
        Once your request is approved, open "My exit QR" and show the code to security at the gate as you leave, and again when you come back.
        {options ? ` Please return within ${formatMinutes(options.returnDeadlineMinutes)}.` : ''}
      </InfoNote>

      <PrimaryButton icon="paper-plane-outline" label="Submit request" onPress={submit} loading={loading} disabled={!canSubmit} />
    </SubScreen>
  );
}
