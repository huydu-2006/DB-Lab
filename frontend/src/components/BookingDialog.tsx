import { useMemo, useState } from 'react'
import {
  DURATION_OPTIONS,
  PRIME_START_HOUR,
  PRIME_SURCHARGE,
  findConflict,
  getSlotStates,
  priceBooking,
} from '../lib/booking'
import {
  formatCurrency,
  formatDate,
  formatDuration,
  formatTimeRange,
} from '../lib/format'
import type { Booking, Pitch } from '../lib/types'
import type { SlotState } from '../lib/booking'
import { AlertIcon, CheckIcon, ClockIcon } from './ui/Icons'
import { Modal } from './ui/Modal'

type BookingDialogProps = {
  pitch: Pitch | null
  date: string
  bookings: Booking[]
  nowHour: number
  onClose: () => void
  onConfirm: (pitch: Pitch, start: string, durationHours: number) => void
}

const stateStyles: Record<SlotState, string> = {
  free: 'border-line bg-white text-ink hover:border-brand hover:bg-brand-soft/60 focus-visible:ring-brand/25',
  taken:
    'cursor-not-allowed border-line/60 bg-surface-muted/70 text-ink-muted/60 line-through',
  past: 'cursor-not-allowed border-transparent bg-transparent text-ink-muted/35',
}

const stateLabels: Record<SlotState, string> = {
  free: 'available',
  taken: 'already booked',
  past: 'past',
}

export function BookingDialog({
  pitch,
  date,
  bookings,
  nowHour,
  onClose,
  onConfirm,
}: BookingDialogProps) {
  const [start, setStart] = useState<string | null>(null)
  const [durationHours, setDurationHours] = useState<number>(1)
  const [showErrors, setShowErrors] = useState(false)

  const slots = useMemo(
    () => (pitch ? getSlotStates(pitch, date, bookings, nowHour) : []),
    [pitch, date, bookings, nowHour],
  )

  if (!pitch) return null

  const conflict =
    start === null
      ? null
      : findConflict(pitch, date, start, durationHours, bookings, nowHour)
  const breakdown =
    start === null ? null : priceBooking(pitch, start, durationHours)
  const freeCount = slots.filter((slot) => slot.state === 'free').length
  const canConfirm = start !== null && conflict === null

  const conflictMessage = (() => {
    if (start === null) return 'Pick a start time to continue.'
    if (!conflict) return null
    if (conflict.kind === 'past') return 'That slot has already started today.'
    if (conflict.kind === 'closing')
      return `${formatDuration(durationHours)} from ${start} runs past closing time (${pitch.closeAt}).`
    return `Slot ${conflict.start} is already booked. Pick another start time.`
  })()

  const pickStart = (slotStart: string) => {
    setStart(slotStart)
    setShowErrors(false)
  }

  const submit = () => {
    if (!canConfirm) {
      setShowErrors(true)
      return
    }
    onConfirm(pitch, start, durationHours)
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={pitch.name}
      description={`${formatDate(date)} · ${pitch.type} · ${pitch.surface}`}
      footer={
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            {breakdown ? (
              <>
                <p className="text-xs text-ink-muted">
                  {formatTimeRange(start!, durationHours)} · {formatDuration(durationHours)}
                  {breakdown.primeHours > 0 && (
                    <span className="text-brand-strong">
                      {' '}
                      (incl. {formatDuration(breakdown.primeHours)} prime time)
                    </span>
                  )}
                </p>
                <p className="text-lg font-semibold tabular-nums text-ink">
                  {formatCurrency(breakdown.total)}
                </p>
              </>
            ) : (
              <p className="text-sm text-ink-muted">No start time selected yet.</p>
            )}
          </div>
          <div className="flex gap-2 sm:shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="h-11 flex-1 whitespace-nowrap rounded-xl border border-line bg-white px-4 text-sm font-medium text-ink-muted shadow-sm transition hover:bg-surface-muted hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/15 sm:flex-none"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={start !== null && conflict !== null}
              className="inline-flex h-11 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-brand-strong px-5 text-sm font-semibold text-white shadow-sm shadow-brand-strong/30 transition hover:bg-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/35 active:translate-y-px disabled:cursor-not-allowed disabled:bg-ink-muted/40 disabled:shadow-none sm:flex-none"
            >
              <CheckIcon className="size-4" />
              Confirm booking
            </button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        <section aria-labelledby="duration-heading">
          <h3
            id="duration-heading"
            className="text-xs font-semibold uppercase tracking-wide text-ink-muted"
          >
            Duration
          </h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {DURATION_OPTIONS.map((option) => {
              const active = option === durationHours
              return (
                <button
                  key={option}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setDurationHours(option)}
                  className={
                    active
                      ? 'h-9 rounded-lg bg-brand-strong px-3.5 text-sm font-semibold text-white shadow-sm transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/30'
                      : 'h-9 rounded-lg border border-line bg-white px-3.5 text-sm font-medium text-ink-muted shadow-sm transition hover:border-brand/40 hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/15'
                  }
                >
                  {formatDuration(option)}
                </button>
              )
            })}
          </div>
        </section>

        <section aria-labelledby="slots-heading">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3
              id="slots-heading"
              className="text-xs font-semibold uppercase tracking-wide text-ink-muted"
            >
              Start time
            </h3>
            <p className="text-xs text-ink-muted">
              <span className="font-medium text-ink">{freeCount}</span> of{' '}
              {slots.length} slots free
            </p>
          </div>

          <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-5">
            {slots.map((slot) => {
              const active = slot.start === start
              return (
                <button
                  key={slot.start}
                  type="button"
                  disabled={slot.state !== 'free'}
                  aria-pressed={active}
                  aria-label={`${slot.start}, ${stateLabels[slot.state]}`}
                  onClick={() => pickStart(slot.start)}
                  className={`flex h-11 flex-col items-center justify-center rounded-lg border text-sm font-medium tabular-nums shadow-sm transition focus-visible:outline-none focus-visible:ring-4 ${
                    active
                      ? 'border-brand-strong bg-brand-strong text-white shadow-brand-strong/25'
                      : stateStyles[slot.state]
                  }`}
                >
                  <span>{slot.start}</span>
                  {slot.state === 'free' && (
                    <span
                      className={`text-[10px] font-normal ${active ? 'text-white/80' : 'text-ink-muted'}`}
                    >
                      {Math.round(slot.price / 1000)}k
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-ink-muted">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm border border-line bg-white" /> Free
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-surface-muted" /> Booked
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ClockIcon className="size-3" /> Prime time from {PRIME_START_HOUR}:00 (+
              {Math.round(PRIME_SURCHARGE * 100)}%)
            </span>
          </div>
        </section>

        {breakdown && (
          <section
            aria-label="Price breakdown"
            className="rounded-xl border border-line bg-surface-muted/50 p-4"
          >
            <dl className="flex flex-col gap-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-muted">
                  Standard · {formatDuration(breakdown.standardHours)}
                </dt>
                <dd className="tabular-nums">{formatCurrency(breakdown.standardSubtotal)}</dd>
              </div>
              {breakdown.primeHours > 0 && (
                <div className="flex justify-between">
                  <dt className="text-ink-muted">
                    Prime time · {formatDuration(breakdown.primeHours)}
                    <span className="ml-1 text-brand-strong">
                      +{formatCurrency(breakdown.surcharge)}
                    </span>
                  </dt>
                  <dd className="tabular-nums">{formatCurrency(breakdown.primeSubtotal)}</dd>
                </div>
              )}
              <div className="mt-1 flex justify-between border-t border-line pt-2 font-semibold">
                <dt>Total</dt>
                <dd className="tabular-nums">{formatCurrency(breakdown.total)}</dd>
              </div>
            </dl>
          </section>
        )}

        {(conflictMessage && (showErrors || start !== null)) && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-sm font-medium text-danger"
          >
            <AlertIcon className="mt-0.5 size-4 shrink-0" />
            {conflictMessage}
          </p>
        )}
      </div>
    </Modal>
  )
}
