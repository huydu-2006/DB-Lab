import type { ApiErrorBody } from './types'
import type { Booking, Pitch } from './types'

export type AuthUser = {
  user_id: number
  clerk_user_id: string
  full_name: string
  email: string
  phone: string | null
  auth_provider: 'CLERK' | 'GOOGLE'
  role: 'CUSTOMER' | 'STAFF' | 'ADMIN'
  team_name: string | null
}

export type AuthSession = {
  token: string
  user: AuthUser
}

export const API_BASE: string = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

/** The API could not be reached at all (backend not running). */
export class ApiUnavailableError extends Error {
  constructor(url: string) {
    super(`API unreachable at ${url}`)
    this.name = 'ApiUnavailableError'
  }
}

/** The API responded with a non-2xx status. */
export class ApiError extends Error {
  readonly status: number
  readonly detail: string

  constructor(status: number, detail: string) {
    super(detail)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }
}

export async function apiFetch<T>(
  path: string,
  init: { method?: string; body?: unknown; token?: string } = {},
): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
      },
      ...(init.body !== undefined
        ? { body: JSON.stringify(init.body) }
        : {}),
    })
  } catch {
    throw new ApiUnavailableError(API_BASE)
  }

  if (!response.ok) {
    let detail = `Request failed (${response.status})`
    try {
      const body = (await response.json()) as ApiErrorBody
      if (typeof body?.detail === 'string') detail = body.detail
    } catch {
      // non-JSON error body — keep the generic message
    }
    throw new ApiError(response.status, detail)
  }

  return (await response.json()) as T
}

export const authApi = {
  /** Check the backend is up and which auth mode it runs (clerk | dev-fallback). */
  health: () => apiFetch<{ status: string; auth_mode: string }>('/api/health'),

  /**
   * Dev-mode sign-in/sign-up (backend without Clerk configured). Passwords
   * are not sent: credential checks belong to Clerk in production.
   */
  devLogin: (email: string) =>
    apiFetch<AuthSession>('/api/auth/dev/login', {
      method: 'POST',
      body: { email },
    }),

  devRegister: (input: { email: string; full_name: string; team_name?: string }) =>
    apiFetch<AuthSession>('/api/auth/dev/register', {
      method: 'POST',
      body: input,
    }),
}

// ---------------------------------------------------------------------------
// Live domain API (bookings, pitches, services, payments, reports).
// Mappers normalize backend responses into the existing domain types so the
// UI components do not change shape when the mock data.ts fallback is in use.
// ---------------------------------------------------------------------------

export type ApiField = {
  id: number
  name: string
  address: string
  district: string
  type: string
  surface: string
  basePricePerHour: number
  rating: number
  reviews: number
  amenities: string[]
  openAt: string
  closeAt: string
  status: string
}

export type ApiSlot = {
  start: string
  end: string
  state: 'free' | 'taken' | 'past'
  price_per_hour: number
}

export type ApiAvailabilitySummary = { field_id: number; free: number; total: number }

export type ApiServiceItem = {
  id: number
  name: string
  unit: string
  unitPrice: number
  stock: number
}

export type ApiBookingLineService = {
  id: number
  service_id: number
  name: string
  unit: string
  quantity: number
  unit_price: number
  subtotal: number
}

export type ApiBooking = {
  booking_id: number
  user_id: number
  user_name: string
  field_id: number
  field_name: string
  booking_date: string
  start_time: string
  end_time: string
  status: string
  pitch_amount: number
  service_amount: number
  total_amount: number
  paid_amount: number
  services: ApiBookingLineService[]
}

export type ApiPayment = {
  id: number
  booking_id: number
  amount: number
  payment_type: string
  payment_method: string
  payment_status: string
  paid_at: string | null
}

export type ApiReport = {
  from_date: string
  to_date: string
  total_revenue: number
  revenue_by_day: { date: string; revenue: number }[]
  revenue_by_field: {
    field_id: number
    name: string
    field_type: string
    revenue: number
    paid_bookings: number
  }[]
  utilization: {
    field_id: number
    name: string
    avg_utilization_pct: number
    booked_hours: number
  }[]
  top_customers: {
    user_id: number
    full_name: string
    total_bookings: number
    lifetime_value: number
    cancellations: number
    no_shows: number
  }[]
  status_counts: Record<string, number>
}

export function apiFieldToPitch(field: ApiField): Pitch {
  return {
    id: field.id,
    name: field.name,
    address: field.address,
    district: field.district,
    type: field.type as Pitch['type'],
    surface: field.surface as Pitch['surface'],
    pricePerHour: field.basePricePerHour,
    rating: field.rating,
    reviews: field.reviews,
    amenities: field.amenities as Pitch['amenities'],
    openAt: field.openAt,
    closeAt: field.closeAt,
    takenSlots: [],
  }
}

export function apiBookingToBooking(booking: ApiBooking): Booking {
  const start = booking.start_time.slice(0, 5)
  const end = booking.end_time.slice(0, 5)
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  const durationHours = (eh * 60 + em - (sh * 60 + sm)) / 60
  return {
    id: `BK-${booking.booking_id}`,
    dbId: booking.booking_id,
    status: booking.status,
    pitchId: booking.field_id,
    pitchName: booking.field_name,
    address: '',
    date: booking.booking_date,
    startTime: start,
    endTime: end,
    durationHours,
    pricePerHour: Math.round(booking.pitch_amount / Math.max(durationHours, 0.5)),
    total: booking.total_amount,
    createdAt: booking.booking_date,
  }
}

export const fieldsApi = {
  list: () => apiFetch<ApiField[]>('/api/fields'),

  availability: (date: string) =>
    apiFetch<ApiAvailabilitySummary[]>(`/api/fields/availability?date=${date}`),

  fieldAvailability: (fieldId: number, date: string) =>
    apiFetch<{ openAt: string; closeAt: string; slots: ApiSlot[] }>(
      `/api/fields/${fieldId}/availability?date=${date}`,
    ),
}

export const servicesApi = {
  list: () => apiFetch<ApiServiceItem[]>('/api/services'),
}

export const bookingsApi = {
  create: (
    token: string,
    input: { field_id: number; booking_date: string; start_time: string; duration_minutes: number },
  ) => apiFetch<ApiBooking>('/api/bookings', { method: 'POST', body: input, token }),

  mine: (token: string) => apiFetch<ApiBooking[]>('/api/bookings', { token }),

  all: (token: string) => apiFetch<ApiBooking[]>('/api/bookings?scope=all', { token }),

  updateStatus: (token: string, bookingId: number, status: string) =>
    apiFetch<ApiBooking>(`/api/bookings/${bookingId}/status`, {
      method: 'PATCH',
      body: { status },
      token,
    }),

  addService: (token: string, bookingId: number, serviceId: number, quantity: number) =>
    apiFetch<ApiBooking>(`/api/bookings/${bookingId}/services`, {
      method: 'POST',
      body: { service_id: serviceId, quantity },
      token,
    }),
}

export const paymentsApi = {
  record: (
    token: string,
    input: {
      booking_id: number
      amount: number
      payment_type: 'DEPOSIT' | 'FULL' | 'REMAINDER' | 'REFUND'
      payment_method: 'CASH' | 'BANK_TRANSFER' | 'E_WALLET' | 'CARD'
    },
  ) => apiFetch<ApiPayment>('/api/payments', { method: 'POST', body: input, token }),

  listForBooking: (token: string, bookingId: number) =>
    apiFetch<ApiPayment[]>(`/api/bookings/${bookingId}/payments`, { token }),
}

export const reportsApi = {
  revenue: (token: string, days = 30) =>
    apiFetch<ApiReport>(`/api/reports/revenue?days=${days}`, { token }),
}

const SESSION_KEY = 'bk88.session'

export function saveSession(session: AuthSession): void {
  window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

export function clearSession(): void {
  window.sessionStorage.removeItem(SESSION_KEY)
}

export function restoreSession(): AuthSession | null {
  const raw = window.sessionStorage.getItem(SESSION_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as AuthSession
  } catch {
    return null
  }
}
