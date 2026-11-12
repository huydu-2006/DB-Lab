import { useMemo, useState } from 'react'
import { formatCurrency, formatDate, formatDuration, formatTimeRange } from '../lib/format'
import type { Booking } from '../lib/types'
import { EmptyState } from './ui/Badge'
import { CalendarIcon, SearchIcon, TrashIcon } from './ui/Icons'
import { MapLink } from './MapLink'

type MyBookingsProps = {
  bookings: Booking[]
  onCancel: (booking: Booking) => void
  onBrowse: () => void
}

type Sort = 'soonest' | 'latest' | 'price'

export function MyBookings({ bookings, onCancel, onBrowse }: MyBookingsProps) {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<Sort>('soonest')
  const [pendingCancel, setPendingCancel] = useState<string | null>(null)

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const filtered = bookings.filter(
      (booking) =>
        needle === '' ||
        `${booking.pitchName} ${booking.address} ${booking.date}`
          .toLowerCase()
          .includes(needle),
    )
    return [...filtered].sort((a, b) => {
      if (sort === 'price') return b.total - a.total
      const aKey = `${a.date} ${a.startTime}`
      const bKey = `${b.date} ${b.startTime}`
      return sort === 'soonest' ? aKey.localeCompare(bKey) : bKey.localeCompare(aKey)
    })
  }, [bookings, query, sort])

  const totalSpend = bookings.reduce((sum, booking) => sum + booking.total, 0)
  const totalHours = bookings.reduce((sum, booking) => sum + booking.durationHours, 0)

  if (bookings.length === 0) {
    return (
      <EmptyState
        icon={<CalendarIcon className="size-6" />}
        title="No bookings yet"
        description="Pick a pitch and a slot and your reservations will show up here, ready to manage."
        action={
          <button
            type="button"
            onClick={onBrowse}
            className="inline-flex h-10 items-center rounded-xl bg-brand-strong px-4 text-sm font-semibold text-white shadow-sm shadow-brand-strong/30 transition hover:bg-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/35"
          >
            Browse pitches
          </button>
        }
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <dl className="grid gap-4 sm:grid-cols-3">
        {[
          { label: 'Active bookings', value: String(bookings.length), hint: 'upcoming sessions' },
          { label: 'Hours reserved', value: formatDuration(totalHours), hint: 'on the pitch' },
          { label: 'Total spend', value: formatCurrency(totalSpend), hint: 'incl. prime time' },
        ].map((item) => (
          <div key={item.label} className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
            <dt className="text-xs font-medium uppercase tracking-wide text-ink-muted">
              {item.label}
            </dt>
            <dd className="mt-2 text-2xl font-semibold tabular-nums text-ink">{item.value}</dd>
            <p className="mt-1 text-xs text-ink-muted">{item.hint}</p>
          </div>
        ))}
      </dl>

      <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 shadow-sm sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search your bookings"
            aria-label="Search your bookings"
            className="h-10 w-full rounded-lg border border-line bg-white pl-9 pr-3 text-sm text-ink shadow-sm outline-none transition placeholder:text-ink-muted/50 focus-visible:border-brand focus-visible:ring-4 focus-visible:ring-brand/15"
          />
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="booking-sort" className="text-sm text-ink-muted">
            Sort
          </label>
          <select
            id="booking-sort"
            value={sort}
            onChange={(event) => setSort(event.target.value as Sort)}
            className="h-10 rounded-lg border border-line bg-white px-3 text-sm text-ink shadow-sm outline-none transition focus-visible:border-brand focus-visible:ring-4 focus-visible:ring-brand/15"
          >
            <option value="soonest">Soonest first</option>
            <option value="latest">Latest first</option>
            <option value="price">Highest price</option>
          </select>
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={<SearchIcon className="size-6" />}
          title="No bookings match your search"
          description="Try a different pitch name or clear the search box."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {visible.map((booking) => {
            const confirming = pendingCancel === booking.id
            return (
              <li
                key={booking.id}
                className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5"
              >
                <div className="flex min-w-0 items-start gap-4">
                  <div className="grid w-14 shrink-0 place-items-center rounded-xl bg-brand-soft py-2 text-brand-strong">
                    <span className="text-[10px] font-semibold uppercase tracking-wide">
                      {formatDate(booking.date).split(',')[0]}
                    </span>
                    <span className="text-lg font-bold leading-tight tabular-nums">
                      {Number(booking.date.slice(8, 10))}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-ink">{booking.pitchName}</p>
                    <MapLink
                      location={{ name: booking.pitchName, address: booking.address }}
                      className="mt-0.5 block truncate text-sm text-ink-muted transition hover:text-brand hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/35"
                    >
                      {booking.address}
                    </MapLink>
                    <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
                      <span className="font-medium text-ink">
                        {formatTimeRange(booking.startTime, booking.durationHours)}
                      </span>
                      <span>{formatDate(booking.date)}</span>
                      <span>{formatDuration(booking.durationHours)}</span>
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center justify-between gap-3 sm:justify-end">
                  <span className="text-base font-semibold tabular-nums text-ink">
                    {formatCurrency(booking.total)}
                  </span>
                  {confirming ? (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          onCancel(booking)
                          setPendingCancel(null)
                        }}
                        className="h-9 rounded-lg bg-danger px-3 text-xs font-semibold text-white transition hover:bg-red-600 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-danger/30"
                      >
                        Confirm cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingCancel(null)}
                        className="h-9 rounded-lg border border-line bg-white px-3 text-xs font-medium text-ink-muted transition hover:bg-surface-muted hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/15"
                      >
                        Keep
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setPendingCancel(booking.id)}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-white px-3 text-xs font-medium text-ink-muted shadow-sm transition hover:border-danger/40 hover:text-danger focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-danger/20"
                    >
                      <TrashIcon className="size-3.5" />
                      Cancel
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
