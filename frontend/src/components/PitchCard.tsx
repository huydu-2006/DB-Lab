import { formatCurrency } from '../lib/format'
import type { Pitch } from '../lib/types'
import { Badge, StatusPill } from './ui/Badge'
import { CalendarIcon, ClockIcon, PinIcon, StarIcon, UsersIcon } from './ui/Icons'
import { MapLink } from './MapLink'

type PitchCardProps = {
  pitch: Pitch
  freeSlots: number
  totalSlots: number
  onBook: (pitch: Pitch) => void
}

export function PitchCard({ pitch, freeSlots, totalSlots, onBook }: PitchCardProps) {
  const available = freeSlots > 0
  const ratio = totalSlots === 0 ? 0 : freeSlots / totalSlots

  return (
    <article className="flex flex-col rounded-2xl border border-line bg-surface shadow-sm transition hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-md">
      <div className="pitch-bg relative flex items-center justify-between rounded-t-2xl border-b border-line px-4 py-3">
        <Badge tone="brand" className="bg-white/80 backdrop-blur">
          <UsersIcon className="size-3.5" />
          {pitch.type}
        </Badge>
        <span className="inline-flex items-center gap-1 rounded-md bg-white/80 px-2 py-1 text-xs font-semibold text-ink shadow-sm backdrop-blur">
          <StarIcon className="size-3 text-amber-500" />
          {pitch.rating.toFixed(1)}
          <span className="font-normal text-ink-muted">({pitch.reviews})</span>
        </span>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-semibold leading-snug text-ink">{pitch.name}</h3>
          <StatusPill available={available} label={available ? `${freeSlots} free` : 'Fully booked'} />
        </div>

        <MapLink
          location={pitch}
          label={pitch.name}
          className="mt-1.5 flex items-start gap-1.5 text-sm text-ink-muted transition hover:text-brand hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/35"
        >
          <PinIcon className="mt-0.5 size-3.5 shrink-0" />
          <span>{pitch.address}</span>
        </MapLink>

        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
          <span className="inline-flex items-center gap-1">
            <ClockIcon className="size-3" />
            {pitch.openAt} – {pitch.closeAt}
          </span>
          <span className="inline-flex items-center gap-1">
            <CalendarIcon className="size-3" />
            {pitch.surface}
          </span>
        </p>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {pitch.amenities.slice(0, 3).map((amenity) => (
            <Badge key={amenity} tone="outline">
              {amenity}
            </Badge>
          ))}
          {pitch.amenities.length > 3 && (
            <Badge tone="outline">+{pitch.amenities.length - 3}</Badge>
          )}
        </div>

        <div className="mt-4">
          <div
            className="h-1.5 overflow-hidden rounded-full bg-surface-muted"
            role="img"
            aria-label={`${freeSlots} of ${totalSlots} slots available`}
          >
            <div
              className={`h-full rounded-full transition-all ${available ? 'bg-brand' : 'bg-ink-muted/30'}`}
              style={{ width: `${Math.max(ratio * 100, available ? 6 : 0)}%` }}
            />
          </div>
          <p className="mt-1.5 text-xs tabular-nums text-ink-muted">
            {freeSlots} of {totalSlots} slots free
          </p>
        </div>

        <div className="mt-4 flex items-end justify-between gap-3 border-t border-line pt-3.5">
          <div>
            <p className="text-lg font-semibold leading-none tabular-nums text-ink">
              {formatCurrency(pitch.pricePerHour)}
            </p>
            <p className="mt-1 text-xs text-ink-muted">per hour</p>
          </div>
          <button
            type="button"
            onClick={() => onBook(pitch)}
            disabled={!available}
            aria-label={`Book ${pitch.name}`}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-brand-strong px-3.5 text-sm font-semibold text-white shadow-sm shadow-brand-strong/25 transition hover:bg-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/35 active:translate-y-px disabled:cursor-not-allowed disabled:bg-ink-muted/30 disabled:shadow-none"
          >
            <CalendarIcon className="size-3.5" />
            Book
          </button>
        </div>
      </div>
    </article>
  )
}
