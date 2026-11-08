import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  DURATION_OPTIONS,
  PRIME_SURCHARGE,
  availableStarts,
  bookingDates,
  buildSlots,
  findConflict,
  freeSlotCount,
  getSlotStates,
  hasAvailability,
  isPast,
  isPrimeTime,
  priceBooking,
  priceRanges,
  slotPrice,
} from './booking'
import { pitches } from './data'
import type { Booking, Pitch } from './types'

const TODAY = '2026-11-07'
const TOMORROW = '2026-11-08'

beforeAll(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 10, 7, 10, 0, 0))
})

afterAll(() => {
  vi.useRealTimers()
})

const court1 = pitches.find((pitch) => pitch.id === 1) as Pitch
const court3 = pitches.find((pitch) => pitch.id === 3) as Pitch
const court5 = pitches.find((pitch) => pitch.id === 5) as Pitch

function booking(overrides: Partial<Booking> & Pick<Booking, 'pitchId' | 'startTime' | 'endTime'>): Booking {
  return {
    id: 'BK-TEST',
    pitchName: 'Test pitch',
    address: 'Test address',
    date: TODAY,
    durationHours: 1,
    pricePerHour: 280_000,
    total: 280_000,
    createdAt: '2026-11-07T00:00:00.000Z',
    ...overrides,
  }
}

describe('buildSlots', () => {
  it('covers every 30-minute start between opening and closing', () => {
    const slots = buildSlots(court1)
    expect(slots[0]).toBe('06:00')
    expect(slots.at(-1)).toBe('22:30')
    expect(slots).toHaveLength(34)
  })

  it('respects non-round opening hours', () => {
    const pitch: Pitch = { ...court1, openAt: '06:30', closeAt: '21:00' }
    const slots = buildSlots(pitch)
    expect(slots[0]).toBe('06:30')
    expect(slots.at(-1)).toBe('20:30')
    expect(slots).toHaveLength(29)
  })
})

describe('slotPrice', () => {
  it('charges the base rate before prime time', () => {
    expect(slotPrice(court1, '16:30')).toBe(280_000)
  })

  it('applies the prime-time surcharge from 17:00', () => {
    expect(isPrimeTime('16:30')).toBe(false)
    expect(isPrimeTime('17:00')).toBe(true)
    expect(slotPrice(court1, '17:00')).toBe(
      Math.round((280_000 * (1 + PRIME_SURCHARGE)) / 1000) * 1000,
    )
  })
})

describe('getSlotStates', () => {
  it('marks taken and past slots on today', () => {
    const slots = getSlotStates(court1, TODAY, [], 10)
    const byStart = new Map(slots.map((slot) => [slot.start, slot.state]))
    expect(byStart.get('09:00')).toBe('past')
    expect(byStart.get('10:00')).toBe('free')
    expect(byStart.get('18:00')).toBe('taken')
    expect(byStart.get('20:00')).toBe('free')
  })

  it('ignores today-only taken slots on other dates', () => {
    const slots = getSlotStates(court1, TOMORROW, [], 10)
    expect(slots.every((slot) => slot.state === 'free')).toBe(true)
  })

  it('layers app bookings over the pitch schedule', () => {
    const slots = getSlotStates(
      court1,
      TOMORROW,
      [booking({ pitchId: 1, date: TOMORROW, startTime: '20:00', endTime: '21:30' })],
      10,
    )
    const byStart = new Map(slots.map((slot) => [slot.start, slot.state]))
    expect(byStart.get('19:30')).toBe('free')
    expect(byStart.get('20:00')).toBe('taken')
    expect(byStart.get('20:30')).toBe('taken')
    expect(byStart.get('21:00')).toBe('taken')
    expect(byStart.get('21:30')).toBe('free')
  })

  it('ignores bookings on other pitches and dates', () => {
    const booked = booking({ pitchId: 2, startTime: '20:00', endTime: '21:00' })
    expect(freeSlotCount(court1, TOMORROW, [booked], 10)).toBe(34)
    expect(
      freeSlotCount(court1, TOMORROW, [{ ...booked, pitchId: 1, date: '2026-11-09' }], 10),
    ).toBe(34)
  })
})

describe('isPast', () => {
  it('only applies to today', () => {
    expect(isPast('09:00', TODAY, 10)).toBe(true)
    expect(isPast('10:00', TODAY, 10)).toBe(false)
    expect(isPast('09:00', TOMORROW, 10)).toBe(false)
  })
})

describe('findConflict', () => {
  it('accepts a free window', () => {
    expect(findConflict(court1, TOMORROW, '09:00', 2, [], 10)).toBeNull()
  })

  it('rejects a window that starts in the past', () => {
    expect(findConflict(court1, TODAY, '09:00', 1, [], 10)).toEqual({ kind: 'past' })
  })

  it('rejects a window that runs past closing time', () => {
    expect(findConflict(court1, TOMORROW, '22:00', 2, [], 10)).toEqual({
      kind: 'closing',
      start: '22:00',
    })
  })

  it('allows a window that ends exactly at closing time', () => {
    expect(findConflict(court1, TOMORROW, '22:00', 1, [], 10)).toBeNull()
  })

  it('reports the first taken slot inside the window', () => {
    expect(findConflict(court1, TODAY, '17:00', 2, [], 10)).toEqual({
      kind: 'taken',
      start: '18:00',
    })
  })

  it('reports a taken slot from an app booking', () => {
    const existing = booking({
      pitchId: 1,
      date: TOMORROW,
      startTime: '20:00',
      endTime: '21:00',
    })
    expect(findConflict(court1, TOMORROW, '19:00', 3, [existing], 10)).toEqual({
      kind: 'taken',
      start: '20:00',
    })
    expect(findConflict(court1, TOMORROW, '21:00', 1, [existing], 10)).toBeNull()
  })

  it('rejects every start on a fully booked pitch', () => {
    expect(hasAvailability(court5, TODAY, [], 10)).toBe(false)
    expect(availableStarts(court5, TODAY, 0.5, [], 10)).toEqual([])
  })
})

describe('availableStarts', () => {
  it('shrinks as the duration grows', () => {
    const short = availableStarts(court1, TODAY, 0.5, [], 10)
    const long = availableStarts(court1, TODAY, 3, [], 10)
    expect(long.length).toBeGreaterThan(0)
    expect(long.length).toBeLessThan(short.length)
    expect(long).not.toContain('17:00')
  })

  it('is empty for durations longer than the opening window', () => {
    expect(availableStarts(court1, TOMORROW, 24, [], 10)).toEqual([])
  })

  it('returns starts in chronological order', () => {
    const starts = availableStarts(court3, TODAY, 1, [], 10)
    expect([...starts].sort()).toEqual(starts)
  })
})

describe('priceBooking', () => {
  it('prices an off-peak window at the base rate', () => {
    const breakdown = priceBooking(court1, '09:00', 2)
    expect(breakdown).toMatchObject({
      standardHours: 2,
      primeHours: 0,
      standardSubtotal: 560_000,
      surcharge: 0,
      total: 560_000,
    })
  })

  it('splits a window that crosses into prime time', () => {
    const breakdown = priceBooking(court1, '16:00', 2)
    expect(breakdown.standardHours).toBe(1)
    expect(breakdown.primeHours).toBe(1)
    expect(breakdown.standardSubtotal).toBe(280_000)
    expect(breakdown.primeSubtotal).toBeGreaterThan(280_000)
    expect(breakdown.surcharge).toBe(breakdown.primeSubtotal - 280_000)
    expect(breakdown.total).toBe(breakdown.standardSubtotal + breakdown.primeSubtotal)
  })

  it('prices a fully prime window', () => {
    const breakdown = priceBooking(court1, '18:00', 1.5)
    expect(breakdown.standardHours).toBe(0)
    expect(breakdown.primeHours).toBe(1.5)
    expect(breakdown.total).toBe(breakdown.primeSubtotal)
  })

  it('matches the sum of the individual slot prices', () => {
    const start = '16:30'
    const duration = 2
    const slots = getSlotStates(court1, TOMORROW, [], 10)
    const index = slots.findIndex((slot) => slot.start === start)
    const expected = slots
      .slice(index, index + duration * 2)
      .reduce((sum, slot) => sum + slot.price / 2, 0)
    expect(priceBooking(court1, start, duration).total).toBe(expected)
  })

  it('handles half-hour durations', () => {
    const breakdown = priceBooking(court1, '09:00', 0.5)
    expect(breakdown.standardHours).toBe(0.5)
    expect(breakdown.total).toBe(140_000)
  })
})

describe('priceRanges', () => {
  it('partitions pitches without overlap', () => {
    const low = pitches.filter((pitch) => priceRanges.low(pitch.pricePerHour))
    const mid = pitches.filter((pitch) => priceRanges.mid(pitch.pricePerHour))
    const high = pitches.filter((pitch) => priceRanges.high(pitch.pricePerHour))
    expect(low.length + mid.length + high.length).toBe(pitches.length)
  })

  it('treats the boundaries as inclusive for the mid range', () => {
    expect(priceRanges.mid(300_000)).toBe(true)
    expect(priceRanges.mid(500_000)).toBe(true)
    expect(priceRanges.low(300_000)).toBe(false)
    expect(priceRanges.high(500_000)).toBe(false)
  })
})

describe('bookingDates', () => {
  it('returns a fortnight starting today', () => {
    const dates = bookingDates(TODAY)
    expect(dates).toHaveLength(14)
    expect(dates[0]).toBe(TODAY)
    expect(dates[1]).toBe(TOMORROW)
    expect(dates.at(-1)).toBe('2026-11-20')
  })
})

describe('duration options', () => {
  it('are all multiples of the 30-minute slot', () => {
    for (const option of DURATION_OPTIONS) {
      expect((option * 60) % 30).toBe(0)
    }
  })
})
