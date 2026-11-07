import type { ReactNode } from 'react'

export function Badge({
  children,
  tone = 'neutral',
  className = '',
}: {
  children: ReactNode
  tone?: 'neutral' | 'brand' | 'danger' | 'outline'
  className?: string
}) {
  const tones = {
    neutral: 'bg-surface-muted text-ink-muted',
    brand: 'bg-brand-soft text-brand-strong',
    danger: 'bg-red-50 text-danger',
    outline: 'border border-line text-ink-muted',
  }
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  )
}

export function StatusPill({
  available,
  label,
}: {
  available: boolean
  label?: string
}) {
  return (
    <span
      className={
        available
          ? 'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-brand-soft px-2.5 py-1 text-xs font-semibold text-brand-strong'
          : 'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-surface-muted px-2.5 py-1 text-xs font-semibold text-ink-muted'
      }
    >
      <span
        className={`size-1.5 rounded-full ${available ? 'bg-brand' : 'bg-ink-muted/40'}`}
      />
      {label ?? (available ? 'Available' : 'Fully booked')}
    </span>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-surface/60 px-6 py-14 text-center">
      <span className="grid size-12 place-items-center rounded-2xl bg-surface-muted text-ink-muted">
        {icon}
      </span>
      <p className="mt-4 font-semibold text-ink">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-ink-muted">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
