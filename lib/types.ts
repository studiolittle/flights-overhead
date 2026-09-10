/** What this aircraft is doing relative to your station. */
export type FlightPhase = "arriving" | "departing" | "overflight" | "unknown";

export interface RunwayEnd {
  /** Painted number, e.g. "25". */
  ident: string;
  lat: number;
  lon: number;
  /** Heading flown along the runway from this threshold, degrees TRUE. */
  headingDeg: number;
}

export interface Runway {
  lengthFt: number;
  ends: [RunwayEnd, RunwayEnd];
}

export interface HomeAirport {
  iata: string;
  icao: string;
  /** Short place name for copy, e.g. "Ottawa". */
  name: string;
  /** Aerodrome reference point: the centre of the airport panel. */
  lat: number;
  lon: number;
  runways: Runway[];
}

/** Surface wind. Direction is TRUE, as a METAR reports it. */
export interface Wind {
  /** Where the wind blows FROM. Null when variable. */
  dirDeg: number | null;
  speedKt: number;
  gustKt: number | null;
}

export interface WeatherResponse {
  station: string;
  /** Observation time, ms epoch. */
  observedAt: number | null;
  raw: string | null;
  wind: Wind | null;
  tempC: number | null;
  /** As reported, e.g. "15" or "10+", statute miles. */
  visibilitySm: string | null;
  altimeterHpa: number | null;
  /** VFR / MVFR / IFR / LIFR. */
  flightCategory: string | null;
  error: string | null;
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
  /**
   * The filed route, e.g. "EWR → ROC", when it contradicted how the flight is
   * actually flying at YOW and was replaced. Absent otherwise.
   */
  staleRoute?: string | null;
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
  /**
   * Set client-side: this aircraft is within the overhead radius of the
   * user's home. Both scopes centre on the airport, so this can no longer be
   * read off `distanceKm`.
   */
  overhead?: boolean;
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
