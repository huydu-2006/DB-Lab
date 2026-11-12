import type { ReactNode } from 'react'

import { buildMapsUrl, type MapsLocation } from '../lib/maps'

type MapLinkProps = {
  location: MapsLocation
  /** Accessible name of the link target, e.g. "BK-88 Arena – Court 1". */
  label?: string
  className?: string
  children: ReactNode
}

/**
 * Link that opens the court's location in Google Maps (new tab).
 * Provider/URL construction lives in ../lib/maps — keep this component dumb.
 */
export function MapLink({ location, label, className, children }: MapLinkProps) {
  const target = label ?? location.name ?? location.address
  return (
    <a
      href={buildMapsUrl(location)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Find "${target}" on Google Maps`}
      className={
        className ??
        'inline-flex items-start gap-1.5 underline-offset-2 transition hover:text-brand hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/35'
      }
    >
      {children}
    </a>
  )
}
