import { useEffect, useState } from 'react'
import { SignIn, useAuth, useUser } from '@clerk/clerk-react'
import { apiFetch, saveSession, type AuthSession } from '../lib/api'
import { SpinnerIcon } from './ui/Icons'

/**
 * Clerk-hosted authentication (Google OAuth / email+password). After Clerk
 * signs the user in, the backend session token (same dev format) is obtained
 * from /api/auth/sync, which upserts the user into the database.
 */
export function ClerkAuth({ onLogin }: { onLogin: (session: AuthSession) => void }) {
  const { isSignedIn, getToken } = useAuth()
  const { user, isLoaded } = useUser()
  const [error, setError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    if (!isSignedIn || !isLoaded || !user || syncing) return
    let cancelled = false

    void (async () => {
      setSyncing(true)
      try {
        const token = await getToken()
        if (!token) throw new Error('Clerk returned no session token')

        const synced = await apiFetch<AuthSession['user']>('/api/auth/sync', {
          method: 'POST',
          token,
        })
        if (cancelled) return
        saveSession({ token, user: synced })
        onLogin({ token, user: synced })
      } catch (cause) {
        if (!cancelled) {
          setError(
            cause instanceof Error ? cause.message : 'Could not sync your account.',
          )
        }
      } finally {
        if (!cancelled) setSyncing(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [isSignedIn, isLoaded, user, getToken, onLogin, syncing])

  if (isSignedIn) {
    return (
      <main className="grid min-h-svh place-items-center bg-canvas p-6">
        <div className="flex flex-col items-center gap-3 text-center">
          {error ? (
            <>
              <p role="alert" className="max-w-sm rounded-xl bg-red-50 px-3 py-2.5 text-sm font-medium text-danger">
                {error} — the backend must be running with CLERK_JWKS_URL configured.
              </p>
            </>
          ) : (
            <>
              <SpinnerIcon className="size-5 animate-spin text-brand-strong" />
              <p className="text-sm text-ink-muted">Syncing your account…</p>
            </>
          )}
        </div>
      </main>
    )
  }

  return (
    <main className="grid min-h-svh place-items-center bg-canvas p-6">
      <div className="w-full max-w-md">
        <SignIn path="/sign-in" signUpUrl="/sign-up" forceRedirectUrl="/" />
      </div>
    </main>
  )
}
