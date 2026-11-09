import type { Credentials } from './types'

/**
 * Offline demo credentials — used only when the FastAPI backend is
 * unreachable (dev machines without the server running). Real accounts live
 * in the MySQL USERS table via POST /api/auth/dev/register.
 */
export const DEMO_EMAIL = 'manager@bk88.vn'
export const DEMO_PASSWORD = 'matchday'

export type Errors = Partial<
  Record<'email' | 'password' | 'name' | 'form', string>
>

export function validateCredentials({ email, password }: Credentials): Errors {
  const errors: Errors = {}
  const trimmed = email.trim()
  if (trimmed === '') {
    errors.email = 'Enter your email address.'
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed)) {
    errors.email = 'That does not look like a valid email address.'
  }
  if (password === '') {
    errors.password = 'Enter your password.'
  } else if (password.length < 6) {
    errors.password = 'Passwords are at least 6 characters.'
  }
  return errors
}
