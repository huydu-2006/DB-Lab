import { useState } from 'react'
import Logo from '../Logo'
import { Field, inputClass, inputErrorClass } from '../components/ui/Field'
import {
  DEMO_EMAIL,
  DEMO_PASSWORD,
  validateCredentials,
  type Errors,
} from '../lib/auth'
import {
  ApiError,
  ApiUnavailableError,
  authApi,
  saveSession,
  type AuthSession,
} from '../lib/api'
import { ClerkAuth } from '../components/ClerkAuth'
import {
  AlertIcon,
  EyeIcon,
  EyeOffIcon,
  LockIcon,
  MailIcon,
  SpinnerIcon,
} from '../components/ui/Icons'

type Mode = 'signin' | 'signup'

// When a Clerk publishable key is configured, authentication is hosted by
// Clerk (Google OAuth + email/password); otherwise the local dev form talks
// to the backend's /api/auth/dev/* endpoints.
const clerkKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ?? ''

function Login({ onLogin }: { onLogin: (session: AuthSession) => void }) {
  if (clerkKey) {
    return <ClerkAuth onLogin={onLogin} />
  }
  return <DevLogin onLogin={onLogin} />
}

function DevLogin({ onLogin }: { onLogin: (session: AuthSession) => void }) {
  const [mode, setMode] = useState<Mode>('signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState<Errors>({})
  const [submitting, setSubmitting] = useState(false)

  const switchMode = (next: Mode) => {
    setMode(next)
    setErrors({})
  }

  const submit = async () => {
    const nextErrors = validateCredentials({ email, password })
    if (mode === 'signup' && name.trim().length < 2) {
      nextErrors.name = 'Enter your name.'
    }
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      return
    }

    setErrors({})
    setSubmitting(true)
    try {
      // The local dev API does not check passwords — credentials are handled
      // by Clerk (email/password or Google OAuth) in production, where the
      // token comes from <ClerkProvider> and is verified via /api/auth/sync.
      const session =
        mode === 'signin'
          ? await authApi.devLogin(email.trim().toLowerCase())
          : await authApi.devRegister({
              email: email.trim().toLowerCase(),
              full_name: name.trim(),
            })
      saveSession(session)
      onLogin(session)
    } catch (error) {
      if (error instanceof ApiUnavailableError) {
        // Backend offline: keep the old demo flow usable for offline dev.
        if (
          email.trim().toLowerCase() === DEMO_EMAIL &&
          password === DEMO_PASSWORD
        ) {
          onLogin({ token: 'demo', user: demoUser() })
          return
        }
        setErrors({
          form: `Could not reach the API backend. Start it at ${'localhost:8000'}, or use the demo credentials below.`,
        })
      } else if (error instanceof ApiError) {
        const hint =
          mode === 'signin' && error.status === 404
            ? ' (No account with this email yet — switch to Sign up.)'
            : ''
        setErrors({ form: `${error.detail}${hint}` })
      } else {
        setErrors({ form: 'Something went wrong. Please try again.' })
      }
    } finally {
      setSubmitting(false)
    }
  }

  const fillDemo = () => {
    setMode('signin')
    setEmail(DEMO_EMAIL)
    setPassword(DEMO_PASSWORD)
    setErrors({})
  }

  return (
    <div className="grid min-h-svh md:grid-cols-[1.05fr_1fr]">
      <aside
        aria-label="DB-Lab Football"
        className="pitch-bg relative flex min-h-[280px] flex-col justify-between overflow-hidden p-8 md:min-h-0 md:p-14"
      >
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <div className="absolute inset-x-[10%] top-1/2 h-px bg-emerald-900/10" />
          <div className="absolute left-1/2 top-1/2 aspect-square w-[min(62%,340px)] -translate-x-1/2 -translate-y-1/2 rounded-full border border-emerald-900/10" />
          <div className="absolute left-1/2 top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-900/15" />
        </div>

        <div className="relative z-10">
          <Logo />
        </div>

        <div className="relative z-10 max-w-md py-10">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-strong">
            Matchday, sorted
          </p>
          <p className="mt-3 text-3xl font-semibold leading-tight tracking-tight text-ink md:text-5xl">
            Your matchday command centre.
          </p>
          <p className="mt-4 hidden max-w-sm text-sm leading-relaxed text-ink-muted md:block">
            Find a pitch, lock in a slot, and keep every booking in one calm, sunny place.
          </p>
        </div>

        <ul className="relative z-10 hidden gap-6 text-sm text-ink-muted md:flex">
          <li className="flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-brand" />
            Live availability
          </li>
          <li className="flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-brand" />
            Instant booking
          </li>
        </ul>
      </aside>

      <main className="flex items-center justify-center bg-canvas p-6 md:p-10">
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
          className="w-full max-w-sm rounded-2xl border border-line bg-surface p-6 shadow-sm md:p-8"
        >
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            {mode === 'signin' ? 'Welcome back' : 'Create your account'}
          </h1>
          <p className="mt-1.5 text-sm text-ink-muted">
            {mode === 'signin'
              ? 'Sign in to manage your pitches and bookings.'
              : 'Sign up to book pitches and keep your match history.'}
          </p>

          <div
            role="tablist"
            aria-label="Authentication mode"
            className="mt-5 grid grid-cols-2 rounded-xl border border-line bg-surface-muted p-1"
          >
            {(['signin', 'signup'] as const).map((option) => (
              <button
                key={option}
                type="button"
                role="tab"
                aria-selected={mode === option}
                onClick={() => switchMode(option)}
                className={`h-9 rounded-lg text-sm font-semibold transition ${
                  mode === option
                    ? 'bg-brand-strong text-white shadow-sm'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                {option === 'signin' ? 'Sign in' : 'Sign up'}
              </button>
            ))}
          </div>

          {errors.form && (
            <p
              role="alert"
              className="mt-5 flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2.5 text-sm font-medium text-danger"
            >
              <AlertIcon className="mt-0.5 size-4 shrink-0" />
              {errors.form}
            </p>
          )}

          <div className="mt-6 flex flex-col gap-4">
            {mode === 'signup' && (
              <Field label="Full name" htmlFor="name" error={errors.name}>
                <input
                  id="name"
                  name="name"
                  type="text"
                  autoComplete="name"
                  placeholder="Nguyễn Văn A"
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value)
                    setErrors((current) => ({ ...current, name: undefined, form: undefined }))
                  }}
                  aria-invalid={Boolean(errors.name)}
                  className={`${inputClass} ${errors.name ? inputErrorClass : ''}`}
                />
              </Field>
            )}

            <Field label="Email" htmlFor="email" error={errors.email}>
              <div className="relative">
                <MailIcon className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@club.com"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value)
                    setErrors((current) => ({ ...current, email: undefined, form: undefined }))
                  }}
                  aria-invalid={Boolean(errors.email)}
                  className={`${inputClass} pl-10 ${errors.email ? inputErrorClass : ''}`}
                />
              </div>
            </Field>

            <Field label="Password" htmlFor="password" error={errors.password}>
              <div className="relative">
                <LockIcon className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value)
                    setErrors((current) => ({ ...current, password: undefined, form: undefined }))
                  }}
                  aria-invalid={Boolean(errors.password)}
                  className={`${inputClass} pl-10 pr-11 ${errors.password ? inputErrorClass : ''}`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  className="absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-ink-muted transition hover:bg-surface-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
                >
                  {showPassword ? (
                    <EyeOffIcon className="size-4" />
                  ) : (
                    <EyeIcon className="size-4" />
                  )}
                </button>
              </div>
            </Field>

            <p className="text-xs leading-relaxed text-ink-muted">
              {mode === 'signin'
                ? 'Accounts live in the SQL Server database via the FastAPI backend. The dev API signs you in on email alone; passwords and Google OAuth are verified by Clerk in production.'
                : 'Creating an account stores your profile in the SQL Server USERS table.'}
            </p>

            <button
              type="submit"
              disabled={submitting}
              className="mt-1 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand-strong px-4 text-sm font-semibold text-white shadow-sm shadow-brand-strong/30 transition hover:bg-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/35 active:translate-y-px disabled:cursor-wait disabled:bg-brand-strong/80"
            >
              {submitting && <SpinnerIcon className="size-4" />}
              {submitting
                ? mode === 'signin'
                  ? 'Signing in…'
                  : 'Creating account…'
                : mode === 'signin'
                  ? 'Sign in'
                  : 'Create account'}
            </button>
          </div>

          <div className="mt-6 rounded-xl border border-dashed border-line bg-surface-muted/50 p-3.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
              Demo account
            </p>
            <p className="mt-1 font-mono text-xs text-ink">
              {DEMO_EMAIL} · {DEMO_PASSWORD}
            </p>
            <p className="mt-1 text-xs text-ink-muted">
              Works when the API backend is not running (offline demo mode).
            </p>
            <button
              type="button"
              onClick={fillDemo}
              className="mt-2 text-xs font-medium text-brand-strong hover:text-brand hover:underline"
            >
              Fill demo credentials
            </button>
          </div>
        </form>
      </main>
    </div>
  )
}

/** Offline demo session used when the API backend is unreachable. */
function demoUser(): AuthSession['user'] {
  return {
    user_id: 0,
    clerk_user_id: 'demo',
    full_name: 'Stadium Manager',
    email: DEMO_EMAIL,
    phone: null,
    auth_provider: 'CLERK',
    role: 'ADMIN',
    team_name: null,
  }
}

export default Login
