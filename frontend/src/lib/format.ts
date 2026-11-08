const VND = new Intl.NumberFormat('vi-VN', {
  maximumFractionDigits: 0,
})

/** 280000 -> "280.000 ₫" */
export function formatCurrency(amount: number): string {
  return `${VND.format(amount)} ₫`
}

/** 280000 -> "280k" — for dense spots such as card footers. */
export function formatCompactCurrency(amount: number): string {
  if (amount >= 1_000_000) {
    const millions = amount / 1_000_000
    return `${millions.toFixed(millions % 1 === 0 ? 0 : 1).replace('.', ',')}tr ₫`
  }
  return `${Math.round(amount / 1000)}k ₫`
}

/** "14:30" -> "14:30" (identity helper that documents the 24h contract). */
export function formatTime(time: string): string {
  return time
}

/** "14:30" -> 14.5 */
export function toDecimalHours(time: string): number {
  const [hours, minutes] = time.split(':').map(Number)
  return hours + minutes / 60
}

/** 14.5 -> "14:30" */
export function fromDecimalHours(value: number): string {
  const hours = Math.floor(value)
  const minutes = Math.round((value - hours) * 60)
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

/** Local calendar date as "YYYY-MM-DD" (never UTC, so it survives midnight). */
export function toISODate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function todayISO(): string {
  return toISODate(new Date())
}

/**
 * Today's calendar date in a specific IANA timezone, independent of the
 * browser's own clock settings.
 */
export function todayISOIn(timeZone: string, now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

/** The current wall-clock hour in a specific IANA timezone, e.g. 17.5. */
export function nowHourIn(timeZone: string, now = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now)
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0)
  return get('hour') + get('minute') / 60
}

/** Adds whole days to a "YYYY-MM-DD" string without timezone drift. */
export function addDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  date.setDate(date.getDate() + days)
  return toISODate(date)
}

/** "2026-11-07" -> "Sat 7 Nov" */
export function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

/** "2026-11-07" -> "Today" / "Tomorrow" / "Sat 7 Nov" */
export function formatRelativeDate(isoDate: string, today = todayISO()): string {
  if (isoDate === today) return 'Today'
  if (isoDate === addDays(today, 1)) return 'Tomorrow'
  return formatDate(isoDate)
}

/** 1.5 -> "1.5h", 2 -> "2h" */
export function formatDuration(hours: number): string {
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)}h`
}

/** "14:30" + 1.5 -> "14:30 – 16:00" */
export function formatTimeRange(startTime: string, durationHours: number): string {
  const end = fromDecimalHours(toDecimalHours(startTime) + durationHours)
  return `${startTime} – ${end}`
}

export function endTimeOf(startTime: string, durationHours: number): string {
  return fromDecimalHours(toDecimalHours(startTime) + durationHours)
}
