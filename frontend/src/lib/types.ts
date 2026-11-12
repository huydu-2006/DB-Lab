export type PitchType = '5-a-side' | '7-a-side' | '11-a-side'

export type Surface = 'Natural grass' | 'Artificial turf'

export type Amenity =
  | 'Floodlights'
  | 'Changing rooms'
  | 'Parking'
  | 'Showers'
  | 'Café'
  | 'Free Wi-Fi'
  | 'Equipment hire'
  | 'First aid'

export type Pitch = {
  id: number
  name: string
  address: string
  district: string
  type: PitchType
  surface: Surface
  pricePerHour: number
  rating: number
  reviews: number
  amenities: Amenity[]
  /** Opening window in 24h "HH:MM" strings, inclusive of open, exclusive of close. */
  openAt: string
  closeAt: string
  /** Slots that are already taken today, as 24h "HH:MM" start times. */
  takenSlots: string[]
}

export type Booking = {
  id: string
  /** Present when the booking lives in the SQL Server database. */
  dbId?: number
  /** DB status: PENDING / CONFIRMED / COMPLETED / CANCELLED / NO_SHOW. */
  status?: string
  pitchId: number
  pitchName: string
  address: string
  date: string
  startTime: string
  endTime: string
  durationHours: number
  pricePerHour: number
  total: number
  createdAt: string
}

export type PriceRange = 'all' | 'low' | 'mid' | 'high'

export type StatusFilter = 'all' | 'available' | 'booked'

export type SortOption = 'recommended' | 'price-asc' | 'price-desc' | 'rating'

export type Tab = 'pitches' | 'bookings'

export type BookingDraft = {
  pitchId: number
  date: string
  startTime: string
  durationHours: number
}

export type Credentials = { email: string; password: string }

/** FastAPI error responses have the shape `{ detail: string }`. */
export type ApiErrorBody = { detail?: string }
