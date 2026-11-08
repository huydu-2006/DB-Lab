import type { ChangeEvent, ReactNode } from 'react'

type FieldProps = {
  label: string
  htmlFor?: string
  hint?: string
  error?: string
  children: ReactNode
  className?: string
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className = '',
}: FieldProps) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={htmlFor} className="text-sm font-medium text-ink">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-xs font-medium text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-ink-muted">{hint}</p>
      ) : null}
    </div>
  )
}

export const inputClass =
  'h-11 w-full rounded-xl border border-line bg-white px-3.5 text-sm text-ink shadow-sm outline-none transition placeholder:text-ink-muted/50 focus-visible:border-brand focus-visible:ring-4 focus-visible:ring-brand/15 disabled:cursor-not-allowed disabled:bg-surface-muted/60 disabled:text-ink-muted'

export const inputErrorClass =
  'border-danger/60 focus-visible:border-danger focus-visible:ring-danger/15'

export const selectClass =
  'h-10 w-full appearance-none rounded-lg border border-line bg-white px-3 pr-9 text-sm text-ink shadow-sm outline-none transition focus-visible:border-brand focus-visible:ring-4 focus-visible:ring-brand/15'

export function SelectChevron() {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m5.5 8 4.5 4.5L14.5 8" />
    </svg>
  )
}

/** Wraps a native select so the chevron sits inside the field. */
export function Select({
  id,
  value,
  onChange,
  children,
  className = '',
  'aria-invalid': ariaInvalid,
}: {
  id?: string
  value: string
  onChange: (event: ChangeEvent<HTMLSelectElement>) => void
  children: ReactNode
  className?: string
  'aria-invalid'?: boolean
}) {
  return (
    <div className={`relative ${className}`}>
      <select
        id={id}
        value={value}
        onChange={onChange}
        aria-invalid={ariaInvalid}
        className={selectClass}
      >
        {children}
      </select>
      <SelectChevron />
    </div>
  )
}
