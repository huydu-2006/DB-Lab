import { describe, expect, it } from 'vitest'
import { validateCredentials } from './auth'
import {
  addDays,
  endTimeOf,
  formatCompactCurrency,
  formatCurrency,
  formatDate,
  formatDuration,
  formatRelativeDate,
  formatTimeRange,
  fromDecimalHours,
  nowHourIn,
  toDecimalHours,
  toISODate,
  todayISOIn,
} from './format'

describe('formatCurrency', () => {
  it('uses Vietnamese thousands separators and the đồng sign', () => {
    expect(formatCurrency(280_000)).toBe('280.000 ₫')
    expect(formatCurrency(0)).toBe('0 ₫')
    expect(formatCurrency(1_250_000)).toBe('1.250.000 ₫')
  })
})

describe('formatCompactCurrency', () => {
  it('shortens thousands', () => {
    expect(formatCompactCurrency(280_000)).toBe('280k ₫')
  })

  it('shortens millions with a comma decimal', () => {
    expect(formatCompactCurrency(1_000_000)).toBe('1tr ₫')
    expect(formatCompactCurrency(1_500_000)).toBe('1,5tr ₫')
  })
})

describe('time helpers', () => {
  it('round-trips decimal hours', () => {
    expect(toDecimalHours('14:30')).toBe(14.5)
    expect(fromDecimalHours(14.5)).toBe('14:30')
    expect(fromDecimalHours(9)).toBe('09:00')
  })

  it('computes an end time', () => {
    expect(endTimeOf('14:30', 1.5)).toBe('16:00')
    expect(endTimeOf('22:30', 1)).toBe('23:30')
  })

  it('formats a range', () => {
    expect(formatTimeRange('14:30', 1.5)).toBe('14:30 – 16:00')
  })
})

describe('date helpers', () => {
  it('formats local dates without timezone drift', () => {
    expect(toISODate(new Date(2026, 0, 1))).toBe('2026-01-01')
    expect(toISODate(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31')
  })

  it('adds days across month boundaries', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
  })

  it('formats a readable date', () => {
    expect(formatDate('2026-11-07')).toBe('Sat 7 Nov')
  })

  it('labels today and tomorrow relatively', () => {
    expect(formatRelativeDate('2026-11-07', '2026-11-07')).toBe('Today')
    expect(formatRelativeDate('2026-11-08', '2026-11-07')).toBe('Tomorrow')
    expect(formatRelativeDate('2026-11-09', '2026-11-07')).toBe('Mon 9 Nov')
  })
})

describe('timezone helpers', () => {
  it('resolves today in a target timezone', () => {
    // 2026-11-07T18:30Z is already 2026-11-08 in Ho Chi Minh City (UTC+7).
    const instant = new Date('2026-11-07T18:30:00.000Z')
    expect(todayISOIn('Asia/Ho_Chi_Minh', instant)).toBe('2026-11-08')
    expect(todayISOIn('UTC', instant)).toBe('2026-11-07')
  })

  it('resolves the wall-clock hour in a target timezone', () => {
    const instant = new Date('2026-11-07T10:45:00.000Z')
    expect(nowHourIn('Asia/Ho_Chi_Minh', instant)).toBe(17.75)
    expect(nowHourIn('UTC', instant)).toBe(10.75)
  })
})

describe('formatDuration', () => {
  it('drops the decimal for whole hours', () => {
    expect(formatDuration(2)).toBe('2h')
    expect(formatDuration(1.5)).toBe('1.5h')
    expect(formatDuration(0.5)).toBe('0.5h')
  })
})

describe('validateCredentials', () => {
  it('accepts the demo credentials', () => {
    expect(
      validateCredentials({ email: 'manager@bk88.vn', password: 'matchday' }),
    ).toEqual({})
  })

  it('requires an email', () => {
    expect(validateCredentials({ email: '  ', password: 'matchday' }).email).toBeDefined()
  })

  it('rejects malformed emails', () => {
    expect(validateCredentials({ email: 'nope', password: 'matchday' }).email).toBeDefined()
    expect(
      validateCredentials({ email: 'a@b', password: 'matchday' }).email,
    ).toBeDefined()
  })

  it('requires a password of at least six characters', () => {
    expect(validateCredentials({ email: 'a@b.co', password: '' }).password).toBeDefined()
    expect(validateCredentials({ email: 'a@b.co', password: '12345' }).password).toBeDefined()
    expect(validateCredentials({ email: 'a@b.co', password: '123456' }).password).toBeUndefined()
  })

  it('reports both errors at once', () => {
    const errors = validateCredentials({ email: '', password: '' })
    expect(Object.keys(errors).sort()).toEqual(['email', 'password'])
  })
})
