import { Platform } from 'react-native';

const API_BASE_URL = (() => {
  const envBase = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (envBase) return envBase;
  if (Platform.OS === 'android') return 'http://10.0.2.2:4480';
  return 'http://localhost:4480';
})();

export type AuthRole = 'student' | 'staff' | 'admin';

type MovementRequestOptions = {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
};

async function request<T>(path: string, options: MovementRequestOptions = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(body?.message || 'Request failed');
  }

  return body as T;
}

type SessionResponse = { success: boolean; role: AuthRole; token: string; user: any; dashboard: any; preview?: boolean };

/**
 * Google sign-in. No role is sent: the backend detects student vs staff from the
 * email (digit before @ = student, letter = staff) and returns `role`.
 */
export async function login(accessToken: string) {
  return request<SessionResponse>('/movement/auth/google', {
    method: 'POST',
    body: JSON.stringify({ accessToken })
  });
}

/**
 * Developer preview: signs in without Google for testing/review.
 * Pass an email/ID (role detected like Google sign-in) or a sample account type.
 * Only works when the backend runs with MOVEMENT_DEV_PREVIEW=true and MODE=Dev.
 */
export async function devPreviewLogin(input: { identifier: string } | { sample: AuthRole }) {
  return request<SessionResponse>('/movement/auth/dev-preview', {
    method: 'POST',
    body: JSON.stringify(input)
  });
}

export async function getDashboard(token: string) {
  return request<{ success: boolean; dashboard: any }>(`/movement/dashboard`, {
    method: 'GET',
    headers: { 'euniversity-token': token }
  });
}

export async function createExitRequest(token: string, route: string, reason: string, destination: string) {
  return request<{ success: boolean; exit: any }>(`/movement/exits`, {
    method: 'POST',
    headers: { 'euniversity-token': token },
    body: JSON.stringify({ route, reason, destination })
  });
}

export async function getExitRequests(token: string) {
  return request<{ success: boolean; exits: any[] }>(`/movement/exits`, {
    method: 'GET',
    headers: { 'euniversity-token': token }
  });
}

export async function getBusList(token: string) {
  return request<{ success: boolean; buses: any[] }>(`/movement/buses`, {
    method: 'GET',
    headers: { 'euniversity-token': token }
  });
}

export async function getStations(token: string) {
  return request<{ success: boolean; stations: any[] }>(`/movement/stations`, {
    method: 'GET',
    headers: { 'euniversity-token': token }
  });
}

export async function approveExitRequest(token: string, exitId: string) {
  return request<{ success: boolean; exitId: string; status: string; message: string }>(`/movement/exits/${encodeURIComponent(exitId)}/approve`, {
    method: 'POST',
    headers: { 'euniversity-token': token }
  });
}

export async function rejectExitRequest(token: string, exitId: string) {
  return request<{ success: boolean; exitId: string; status: string; message: string }>(`/movement/exits/${encodeURIComponent(exitId)}/reject`, {
    method: 'POST',
    headers: { 'euniversity-token': token }
  });
}

export async function getReports(token: string) {
  return request<{ success: boolean; reports: any }>(`/movement/reports`, {
    method: 'GET',
    headers: { 'euniversity-token': token }
  });
}



/* ----------------------------- Station checkpoint ----------------------------- */
// Gate staff display a rotating station QR; students scan it to record departure/return.

export async function getStationQr(token: string) {
  return request<{ success: boolean; qrValue: string; station: string; expiresAt: string; ttlSeconds: number }>(`/movement/station-qr`, {
    method: 'POST',
    headers: { 'euniversity-token': token }
  });
}

export async function getStationCheckins(token: string) {
  return request<{
    success: boolean;
    station: string;
    checkins: Array<{ exitId: string; studentId: string; name: string; action: 'departure' | 'return'; route: string; at: string }>;
  }>(`/movement/station-qr/recent`, {
    method: 'GET',
    headers: { 'euniversity-token': token }
  });
}

export async function scanStationQr(token: string, qrValue: string, exitId?: string) {
  return request<{
    success: boolean;
    action: 'departure' | 'return';
    status: string;
    exitId: string;
    route: string;
    station: string;
    message: string;
    timestamp: string;
  }>(`/movement/checkpoint/scan`, {
    method: 'POST',
    headers: { 'euniversity-token': token },
    body: JSON.stringify(exitId ? { qrValue, exitId } : { qrValue })
  });
}
