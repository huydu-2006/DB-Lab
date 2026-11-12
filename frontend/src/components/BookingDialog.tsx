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
import type { Slot, SlotState } from '../lib/booking'
import type { ApiServiceItem } from '../lib/api'
import { AlertIcon, CheckIcon, ClockIcon } from './ui/Icons'
import { Modal } from './ui/Modal'

export type BookingExtra = { serviceId: number; quantity: number }
export type BookingPayment = { deposit: boolean; method: string }

type BookingDialogProps = {
  pitch: Pitch | null
  date: string
  bookings: Booking[]
  nowHour: number
  /** Live API slot grid; when provided the dialog runs in DB mode. */
  slotsOverride?: Slot[] | null
  /** Add-on services (DB mode only). */
  services?: ApiServiceItem[]
  submitting?: boolean
  apiError?: string | null
  onClose: () => void
  onConfirm: (
    pitch: Pitch,
    start: string,
    durationHours: number,
    extras: BookingExtra[],
    payment: BookingPayment,
  ) => void
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

const SLOT_HOURS = 0.5
const PAYMENT_METHODS = ['CASH', 'BANK_TRANSFER', 'E_WALLET', 'CARD'] as const

export function BookingDialog({
  pitch,
  date,
  bookings,
  nowHour,
  slotsOverride,
  services,
  submitting = false,
  apiError,
  onClose,
  onConfirm,
}: BookingDialogProps) {
  const [start, setStart] = useState<string | null>(null)
  const [durationHours, setDurationHours] = useState<number>(1)
  const [showErrors, setShowErrors] = useState(false)
  const [quantities, setQuantities] = useState<Record<number, number>>({})
  const [payDeposit, setPayDeposit] = useState(true)
  const [method, setMethod] = useState<string>('CASH')

  const liveMode = slotsOverride !== undefined && slotsOverride !== null
  const slots = useMemo(
    () =>
      liveMode && slotsOverride
        ? slotsOverride
        : pitch
          ? getSlotStates(pitch, date, bookings, nowHour)
          : [],
    [liveMode, slotsOverride, pitch, date, bookings, nowHour],
  )

  const slotMap = useMemo(
    () => new Map(slots.map((slot) => [slot.start, slot])),
    [slots],
  )

  if (!pitch) return null

  // --- conflict detection differs per mode -------------------------------
  let conflictMessage: string | null = null
  let conflict: { kind: string; start?: string } | null = null
  if (start === null) {
    conflictMessage = 'Pick a start time to continue.'
  } else if (liveMode) {
    const needed = durationHours * 2
    const startIndex = slots.findIndex((slot) => slot.start === start)
    let blocked: string | null = null
    for (let i = 0; i < needed; i += 1) {
      const slot = slots[startIndex + i]
      if (!slot || slot.state !== 'free') {
        blocked = slot?.start ?? null
        break
      }
    }
    if (blocked) {
      conflict = { kind: 'taken', start: blocked }
      conflictMessage = slotMap.has(blocked) && slotMap.get(blocked)!.state === 'past'
        ? 'That slot has already started today.'
        : blocked === null
          ? `${formatDuration(durationHours)} from ${start} runs past closing time.`
          : `Slot ${blocked} is unavailable. Pick another start time.`
    }
  } else {
    conflict = findConflict(pitch, date, start, durationHours, bookings, nowHour)
    if (conflict) {
      if (conflict.kind === 'past')
        conflictMessage = 'That slot has already started today.'
      else if (conflict.kind === 'closing')
        conflictMessage = `${formatDuration(durationHours)} from ${start} runs past closing time (${pitch.closeAt}).`
      else conflictMessage = `Slot ${conflict.start} is already booked. Pick another start time.`
    }
  }

  // --- price breakdown ----------------------------------------------------
  let pitchTotal = 0
  let primeHours = 0
  if (start !== null && !conflict) {
    const startIndex = slots.findIndex((slot) => slot.start === start)
    const windowSlots = slots.slice(startIndex, startIndex + durationHours * 2)
    pitchTotal = windowSlots.reduce(
      (sum, slot) => sum + slot.price * SLOT_HOURS,
      0,
    )
    primeHours =
      !liveMode && windowSlots.length > 0 && windowSlots[0].price > pitch.pricePerHour
        ? windowSlots.length / 2
        : 0
  } else if (start !== null) {
    const fallback = priceBooking(pitch, start, durationHours)
    pitchTotal = fallback.total
    primeHours = fallback.primeHours
  }

  const extras: BookingExtra[] = Object.entries(quantities)
    .filter(([, quantity]) => quantity > 0)
    .map(([serviceId, quantity]) => ({
      serviceId: Number(serviceId),
      quantity,
    }))
  const extrasTotal = extras.reduce((sum, extra) => {
    const service = services?.find((item) => item.id === extra.serviceId)
    return sum + (service ? service.unitPrice * extra.quantity : 0)
  }, 0)
  const grandTotal = pitchTotal + extrasTotal
  const depositAmount = Math.round(pitchTotal * 0.3)

  const freeCount = slots.filter((slot) => slot.state === 'free').length
  const canConfirm = start !== null && conflict === null && !submitting

  const adjustQuantity = (serviceId: number, delta: number) => {
    setQuantities((current) => {
      const next = Math.max(
        0,
        Math.min(99, (current[serviceId] ?? 0) + delta),
      )
      return { ...current, [serviceId]: next }
    })
  }

  const submit = () => {
    if (!canConfirm) {
      setShowErrors(true)
      return
    }
    onConfirm(pitch, start!, durationHours, extras, {
      deposit: payDeposit,
      method,
    })
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
            {start !== null ? (
              <>
                <p className="text-xs text-ink-muted">
                  {formatTimeRange(start, durationHours)} · {formatDuration(durationHours)}
                  {primeHours > 0 && (
                    <span className="text-brand-strong">
                      {' '}
                      (incl. {formatDuration(primeHours)} prime time)
                    </span>
                  )}
                </p>
                <p className="text-lg font-semibold tabular-nums text-ink">
                  {formatCurrency(grandTotal)}
                  {payDeposit && depositAmount > 0 && (
                    <span className="ml-2 text-xs font-normal text-ink-muted">
                      deposit now {formatCurrency(depositAmount)}
                    </span>
                  )}
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
              disabled={submitting}
              className="h-11 flex-1 whitespace-nowrap rounded-xl border border-line bg-white px-4 text-sm font-medium text-ink-muted shadow-sm transition hover:bg-surface-muted hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/15 sm:flex-none"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!canConfirm || (start !== null && conflict !== null)}
              className="inline-flex h-11 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-brand-strong px-5 text-sm font-semibold text-white shadow-sm shadow-brand-strong/30 transition hover:bg-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/35 active:translate-y-px disabled:cursor-not-allowed disabled:bg-ink-muted/40 disabled:shadow-none sm:flex-none"
            >
              <CheckIcon className="size-4" />
              {submitting
                ? 'Saving…'
                : liveMode
                  ? `Book${payDeposit ? ' + deposit' : ''}`
                  : 'Confirm booking'}
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
              {liveMode && <span className="ml-1 normal-case text-brand-strong">(live from database)</span>}
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
                  disabled={slot.state !== 'free' || submitting}
                  aria-pressed={active}
                  aria-label={`${slot.start}, ${stateLabels[slot.state]}`}
                  onClick={() => {
                    setStart(slot.start)
                    setShowErrors(false)
                  }}
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

        {services && services.length > 0 && (
          <section aria-labelledby="extras-heading">
            <h3
              id="extras-heading"
              className="text-xs font-semibold uppercase tracking-wide text-ink-muted"
            >
              Matchday extras
            </h3>
            <ul className="mt-2 flex flex-col gap-2">
              {services.map((service) => {
                const quantity = quantities[service.id] ?? 0
                return (
                  <li
                    key={service.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-line bg-white px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink">{service.name}</p>
                      <p className="text-xs text-ink-muted">
                        {formatCurrency(service.unitPrice)} / {service.unit.toLowerCase()} ·{' '}
                        {service.stock} in stock
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={() => adjustQuantity(service.id, -1)}
                        aria-label={`Remove one ${service.name}`}
                        disabled={quantity === 0 || submitting}
                        className="size-8 rounded-lg border border-line text-ink-muted transition hover:bg-surface-muted disabled:opacity-40"
                      >
                        −
                      </button>
                      <span className="w-6 text-center text-sm font-semibold tabular-nums">
                        {quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => adjustQuantity(service.id, 1)}
                        aria-label={`Add one ${service.name}`}
                        disabled={service.stock === 0 || submitting}
                        className="size-8 rounded-lg border border-line text-ink-muted transition hover:bg-surface-muted disabled:opacity-40"
                      >
                        +
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>

            <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface-muted/50 px-3 py-2.5">
              <label className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={payDeposit}
                  onChange={(event) => setPayDeposit(event.target.checked)}
                  className="size-4 rounded border-line accent-brand"
                />
                Pay 30% deposit now
              </label>
              <label className="flex items-center gap-2 text-sm text-ink-muted">
                Method
                <select
                  value={method}
                  onChange={(event) => setMethod(event.target.value)}
                  disabled={!payDeposit}
                  className="h-9 rounded-lg border border-line bg-white px-2 text-sm text-ink shadow-sm outline-none transition focus-visible:border-brand focus-visible:ring-4 focus-visible:ring-brand/15 disabled:opacity-50"
                >
                  {PAYMENT_METHODS.map((option) => (
                    <option key={option} value={option}>
                      {option.replaceAll('_', ' ')}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>
        )}

        {start !== null && (
          <section
            aria-label="Price breakdown"
            className="rounded-xl border border-line bg-surface-muted/50 p-4"
          >
            <dl className="flex flex-col gap-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-muted">
                  Pitch · {formatDuration(durationHours)}
                </dt>
                <dd className="tabular-nums">{formatCurrency(pitchTotal)}</dd>
              </div>
              {extrasTotal > 0 && (
                <div className="flex justify-between">
                  <dt className="text-ink-muted">Extras ({extras.length})</dt>
                  <dd className="tabular-nums">{formatCurrency(extrasTotal)}</dd>
                </div>
              )}
              <div className="mt-1 flex justify-between border-t border-line pt-2 font-semibold">
                <dt>Total</dt>
                <dd className="tabular-nums">{formatCurrency(grandTotal)}</dd>
              </div>
            </dl>
          </section>
        )}

        {apiError && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-sm font-medium text-danger"
          >
            <AlertIcon className="mt-0.5 size-4 shrink-0" />
            {apiError}
          </p>
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
