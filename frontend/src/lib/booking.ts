import {
  addDays,
  endTimeOf,
  fromDecimalHours,
  toDecimalHours,
  todayISOIn,
} from './format'
import type { Booking, Pitch, PriceRange } from './types'

export const SLOT_MINUTES = 30

export const DURATION_OPTIONS = [0.5, 1, 1.5, 2, 2.5, 3] as const

/** Prime-time surcharge applied to slots that start at or after this hour. */
export const PRIME_START_HOUR = 17
export const PRIME_SURCHARGE = 0.15

/** The app's business timezone; "today" is always computed in this zone. */
export const APP_TIME_ZONE = 'Asia/Ho_Chi_Minh'

export type SlotState = 'free' | 'taken' | 'past'

export type Slot = {
  start: string
  end: string
  state: SlotState
  price: number
}

export type BookingConflict =
  | { kind: 'past' }
  | { kind: 'taken'; start: string }
  | { kind: 'closing'; start: string }

export type PriceBreakdown = {
  standardHours: number
  primeHours: number
  standardSubtotal: number
  primeSubtotal: number
  surcharge: number
  total: number
}

export const priceRanges: Record<PriceRange, (price: number) => boolean> = {
  all: () => true,
  low: (price) => price < 300_000,
  mid: (price) => price >= 300_000 && price <= 500_000,
  high: (price) => price > 500_000,
}

function minutesOf(time: string): number {
  return Math.round(toDecimalHours(time) * 60)
}

/** Every 30-minute start time between openAt and closeAt. */
export function buildSlots(pitch: Pitch): string[] {
  const slots: string[] = []
  const open = minutesOf(pitch.openAt)
  const close = minutesOf(pitch.closeAt)
  for (let minute = open; minute < close; minute += SLOT_MINUTES) {
    slots.push(fromDecimalHours(minute / 60))
  }
  return slots
}

export function isPrimeTime(start: string): boolean {
  return toDecimalHours(start) >= PRIME_START_HOUR
}

/** Hourly rate for a slot: the base rate, plus the prime-time surcharge. */
export function slotPrice(pitch: Pitch, start: string): number {
  const multiplier = isPrimeTime(start) ? 1 + PRIME_SURCHARGE : 1
  return Math.round((pitch.pricePerHour * multiplier) / 1000) * 1000
}

export function isPast(start: string, today: string, nowHour: number): boolean {
  return today === todayISOIn(APP_TIME_ZONE) && toDecimalHours(start) < nowHour
}

/**
 * The state of every slot for a pitch on a given date.
 * Bookings made through the app are layered on top of the pitch's own
 * `takenSlots`, which only describe today.
 */
export function getSlotStates(
  pitch: Pitch,
  date: string,
  bookings: Booking[],
  nowHour: number,
): Slot[] {
  const taken = new Set<string>()
  if (date === todayISOIn(APP_TIME_ZONE)) {
    pitch.takenSlots.forEach((slot) => taken.add(slot))
  }
  bookings
    .filter((booking) => booking.pitchId === pitch.id && booking.date === date)
    .forEach((booking) => {
      const from = minutesOf(booking.startTime)
      const to = minutesOf(booking.endTime)
      for (let minute = from; minute < to; minute += SLOT_MINUTES) {
        taken.add(fromDecimalHours(minute / 60))
      }
    })

  return buildSlots(pitch).map((start) => {
    const end = endTimeOf(start, SLOT_MINUTES / 60)
    const state: SlotState = isPast(start, date, nowHour)
      ? 'past'
      : taken.has(start)
        ? 'taken'
        : 'free'
    return { start, end, state, price: slotPrice(pitch, start) }
  })
}

/** True when the pitch has at least one bookable slot on that date. */
export function hasAvailability(
  pitch: Pitch,
  date: string,
  bookings: Booking[],
  nowHour: number,
): boolean {
  return getSlotStates(pitch, date, bookings, nowHour).some(
    (slot) => slot.state === 'free',
  )
}

export function freeSlotCount(
  pitch: Pitch,
  date: string,
  bookings: Booking[],
  nowHour: number,
): number {
  return getSlotStates(pitch, date, bookings, nowHour).filter(
    (slot) => slot.state === 'free',
  ).length
}

/**
 * Checks that a booking of `durationHours` starting at `start` fits inside the
 * pitch's opening window without running into a taken slot.
 */
export function findConflict(
  pitch: Pitch,
  date: string,
  start: string,
  durationHours: number,
  bookings: Booking[],
  nowHour: number,
): BookingConflict | null {
  if (isPast(start, date, nowHour)) return { kind: 'past' }

  const startMinute = minutesOf(start)
  const endMinute = startMinute + durationHours * 60
  if (endMinute > minutesOf(pitch.closeAt)) {
    return { kind: 'closing', start }
  }

  const slots = getSlotStates(pitch, date, bookings, nowHour)
  for (let minute = startMinute; minute < endMinute; minute += SLOT_MINUTES) {
    const slotStart = fromDecimalHours(minute / 60)
    const slot = slots.find((candidate) => candidate.start === slotStart)
    if (!slot || slot.state !== 'free') {
      return { kind: 'taken', start: slotStart }
    }
  }
  return null
}

/** Splits a booking window into standard and prime-time hours and prices it. */
export function priceBooking(
  pitch: Pitch,
  start: string,
  durationHours: number,
): PriceBreakdown {
  const startMinute = minutesOf(start)
  const endMinute = startMinute + durationHours * 60
  const primeStartMinute = PRIME_START_HOUR * 60

  let standardMinutes = 0
  let primeMinutes = 0
  for (let minute = startMinute; minute < endMinute; minute += SLOT_MINUTES) {
    if (minute >= primeStartMinute) primeMinutes += SLOT_MINUTES
    else standardMinutes += SLOT_MINUTES
  }

  const standardHours = standardMinutes / 60
  const primeHours = primeMinutes / 60
  const standardSubtotal = Math.round(pitch.pricePerHour * standardHours)
  const primeSubtotal = Math.round(
    pitch.pricePerHour * (1 + PRIME_SURCHARGE) * primeHours,
  )
  const surcharge = primeSubtotal - Math.round(pitch.pricePerHour * primeHours)

  return {
    standardHours,
    primeHours,
    standardSubtotal,
    primeSubtotal,
    surcharge,
    total: standardSubtotal + primeSubtotal,
  }
}

/** Valid booking start times for the given duration, in chronological order. */
export function availableStarts(
  pitch: Pitch,
  date: string,
  durationHours: number,
  bookings: Booking[],
  nowHour: number,
): string[] {
  return buildSlots(pitch).filter(
    (start) =>
      findConflict(pitch, date, start, durationHours, bookings, nowHour) === null,
  )
}

/** The booking calendar runs for a fortnight starting today. */
export const BOOKING_WINDOW_DAYS = 14

export function bookingDates(today = todayISOIn(APP_TIME_ZONE)): string[] {
  return Array.from({ length: BOOKING_WINDOW_DAYS }, (_, index) =>
    addDays(today, index),
  )
}
