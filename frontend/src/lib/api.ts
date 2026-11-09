import type { ApiErrorBody } from './types'

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
