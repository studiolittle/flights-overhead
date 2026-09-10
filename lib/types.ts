export type AuthMode = "authenticated" | "anonymous";

/** What this aircraft is doing relative to your station. */
export type FlightPhase = "arriving" | "departing" | "overflight" | "unknown";

export interface AirportRef {
  iata: string | null;
  icao: string | null;
  name: string | null;
  municipality: string | null;
  countryName: string | null;
  lat: number | null;
  lon: number | null;
}

/** Airframe and route detail, from adsbdb (OpenSky no longer serves this). */
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
  originCountry: string;
  lat: number;
  lon: number;
  baroAltitudeM: number | null;
  geoAltitudeM: number | null;
  onGround: boolean;
  velocityMs: number | null;
  trackDeg: number | null;
  verticalRateMs: number | null;
  squawk: string | null;
  lastContact: number | null;
  timePosition: number | null;
  /** ADS-B position source index (0 ADS-B, 1 ASTERIX, 2 MLAT, 3 FLARM). */
  positionSource: number | null;
  /** ADS-B emitter category index. */
  category: number | null;
  /** Great-circle distance from the station, km. */
  distanceKm: number;
  /** Bearing from the station, degrees true (0 = north). */
  bearingDeg: number;
  /** Airframe + route detail. Null until the lookup lands. */
  enrichment: Enrichment | null;
  phase: FlightPhase;
}

export interface ApiResponse {
  /** OpenSky snapshot time, ms epoch. */
  updatedAt: number;
  /** When our server fetched it, ms epoch. */
  fetchedAt: number;
  source: string;
  auth: AuthMode;
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

/** One waypoint from OpenSky's /tracks/all path array. */
export interface TrackPoint {
  t: number;
  lat: number;
  lon: number;
  altM: number | null;
  trackDeg: number | null;
  onGround: boolean;
}

export interface TrackResponse {
  icao24: string;
  callsign: string | null;
  startTime: number | null;
  endTime: number | null;
  path: TrackPoint[];
  origin: { lat: number; lon: number; label: string | null } | null;
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
