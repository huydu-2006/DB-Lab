import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { AlertIcon, CheckIcon, CloseIcon, SparkIcon } from './Icons'

export type ToastTone = 'success' | 'error' | 'info'

export type ToastMessage = {
  id: number
  tone: ToastTone
  title: string
  description?: string
}

const tones: Record<
  ToastTone,
  { ring: string; icon: ReactNode; bar: string }
> = {
  success: {
    ring: 'text-brand-strong bg-brand-soft',
    bar: 'bg-brand',
    icon: <CheckIcon className="size-4" />,
  },
  error: {
    ring: 'text-danger bg-red-50',
    bar: 'bg-danger',
    icon: <AlertIcon className="size-4" />,
  },
  info: {
    ring: 'text-brand-strong bg-surface-muted',
    bar: 'bg-brand-strong',
    icon: <SparkIcon className="size-4" />,
  },
}

export function Toast({
  toast,
  onDismiss,
}: {
  toast: ToastMessage
  onDismiss: (id: number) => void
}) {
  useEffect(() => {
    const timer = window.setTimeout(() => onDismiss(toast.id), 4500)
    return () => window.clearTimeout(timer)
  }, [toast.id, onDismiss])

  const tone = tones[toast.tone]

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-auto relative flex w-full max-w-sm items-start gap-3 overflow-hidden rounded-xl border border-line bg-surface p-3.5 shadow-lg shadow-ink/10"
    >
      <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${tone.ring}`}>
        {tone.icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">{toast.title}</p>
        {toast.description && (
          <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">
            {toast.description}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss notification"
        className="-mr-1 -mt-1 grid size-7 shrink-0 place-items-center rounded-md text-ink-muted transition hover:bg-surface-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
      >
        <CloseIcon className="size-3.5" />
      </button>
      <span className={`absolute bottom-0 left-0 h-0.5 w-full ${tone.bar}`} />
    </div>
  )
}

export function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: ToastMessage[]
  onDismiss: (id: number) => void
}) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-60 flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:items-end">
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  )
}
