// ---------------------------------------------------------------------------
// Map integration — the ONLY place in the app that knows about a map provider.
// Today: a plain Google Maps search link per court. Tomorrow (embed, static
// map tiles, directions, or a different provider entirely): change this module
// only; components keep calling buildMapsUrl() / MapLink and never break.
// ---------------------------------------------------------------------------

/** Minimal location contract shared by the DB (FIELDS.latitude/longitude) and the frontend domain types. */
export type MapsLocation = {
  name?: string
  address: string
  /** WGS-84; optional — when absent the map is searched by address text. */
  lat?: number
  lng?: number
}

/**
 * Build the external map URL for a court.
 *
 * Uses the Google Maps "Search API" universal URL (https://developers.google.com/maps/documentation/urls/get-started):
 * it works without an API key and stays stable across Google Maps UI upgrades.
 * Coordinates are preferred (exact pin on the venue); the address text is the
 * fallback and also always part of the query so search context is preserved.
 */
export function buildMapsUrl(location: MapsLocation): string {
  const query =
    location.lat !== undefined && location.lng !== undefined
      ? `${location.lat},${location.lng}`
      : [location.name, location.address]
          .filter((part) => part && part.length > 0)
          .join(' ')
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}
