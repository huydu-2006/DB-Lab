import { useMemo, useState } from 'react'
import Logo from '../Logo'
import { BookingDialog } from '../components/BookingDialog'
import { MyBookings } from '../components/MyBookings'
import { PitchCard } from '../components/PitchCard'
import { EmptyState, Badge } from '../components/ui/Badge'
import { Select } from '../components/ui/Field'
import {
  BallIcon,
  CalendarIcon,
  ClockIcon,
  PinIcon,
  SearchIcon,
  SparkIcon,
} from '../components/ui/Icons'
import { ToastStack } from '../components/ui/Toast'
import type { ToastMessage, ToastTone } from '../components/ui/Toast'
import {
  APP_TIME_ZONE,
  bookingDates,
  getSlotStates,
  priceRanges,
} from '../lib/booking'
import { pitches } from '../lib/data'
import {
  formatCurrency,
  formatDuration,
  formatRelativeDate,
  nowHourIn,
  todayISOIn,
} from '../lib/format'
import type {
  Booking,
  Pitch,
  PitchType,
  PriceRange,
  SortOption,
  StatusFilter,
  Tab,
} from '../lib/types'

const fieldClass =
  'h-10 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink shadow-sm outline-none transition placeholder:text-ink-muted/50 focus-visible:border-brand focus-visible:ring-4 focus-visible:ring-brand/15'

const sortLabels: Record<SortOption, string> = {
  recommended: 'Recommended',
  'price-asc': 'Price: low to high',
  'price-desc': 'Price: high to low',
  rating: 'Top rated',
}

let toastId = 0

function Dashboard({ onLogout }: { onLogout: () => void }) {
  const today = todayISOIn(APP_TIME_ZONE)
  const [date, setDate] = useState(today)
  const [location, setLocation] = useState('')
  const [type, setType] = useState<PitchType | 'all'>('all')
  const [priceRange, setPriceRange] = useState<PriceRange>('all')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [sort, setSort] = useState<SortOption>('recommended')

  const [tab, setTab] = useState<Tab>('pitches')
  const [bookings, setBookings] = useState<Booking[]>([])
  const [dialogPitch, setDialogPitch] = useState<Pitch | null>(null)
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  const nowHour = nowHourIn(APP_TIME_ZONE)
  const dates = useMemo(() => bookingDates(today), [today])

  const pushToast = (tone: ToastTone, title: string, description?: string) => {
    const id = ++toastId
    setToasts((current) => [...current, { id, tone, title, description }])
  }

  const dismissToast = (id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }

  const availability = useMemo(
    () =>
      new Map(
        pitches.map((pitch) => {
          const slots = getSlotStates(pitch, date, bookings, nowHour)
          return [
            pitch.id,
            {
              free: slots.filter((slot) => slot.state === 'free').length,
              total: slots.length,
            },
          ] as const
        }),
      ),
    [date, bookings, nowHour],
  )

  const search = location.trim().toLowerCase()
  const visiblePitches = useMemo(() => {
    const filtered = pitches.filter((pitch) => {
      const free = availability.get(pitch.id)?.free ?? 0
      return (
        (search === '' ||
          `${pitch.name} ${pitch.address} ${pitch.district}`
            .toLowerCase()
            .includes(search)) &&
        (type === 'all' || pitch.type === type) &&
        priceRanges[priceRange](pitch.pricePerHour) &&
        (status === 'all' || (status === 'available') === (free > 0))
      )
    })

    return [...filtered].sort((a, b) => {
      if (sort === 'price-asc') return a.pricePerHour - b.pricePerHour
      if (sort === 'price-desc') return b.pricePerHour - a.pricePerHour
      if (sort === 'rating') return b.rating - a.rating
      const aFree = availability.get(a.id)?.free ?? 0
      const bFree = availability.get(b.id)?.free ?? 0
      return bFree - aFree || b.rating - a.rating
    })
  }, [search, type, priceRange, status, sort, availability])

  const total = pitches.length
  const availableCount = pitches.filter(
    (pitch) => (availability.get(pitch.id)?.free ?? 0) > 0,
  ).length
  const totalFreeSlots = [...availability.values()].reduce(
    (sum, entry) => sum + entry.free,
    0,
  )
  const hasFilters =
    location !== '' || type !== 'all' || priceRange !== 'all' || status !== 'all'

  const resetFilters = () => {
    setLocation('')
    setType('all')
    setPriceRange('all')
    setStatus('all')
    setSort('recommended')
  }

  const confirmBooking = (pitch: Pitch, start: string, durationHours: number) => {
    const slots = getSlotStates(pitch, date, bookings, nowHour)
    const startIndex = slots.findIndex((slot) => slot.start === start)
    const endTime = slots[startIndex + durationHours * 2 - 1]?.end ?? start
    const price = slots
      .slice(startIndex, startIndex + durationHours * 2)
      .reduce((sum, slot) => sum + slot.price, 0)

    const booking: Booking = {
      id: `BK-${Date.now().toString(36).toUpperCase()}`,
      pitchId: pitch.id,
      pitchName: pitch.name,
      address: pitch.address,
      date,
      startTime: start,
      endTime,
      durationHours,
      pricePerHour: pitch.pricePerHour,
      total: price,
      createdAt: new Date().toISOString(),
    }

    setBookings((current) => [...current, booking])
    setDialogPitch(null)
    pushToast(
      'success',
      'Booking confirmed',
      `${pitch.name} · ${formatRelativeDate(date)} at ${start} · ${formatCurrency(price)}`,
    )
  }

  const cancelBooking = (booking: Booking) => {
    setBookings((current) => current.filter((item) => item.id !== booking.id))
    pushToast(
      'info',
      'Booking cancelled',
      `${booking.pitchName} · ${formatRelativeDate(booking.date)} at ${booking.startTime}`,
    )
  }

  const summary = [
    {
      label: 'Pitches',
      value: String(total),
      hint: 'in your network',
      icon: <BallIcon className="size-4" />,
    },
    {
      label: 'Available',
      value: String(availableCount),
      hint: formatRelativeDate(date).toLowerCase(),
      icon: <CalendarIcon className="size-4" />,
      accent: true,
    },
    {
      label: 'Free slots',
      value: String(totalFreeSlots),
      hint: '30-minute blocks',
      icon: <ClockIcon className="size-4" />,
    },
    {
      label: 'My bookings',
      value: String(bookings.length),
      hint: bookings.length === 0 ? 'none yet' : 'upcoming',
      icon: <SparkIcon className="size-4" />,
    },
  ]

  return (
    <div className="min-h-svh bg-canvas text-ink">
      <header className="sticky top-0 z-20 border-b border-line bg-surface/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3.5">
          <Logo />
          <nav aria-label="Sections" className="hidden sm:block">
            <div className="flex items-center gap-1 rounded-xl bg-surface-muted p-1">
              {(
                [
                  ['pitches', 'Find a pitch', <BallIcon key="p" className="size-4" />],
                  [
                    'bookings',
                    `My bookings${bookings.length ? ` (${bookings.length})` : ''}`,
                    <CalendarIcon key="b" className="size-4" />,
                  ],
                ] as const
              ).map(([value, label, icon]) => (
                <button
                  key={value}
                  type="button"
                  aria-current={tab === value ? 'page' : undefined}
                  onClick={() => setTab(value)}
                  className={
                    tab === value
                      ? 'inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-ink shadow-sm'
                      : 'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-ink-muted transition hover:text-ink'
                  }
                >
                  {icon}
                  {label}
                </button>
              ))}
            </div>
          </nav>
          <div className="flex items-center gap-2.5">
            <span className="hidden size-9 place-items-center rounded-full bg-surface-muted text-ink-muted ring-1 ring-line sm:grid">
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                className="size-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="8" r="3.5" />
                <path d="M5 20a7 7 0 0 1 14 0" />
              </svg>
            </span>
            <button
              type="button"
              onClick={onLogout}
              className="rounded-lg border border-line bg-white px-3.5 py-2 text-sm font-medium text-ink-muted shadow-sm transition hover:bg-surface-muted hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/15"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">
              {tab === 'pitches' ? 'Find a pitch' : 'My bookings'}
            </h1>
            <p className="mt-1.5 text-sm text-ink-muted">
              {tab === 'pitches'
                ? 'Compare pitches, check live availability, and lock in a slot.'
                : 'Every session you have reserved, in one place.'}
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 shadow-sm">
            <CalendarIcon className="size-4 text-ink-muted" />
            <label htmlFor="play-date" className="text-sm font-medium text-ink-muted">
              Play on
            </label>
            <Select
              id="play-date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="w-40"
            >
              {dates.map((value) => (
                <option key={value} value={value}>
                  {formatRelativeDate(value)}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <dl className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {summary.map((item) => (
            <div
              key={item.label}
              className="rounded-2xl border border-line bg-surface p-5 shadow-sm"
            >
              <dt className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-ink-muted">
                <span
                  className={`grid size-6 place-items-center rounded-md ${item.accent ? 'bg-brand-soft text-brand-strong' : 'bg-surface-muted text-ink-muted'}`}
                >
                  {item.icon}
                </span>
                {item.label}
              </dt>
              <dd
                className={`mt-2 text-2xl font-semibold tabular-nums ${
                  item.accent ? 'text-brand-strong' : 'text-ink'
                }`}
              >
                {item.value}
              </dd>
              <p className="mt-1 text-xs text-ink-muted">{item.hint}</p>
            </div>
          ))}
        </dl>

        <div className="mt-6 flex gap-1 rounded-xl bg-surface-muted p-1 sm:hidden">
          {(['pitches', 'bookings'] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              className={
                tab === value
                  ? 'flex-1 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-ink shadow-sm'
                  : 'flex-1 rounded-lg px-3 py-2 text-sm font-medium text-ink-muted'
              }
            >
              {value === 'pitches' ? 'Find a pitch' : `My bookings (${bookings.length})`}
            </button>
          ))}
        </div>

        {tab === 'pitches' ? (
          <section className="mt-8" aria-labelledby="pitches-heading">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="pitches-heading" className="text-xl font-semibold tracking-tight">
                Pitches
              </h2>
              <div className="flex items-center gap-3 text-sm text-ink-muted">
                <span>
                  Showing <span className="font-medium text-ink">{visiblePitches.length}</span> of{' '}
                  {total}
                </span>
                {hasFilters && (
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="font-medium text-brand-strong hover:text-brand hover:underline"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-line bg-surface p-4 shadow-sm">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <label className="flex flex-col gap-1.5 text-sm lg:col-span-2">
                  <span className="font-medium text-ink-muted">Search</span>
                  <div className="relative">
                    <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
                    <input
                      type="search"
                      value={location}
                      onChange={(event) => setLocation(event.target.value)}
                      placeholder="Name, address or district"
                      className={`${fieldClass} pl-9`}
                    />
                  </div>
                </label>

                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium text-ink-muted">Pitch type</span>
                  <Select
                    value={type}
                    onChange={(event) => setType(event.target.value as PitchType | 'all')}
                  >
                    <option value="all">All types</option>
                    <option value="5-a-side">5-a-side</option>
                    <option value="7-a-side">7-a-side</option>
                    <option value="11-a-side">11-a-side</option>
                  </Select>
                </label>

                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium text-ink-muted">Price per hour</span>
                  <Select
                    value={priceRange}
                    onChange={(event) => setPriceRange(event.target.value as PriceRange)}
                  >
                    <option value="all">All prices</option>
                    <option value="low">Under 300,000 ₫</option>
                    <option value="mid">300,000 – 500,000 ₫</option>
                    <option value="high">Over 500,000 ₫</option>
                  </Select>
                </label>

                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium text-ink-muted">Availability</span>
                  <Select
                    value={status}
                    onChange={(event) => setStatus(event.target.value as StatusFilter)}
                  >
                    <option value="all">Any availability</option>
                    <option value="available">Has free slots</option>
                    <option value="booked">Fully booked</option>
                  </Select>
                </label>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">
                    Sort
                  </span>
                  {(Object.keys(sortLabels) as SortOption[]).map((option) => (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={sort === option}
                      onClick={() => setSort(option)}
                      className={
                        sort === option
                          ? 'rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold text-brand-strong'
                          : 'rounded-full px-3 py-1 text-xs font-medium text-ink-muted transition hover:bg-surface-muted hover:text-ink'
                      }
                    >
                      {sortLabels[option]}
                    </button>
                  ))}
                </div>
                {status !== 'all' && (
                  <Badge tone="brand">
                    <PinIcon className="size-3" />
                    {status === 'available' ? 'Free slots' : 'Fully booked'}
                  </Badge>
                )}
              </div>
            </div>

            {visiblePitches.length === 0 ? (
              <div className="mt-4">
                <EmptyState
                  icon={<SearchIcon className="size-6" />}
                  title="No pitches match these filters"
                  description="Try widening the price range, picking another date, or clearing the search."
                  action={
                    <button
                      type="button"
                      onClick={resetFilters}
                      className="inline-flex h-10 items-center rounded-xl border border-line bg-white px-4 text-sm font-medium text-ink shadow-sm transition hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/15"
                    >
                      Clear filters
                    </button>
                  }
                />
              </div>
            ) : (
              <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {visiblePitches.map((pitch) => {
                  const entry = availability.get(pitch.id)
                  return (
                    <li key={pitch.id}>
                      <PitchCard
                        pitch={pitch}
                        freeSlots={entry?.free ?? 0}
                        totalSlots={entry?.total ?? 0}
                        onBook={setDialogPitch}
                      />
                    </li>
                  )
                })}
              </ul>
            )}

            <p className="mt-6 text-xs text-ink-muted">
              Showing availability for {formatRelativeDate(date)}. Prime time from 17:00 carries a
              15% surcharge. Slots are 30 minutes long;{' '}
              {formatDuration(0.5)} minimum booking.
            </p>
          </section>
        ) : (
          <section className="mt-8" aria-labelledby="bookings-heading">
            <h2 id="bookings-heading" className="sr-only">
              My bookings
            </h2>
            <MyBookings
              bookings={bookings}
              onCancel={cancelBooking}
              onBrowse={() => setTab('pitches')}
            />
          </section>
        )}
      </main>

      <BookingDialog
        key={`${dialogPitch?.id ?? 'none'}-${date}`}
        pitch={dialogPitch}
        date={date}
        bookings={bookings}
        nowHour={nowHour}
        onClose={() => setDialogPitch(null)}
        onConfirm={confirmBooking}
      />

      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}

export default Dashboard
