import { useCallback, useEffect, useState } from 'react'
import {
  apiBookingToBooking,
  bookingsApi,
  reportsApi,
  type ApiBooking,
  type ApiReport,
} from '../lib/api'
import { formatCurrency, formatDate, formatTimeRange } from '../lib/format'
import { EmptyState } from './ui/Badge'
import { CalendarIcon, SparkIcon } from './ui/Icons'

type AdminDashboardProps = {
  token: string
  role: string
}

const STATUS_OPTIONS = ['PENDING', 'CONFIRMED', 'COMPLETED', 'NO_SHOW', 'CANCELLED']

const statusTone: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-800',
  CONFIRMED: 'bg-emerald-100 text-emerald-800',
  COMPLETED: 'bg-sky-100 text-sky-800',
  CANCELLED: 'bg-red-100 text-red-700',
  NO_SHOW: 'bg-zinc-200 text-zinc-700',
}

function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusTone[status] ?? 'bg-surface-muted text-ink-muted'}`}
    >
      {status.replaceAll('_', ' ').toLowerCase()}
    </span>
  )
}

/** Staff/Admin command centre: booking lifecycle + revenue analytics. */
export function AdminDashboard({ token, role }: AdminDashboardProps) {
  const [bookings, setBookings] = useState<ApiBooking[]>([])
  const [report, setReport] = useState<ApiReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)

  const isAdmin = role === 'ADMIN'

  const load = useCallback(async () => {
    try {
      const list = await bookingsApi.all(token)
      setBookings(list)
      if (isAdmin) {
        setReport(await reportsApi.revenue(token, 30))
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load admin data')
    }
  }, [token, isAdmin])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount effect
    void load()
  }, [load])

  const changeStatus = async (bookingId: number, status: string) => {
    setBusyId(bookingId)
    try {
      await bookingsApi.updateStatus(token, bookingId, status)
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Status update failed')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <p
          role="alert"
          className="rounded-xl bg-red-50 px-3 py-2.5 text-sm font-medium text-danger"
        >
          {error}
        </p>
      )}

      {isAdmin && report && (
        <dl className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
            <dt className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-ink-muted">
              <SparkIcon className="size-4" />
              Revenue (30 days)
            </dt>
            <dd className="mt-2 text-2xl font-semibold tabular-nums text-brand-strong">
              {formatCurrency(report.total_revenue)}
            </dd>
          </div>
          <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
            <dt className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-ink-muted">
              <CalendarIcon className="size-4" />
              Booked statuses
            </dt>
            <dd className="mt-2 text-2xl font-semibold tabular-nums text-ink">
              {Object.values(report.status_counts).reduce((sum, n) => sum + n, 0)}
            </dd>
            <p className="mt-1 text-xs text-ink-muted">
              {Object.entries(report.status_counts)
                .map(([status, count]) => `${status.toLowerCase()} ${count}`)
                .join(' · ')}
            </p>
          </div>
          <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
            <dt className="text-xs font-medium uppercase tracking-wide text-ink-muted">
              Top pitches by revenue
            </dt>
            <dd className="mt-2 flex flex-col gap-1 text-sm">
              {report.revenue_by_field.slice(0, 3).map((field) => (
                <span key={field.field_id} className="flex justify-between">
                  <span className="truncate text-ink-muted">{field.name}</span>
                  <span className="tabular-nums font-semibold text-ink">
                    {formatCurrency(field.revenue)}
                  </span>
                </span>
              ))}
              {report.revenue_by_field.length === 0 && (
                <span className="text-ink-muted">No paid bookings yet</span>
              )}
            </dd>
          </div>
        </dl>
      )}

      <section className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-ink">All bookings</h3>
          <button
            type="button"
            onClick={() => void load()}
            className="text-sm font-medium text-brand-strong hover:text-brand hover:underline"
          >
            Refresh
          </button>
        </div>

        {bookings.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              icon={<CalendarIcon className="size-6" />}
              title="No bookings in the database"
              description="Bookings created by customers will appear here for check-in and settlement."
            />
          </div>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-muted">
                  <th className="py-2 pr-3">Customer</th>
                  <th className="py-2 pr-3">Pitch</th>
                  <th className="py-2 pr-3">When</th>
                  <th className="py-2 pr-3">Total / paid</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2">Set status</th>
                </tr>
              </thead>
              <tbody>
                {bookings.map((raw) => {
                  const booking = apiBookingToBooking(raw)
                  return (
                    <tr key={raw.booking_id} className="border-b border-line/60">
                      <td className="py-2.5 pr-3 font-medium text-ink">
                        {raw.user_name}
                      </td>
                      <td className="py-2.5 pr-3 text-ink-muted">
                        {raw.field_name}
                      </td>
                      <td className="py-2.5 pr-3 text-ink-muted">
                        {formatDate(booking.date)} ·{' '}
                        {formatTimeRange(booking.startTime, booking.durationHours)}
                      </td>
                      <td className="py-2.5 pr-3 tabular-nums">
                        <span className="font-semibold text-ink">
                          {formatCurrency(raw.total_amount)}
                        </span>
                        <span className="ml-1 text-xs text-ink-muted">
                          / {formatCurrency(raw.paid_amount)}
                        </span>
                      </td>
                      <td className="py-2.5 pr-3">
                        <StatusPill status={raw.status} />
                      </td>
                      <td className="py-2.5">
                        <select
                          value={raw.status}
                          disabled={busyId === raw.booking_id}
                          onChange={(event) =>
                            void changeStatus(raw.booking_id, event.target.value)
                          }
                          className="h-9 rounded-lg border border-line bg-white px-2 text-sm text-ink shadow-sm outline-none transition focus-visible:border-brand focus-visible:ring-4 focus-visible:ring-brand/15"
                        >
                          {STATUS_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {option.replaceAll('_', ' ')}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {isAdmin && report && report.top_customers.length > 0 && (
        <section className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
          <h3 className="text-base font-semibold text-ink">Top customers (30 days)</h3>
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            {report.top_customers.slice(0, 5).map((customer) => (
              <li
                key={customer.user_id}
                className="flex items-center justify-between rounded-xl bg-surface-muted/60 px-3 py-2"
              >
                <span className="font-medium text-ink">{customer.full_name}</span>
                <span className="flex items-center gap-3 text-ink-muted">
                  <span>
                    {customer.total_bookings} bookings · {customer.cancellations} cancel
                    · {customer.no_shows} no-show
                  </span>
                  <span className="font-semibold tabular-nums text-ink">
                    {formatCurrency(customer.lifetime_value)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

export default AdminDashboard
