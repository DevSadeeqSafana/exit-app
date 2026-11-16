import { router } from 'expo-router';
import { Platform } from 'react-native';
import { clearSession } from '../lib/session';

export const API_BASE_URL = (() => {
  const envBase = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (envBase) return envBase;
  if (Platform.OS === 'android') return 'http://10.0.2.2:4480';
  return 'http://localhost:4480';
})();

export type AuthRole = 'student' | 'staff' | 'admin';

/**
 * An error from the movement API, with the server's `code` when it sent one:
 * - outside_hours / destination / open_request: a new exit request broke a rule (Staff Portal Settings)
 * - account_inactive: the account was deactivated; the app signs out
 * - retired: the action moved to the Staff Portal (an old app build called it)
 */
export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

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
    // The server checks on every request that the account is still active.
    if (response.status === 401 && body?.code === 'account_inactive') {
      await clearSession();
      router.replace('/');
    }
    throw new ApiError(body?.message || 'Request failed', response.status, body?.code);
  }

  return body as T;
}

const authed = (token: string) => ({ 'euniversity-token': token });

type SessionResponse = { success: boolean; role: AuthRole; token: string; user: any; dashboard: any; preview?: boolean };

/**
 * Google sign-in with the Google ID token. The backend verifies it is for this app,
 * finds the account by its email (student first, then staff; admin when IsAdmin) and
 * returns the `role`.
 */
export async function login(idToken: string) {
  return request<SessionResponse>('/movement/auth/google', {
    method: 'POST',
    body: JSON.stringify({ idToken })
  });
}

/**
 * Developer preview: signs in without Google for local testing.
 * Pass an email/ID (role found like Google sign-in) or a sample account type.
 * Only works against a backend on this machine or the local network with
 * MOVEMENT_DEV_PREVIEW=true and MODE=Dev.
 */
export async function devPreviewLogin(input: { identifier: string } | { sample: AuthRole }) {
  return request<SessionResponse>('/movement/auth/dev-preview', {
    method: 'POST',
    body: JSON.stringify(input)
  });
}

/** `canScanGate`: staff/admin hold the Gate Verification grant and may use the gate scanner. */
/** The signed-in student, as the university holds them. */
export type StudentProfile = {
  StudentID: string;
  name?: string;
  FirstName?: string;
  Surname?: string;
  email?: string;
  PhoneNumber?: string | null;
  CourseCode?: string | null;
  StudentCourse?: string | null; // course name (lower case), or "sorry course not found"
  StudentFaculty?: string | null;
  StudentLevel?: string | number | null;
  photoPath?: string | null; // relative to API_BASE_URL; see photoUrl()
};

export async function getMe(token: string) {
  return request<{ success: boolean; user: StudentProfile & Record<string, any> }>(`/movement/me`, { method: 'GET', headers: authed(token) });
}

export async function getDashboard(token: string) {
  return request<{ success: boolean; dashboard: any; canScanGate?: boolean; canStartBusTrip?: boolean; canSeeOffCampus?: boolean }>(`/movement/dashboard`, { method: 'GET', headers: authed(token) });
}

/* ------------------------------- Exit requests ------------------------------- */

export type ExitRequest = {
  id: string; // "EXT-12"
  student?: string;
  route: string;
  destination?: string;
  reason?: string;
  status: 'Pending' | 'Approved' | 'Rejected' | 'Verified' | 'Returned' | 'Cancelled' | string;
  time: string;
  decisionNote?: string | null;
  decidedAt?: string | null;
  cancelledAt?: string | null;
  departedAt?: string | null; // while off campus (Verified): when they left
  returnBy?: string | null; // while off campus: departedAt + the return deadline
  canGenerateQR?: boolean;
  canCancel?: boolean; // Pending, or Approved and not yet used at the gate
  nextQrAction?: 'departure' | 'return' | null;
};

/** serverTime lets the off-campus countdown use the server's clock, not the phone's. */
export async function getExitRequests(token: string) {
  return request<{ success: boolean; exits: ExitRequest[]; serverTime?: string; returnDeadlineMinutes?: number | null }>(
    `/movement/exits`,
    { method: 'GET', headers: authed(token) }
  );
}

export type TimelineStep = {
  type: 'submitted' | 'approved' | 'rejected' | 'departed' | 'returned' | 'cancelled' | string;
  at: string | null;
  label: string;
  note?: string | null;
};

/** One of the student's own requests, with its timeline. */
export async function getExitRequest(token: string, exitId: string) {
  return request<{ success: boolean; serverTime?: string; exit: ExitRequest & { timeline: TimelineStep[] } }>(
    `/movement/exits/${encodeURIComponent(exitId)}`,
    { method: 'GET', headers: authed(token) }
  );
}

/**
 * Withdraw a Pending or Approved request. Its QR codes stop working at the gate.
 * Refused with 409 (code 'not_cancellable') once the student has left campus or it was rejected.
 */
export async function cancelExitRequest(token: string, exitId: string) {
  return request<{ success: boolean; message: string; exit: ExitRequest }>(
    `/movement/exits/${encodeURIComponent(exitId)}/cancel`,
    { method: 'POST', headers: authed(token) }
  );
}

/** The rules a new request must meet (set in the Staff Portal: Student Movement > Settings). */
export type ExitOptions = {
  exitHoursStart: string; // "07:00"
  exitHoursEnd: string; // "18:00"
  timeZone: string; // "Africa/Lagos"
  withinExitHours: boolean;
  returnDeadlineMinutes: number;
  maxOpenRequests: number;
  openRequests: number;
  destinations: string[]; // empty: any destination may be typed
};

export async function getExitOptions(token: string) {
  return request<{ success: boolean; options: ExitOptions }>(`/movement/exit-options`, { method: 'GET', headers: authed(token) });
}

export async function createExitRequest(token: string, route: string, reason: string, destination: string) {
  return request<{ success: boolean; exit: ExitRequest }>(`/movement/exits`, {
    method: 'POST',
    headers: authed(token),
    body: JSON.stringify({ route, reason, destination })
  });
}

/**
 * The QR the student shows at the gate: an exit code for an Approved request, a return
 * code once they are out (Verified). Usable once, valid until `expiresAt` (5 minutes);
 * a new one expires the previous one. Security scans it in the Staff Portal.
 */
export async function generateExitQr(token: string, exitId: string) {
  return request<{ success: boolean; qrValue: string; exitId: string; type: 'departure' | 'return'; expiresAt: string }>(
    `/movement/qr/generate`,
    { method: 'POST', headers: authed(token), body: JSON.stringify({ exitId }) }
  );
}

/* ------------------------------- Gate scanner -------------------------------- */
// Staff/admin with the Gate Verification grant scan the student's exit QR.

export type GateExit = {
  id: string;
  status: string;
  route: string;
  destination?: string | null;
  reason?: string | null;
  decisionNote?: string | null;
  decidedAt?: string | null;
  decidedByName?: string | null;
  student: {
    studentId: string;
    name: string;
    courseCode?: string | null;
    level?: string | number | null;
    phone?: string | null;
    photoPath?: string | null; // relative to API_BASE_URL
  };
};

/**
 * Check a scanned code; changes nothing. On a refusal the thrown ApiError has `code`
 * (unreadable | invalid | used | expired | inactive | state) and `exit` when the request is known.
 */
export async function gateVerify(token: string, qrValue: string) {
  return gateRequest<{ success: boolean; action: 'departure' | 'return'; station: string; exit: GateExit }>('/movement/gate/verify', token, qrValue);
}

/** Record the exit or return at the officer's gate. */
export async function gateConfirm(token: string, qrValue: string) {
  return gateRequest<{ success: boolean; action: 'departure' | 'return'; station: string; message: string; exit: GateExit }>('/movement/gate/confirm', token, qrValue);
}

export class GateError extends ApiError {
  exit: GateExit | null;
  constructor(message: string, status: number, code: string | undefined, exit: GateExit | null) {
    super(message, status, code);
    this.exit = exit;
  }
}

async function gateRequest<T>(path: string, token: string, qrValue: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authed(token) },
    body: JSON.stringify({ qrValue })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && body?.code === 'account_inactive') {
      await clearSession();
      router.replace('/');
    }
    throw new GateError(body?.message || 'The code could not be checked', response.status, body?.code, body?.exit || null);
  }
  return body as T;
}

export const photoUrl = (photoPath?: string | null) => (photoPath ? `${API_BASE_URL.replace(/\/$/, '')}/${photoPath}` : null);

/* ------------------------------ Staff / admin views ------------------------------ */
// Requests are decided in the Staff Portal.

export async function getBusList(token: string) {
  return request<{ success: boolean; buses: any[] }>(`/movement/buses`, { method: 'GET', headers: authed(token) });
}

export async function getStations(token: string) {
  return request<{ success: boolean; stations: any[] }>(`/movement/stations`, { method: 'GET', headers: authed(token) });
}

export async function getReports(token: string) {
  return request<{ success: boolean; reports: any }>(`/movement/reports`, { method: 'GET', headers: authed(token) });
}

/* --------------------------------- Bus trips --------------------------------- */
// Staff with the Bus Boarding grant run a trip and show a QR that changes every 10 seconds;
// students scan it when boarding and again when getting off (features plan, Phase 4).

export type BusTripStatus = 'Boarding' | 'In Transit' | 'Arrived' | 'Completed';

export type BusTrip = {
  id: number;
  reference: string; // "BUS-12"
  busNumber: string;
  plateNumber: string | null;
  driver: string | null;
  capacity: number | null;
  origin: string | null;
  destination: string | null;
  route: string;
  status: BusTripStatus | string;
  startedBy: string | null;
  startedByName: string | null;
  departureTime: string | null;
  boardingClosedAt: string | null;
  arrivalTime: string | null;
  endedAt: string | null;
  createdAt: string;
  counts: { boarded: number; arrived: number; noArrival: number; removed: number };
};

export type BusPassenger = {
  studentId: string;
  name: string;
  status: 'Boarded' | 'Arrived' | 'No Arrival' | 'Removed' | string;
  boardedAt: string | null;
  arrivedAt: string | null;
  removedAt: string | null;
  removedByName: string | null;
};

export type BusCode = { qrValue: string; phase: 'boarding' | 'arrival'; refreshInSeconds: number; slotSeconds: number };

export type NewBusTrip = {
  origin: string;
  destination: string;
  busNumber: string;
  plateNumber: string;
  driver: string;
  departureTime?: string;
  capacity?: number | null;
};

export async function getBusStations(token: string) {
  return request<{ success: boolean; stations: string[]; defaultOrigin: string | null }>(`/movement/bus/stations`, { method: 'GET', headers: authed(token) });
}

export async function startBusTrip(token: string, trip: NewBusTrip) {
  return request<{ success: boolean; trip: BusTrip }>(`/movement/bus/trips`, { method: 'POST', headers: authed(token), body: JSON.stringify(trip) });
}

export async function getBusTrips(token: string) {
  return request<{ success: boolean; trips: BusTrip[] }>(`/movement/bus/trips`, { method: 'GET', headers: authed(token) });
}

export async function getBusTrip(token: string, tripId: number | string) {
  return request<{ success: boolean; trip: BusTrip; passengers: BusPassenger[] }>(`/movement/bus/trips/${encodeURIComponent(String(tripId))}`, { method: 'GET', headers: authed(token) });
}

/** The code to show now. Asking for the arrival code moves the trip to Arrived. */
export async function getBusCode(token: string, tripId: number | string, phase: 'boarding' | 'arrival') {
  return request<{ success: boolean } & BusCode>(`/movement/bus/trips/${encodeURIComponent(String(tripId))}/qr?phase=${phase}`, { method: 'GET', headers: authed(token) });
}

export async function changeBusTrip(token: string, tripId: number | string, action: 'depart' | 'end') {
  return request<{ success: boolean; trip: BusTrip; passengers: BusPassenger[] }>(`/movement/bus/trips/${encodeURIComponent(String(tripId))}/${action}`, { method: 'POST', headers: authed(token) });
}

export async function removeBusPassenger(token: string, tripId: number | string, studentId: string) {
  return request<{ success: boolean; trip: BusTrip; passengers: BusPassenger[] }>(`/movement/bus/trips/${encodeURIComponent(String(tripId))}/remove-passenger`, {
    method: 'POST',
    headers: authed(token),
    body: JSON.stringify({ studentId })
  });
}

/** Student scans the staff member's bus QR: boarding or arrival, decided by the code. */
export async function scanBusCode(token: string, qrValue: string) {
  return request<{ success: boolean; action: 'boarded' | 'arrived'; message: string; trip: BusTrip; at: string }>(`/movement/bus/scan`, {
    method: 'POST',
    headers: authed(token),
    body: JSON.stringify({ qrValue })
  });
}

export type MyBusTrip = {
  id: number;
  reference: string;
  busNumber: string;
  plateNumber: string | null;
  origin: string | null;
  destination: string | null;
  route: string;
  tripStatus: string;
  status: 'Boarded' | 'Arrived' | 'No Arrival' | 'Removed' | string;
  boardedAt: string | null;
  arrivedAt: string | null;
};

export async function getMyBusTrips(token: string) {
  return request<{ success: boolean; trips: MyBusTrip[]; current: MyBusTrip | null }>(`/movement/bus/my-trips`, { method: 'GET', headers: authed(token) });
}

/* ------------------------------- Off campus (staff) ------------------------------- */
// Staff/admin with the Off Campus page grant (features plan, Phase 5). Read-only.

export type OffCampusStudent = {
  exitId: string;
  studentId: string;
  name: string;
  courseCode: string | null;
  level: string | number | null;
  phone: string | null;
  photoPath: string | null;
  route: string;
  destination: string | null;
  reason: string | null;
  departedAt: string | null;
  minutesOut: number;
  overdue: boolean;
};

export async function getOffCampus(token: string) {
  return request<{ success: boolean; serverTime: string; deadlineMinutes: number; count: number; overdue: number; students: OffCampusStudent[] }>(
    `/movement/off-campus`,
    { method: 'GET', headers: authed(token) }
  );
}
