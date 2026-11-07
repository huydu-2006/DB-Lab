import { useEffect, useState } from 'react'
import Logo from '../Logo'
import { Field, inputClass, inputErrorClass } from '../components/ui/Field'
import {
  DEMO_EMAIL,
  DEMO_PASSWORD,
  validateCredentials,
} from '../lib/auth'
import type { Errors } from '../lib/auth'
import { AlertIcon, EyeIcon, EyeOffIcon, LockIcon, MailIcon, SpinnerIcon } from '../components/ui/Icons'

function Login({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState<Errors>({})
  const [submitting, setSubmitting] = useState(false)

  // The stub resolves on a timer; clear it if the form unmounts first.
  useEffect(() => {
    if (!submitting) return
    const timer = window.setTimeout(() => {
      if (email.trim().toLowerCase() !== DEMO_EMAIL || password !== DEMO_PASSWORD) {
        setSubmitting(false)
        setErrors({
          form: 'Those details do not match. Use the demo credentials below.',
        })
        return
      }
      onLogin()
    }, 550)
    return () => window.clearTimeout(timer)
  }, [submitting, email, password, onLogin])

  const submit = () => {
    const nextErrors = validateCredentials({ email, password })
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      return
    }

    setErrors({})
    // Stub: no request is sent. The effect below resolves after a short delay
    // so the pending state is visible.
    setSubmitting(true)
  }

  const fillDemo = () => {
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
            submit()
          }}
          className="w-full max-w-sm rounded-2xl border border-line bg-surface p-6 shadow-sm md:p-8"
        >
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            Welcome back
          </h1>
          <p className="mt-1.5 text-sm text-ink-muted">
            Sign in to manage your pitches and bookings.
          </p>

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
                  autoComplete="current-password"
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

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm text-ink-muted">
                <input
                  type="checkbox"
                  name="remember"
                  checked={remember}
                  onChange={(event) => setRemember(event.target.checked)}
                  className="size-4 rounded border-line accent-brand"
                />
                Remember me
              </label>
              <a
                href="#"
                className="text-xs font-medium text-brand-strong hover:text-brand hover:underline"
              >
                Forgot password?
              </a>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="mt-1 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand-strong px-4 text-sm font-semibold text-white shadow-sm shadow-brand-strong/30 transition hover:bg-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/35 active:translate-y-px disabled:cursor-wait disabled:bg-brand-strong/80"
            >
              {submitting && <SpinnerIcon className="size-4" />}
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>
          </div>

          <div className="mt-6 rounded-xl border border-dashed border-line bg-surface-muted/50 p-3.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
              Demo account
            </p>
            <p className="mt-1 font-mono text-xs text-ink">
              {DEMO_EMAIL} · {DEMO_PASSWORD}
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

export default Login
