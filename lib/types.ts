/** What this aircraft is doing relative to your station. */
export type FlightPhase = "arriving" | "departing" | "overflight" | "unknown";

/**
 * `airport`: only flights landing at or taking off from the home airport.
 * `all`: everything in range, overflights included.
 */
export type TrafficFilter = "airport" | "all";

export interface HomeAirport {
  iata: string;
  icao: string;
  /** Short place name for copy, e.g. "Ottawa". */
  name: string;
  lat: number;
  lon: number;
}

export interface AirportRef {
  iata: string | null;
  icao: string | null;
  name: string | null;
  municipality: string | null;
  countryName: string | null;
  lat: number | null;
  lon: number | null;
}

/**
 * Airframe and route detail. Registration and type code come from the live
 * feed; the operator, route and photo come from adsbdb.
 */
export interface Enrichment {
  /** Full type name, e.g. "A321 211". */
  type: string | null;
  /** ICAO type designator, e.g. "A321". */
  icaoType: string | null;
  manufacturer: string | null;
  registration: string | null;
  owner: string | null;
  photoThumbUrl: string | null;
  airlineName: string | null;
  callsignIata: string | null;
  origin: AirportRef | null;
  destination: AirportRef | null;
}

export interface Contact {
  id: string;
  icao24: string;
  callsign: string;
  lat: number;
  lon: number;
  baroAltitudeM: number | null;
  geoAltitudeM: number | null;
  velocityMs: number | null;
  trackDeg: number | null;
  verticalRateMs: number | null;
  squawk: string | null;
  /** Seconds since this position was last received. */
  seenPosS: number | null;
  /** ADS-B emitter category code, e.g. "A3". */
  category: string | null;
  /** Great-circle distance from the station, km. */
  distanceKm: number;
  /** Bearing from the station, degrees true (0 = north). */
  bearingDeg: number;
  enrichment: Enrichment | null;
  phase: FlightPhase;
}

export interface ApiResponse {
  /** Feed snapshot time, ms epoch. */
  updatedAt: number;
  /** When our server fetched it, ms epoch. */
  fetchedAt: number;
  source: string;
  home: { lat: number; lon: number };
  /** Place name for `home`, when the server knows one. */
  homeLabel: string | null;
  /** The postal code that produced `home`, for pre-filling the field. */
  homeQuery: string | null;
  rangeKm: number;
  overheadRadiusKm: number;
  contacts: Contact[];
  count: number;
  stale: boolean;
  error: string | null;
}

/** One recorded position from an aircraft's trace. */
export interface TrackPoint {
  /** Unix seconds. */
  t: number;
  lat: number;
  lon: number;
  /** Barometric altitude in feet; 0 while on the ground, null if unknown. */
  altFt: number | null;
}

export interface TrackResponse {
  icao24: string;
  registration: string | null;
  type: string | null;
  /** The current leg, downsampled. Empty when no trace is available. */
  points: TrackPoint[];
  /** Unix seconds of the first point of the leg. */
  startedAt: number | null;
  /** True when the leg starts from a ground fix, i.e. a real departure. */
  fromGround: boolean;
  error: string | null;
}

export interface GeocodeResult {
  lat: number;
  lon: number;
  label: string;
  source: string;
}

/** The point the radar is centred on. */
export interface Station {
  lat: number;
  lon: number;
  /** Null when the station came from env defaults rather than a lookup. */
  label: string | null;
  /** What the user typed, so the field can be repopulated on reload. */
  query: string | null;
}
