import { bearingDeg, haversineKm } from "./geo";
import type {
  AirportRef,
  Contact,
  Enrichment,
  FlightPhase,
  HomeAirport,
} from "./types";

/**
 * How close an airport has to be to your station to count as "your" airport.
 * Toronto Pearson sits ~25 km from downtown, so 70 km comfortably covers the
 * airports whose traffic actually crosses a given house.
 */
const LOCAL_AIRPORT_KM = 70;

/** Below this, an aircraft is in the approach/departure regime, not cruising. */
const TERMINAL_ALT_M = 4000;
/**
 * Below this (~6,500 ft) an aircraft inside your radar radius is unambiguously
 * working a nearby airport, so the vertical profile is trusted over any filed
 * route.
 */
const TERMINAL_CERTAIN_ALT_M = 2000;
const CRUISE_ALT_M = 7000;

/** Vertical rate that counts as a genuine climb or descent, m/s. */
const VS_THRESHOLD = 1.0;

function airportDistanceKm(
  airport: Enrichment["origin"],
  lat: number,
  lon: number,
): number | null {
  if (!airport || airport.lat == null || airport.lon == null) return null;
  return haversineKm(lat, lon, airport.lat, airport.lon);
}

/**
 * Decide whether an aircraft is landing here, taking off from here, or just
 * passing over on its way somewhere else.
 *
 * Route data (when adsbdb has it) is authoritative: if the flight's destination
 * is your local airport it is arriving, full stop. Without route data we fall
 * back to the vertical profile, which is a good proxy near an airport.
 */
export function classifyPhase(
  contact: Pick<
    Contact,
    "baroAltitudeM" | "verticalRateMs" | "enrichment"
  >,
  stationLat: number,
  stationLon: number,
): FlightPhase {
  const { enrichment: e, baroAltitudeM: altM, verticalRateMs: vs } = contact;

  // Physical evidence outranks the filed route. A callsign's route in the
  // upstream database can be stale or from a different leg, so an aircraft
  // low and slow inside your radar radius is operating at an airport near
  // YOU whatever the route claims. Seen in the wild: a regional jet at
  // 1300 ft descending into Ottawa still filed as EWR to Greer.
  if (altM != null && altM < TERMINAL_CERTAIN_ALT_M && vs != null) {
    if (vs <= -VS_THRESHOLD) return "arriving";
    if (vs >= VS_THRESHOLD) return "departing";
  }

  const originKm = airportDistanceKm(e?.origin ?? null, stationLat, stationLon);
  const destKm = airportDistanceKm(
    e?.destination ?? null,
    stationLat,
    stationLon,
  );

  const destIsLocal = destKm != null && destKm <= LOCAL_AIRPORT_KM;
  const originIsLocal = originKm != null && originKm <= LOCAL_AIRPORT_KM;

  // Round trips and shuttle hops can have both ends local; the vertical rate
  // breaks the tie.
  if (destIsLocal && originIsLocal) {
    if (vs != null && vs <= -VS_THRESHOLD) return "arriving";
    if (vs != null && vs >= VS_THRESHOLD) return "departing";
    return "arriving";
  }
  if (destIsLocal) return "arriving";
  if (originIsLocal) return "departing";

  // Both ends known and neither is local: it is genuinely just passing over.
  if (originKm != null && destKm != null) return "overflight";

  // No usable route data. Infer from how it is flying.
  if (altM != null && altM < TERMINAL_ALT_M && vs != null) {
    if (vs <= -VS_THRESHOLD) return "arriving";
    if (vs >= VS_THRESHOLD) return "departing";
  }
  if (altM != null && altM >= CRUISE_ALT_M) return "overflight";

  return "unknown";
}

/**
 * Beyond this from the home airport, an aircraft is not assumed to be working
 * it on vertical profile alone. Wide enough for a jet still climbing out,
 * tight enough to leave Carp (27 km west of YOW) and its circuits alone.
 */
const HOME_TERMINAL_KM = 25;

/**
 * Inside this, a low aircraft climbing or descending is working the airport
 * whichever way it is pointed: it may be turning onto final or out of the
 * departure.
 */
const HOME_NEAR_KM = 12;

/** Smallest angle between two headings, 0-180. */
function headingGap(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

function isAirport(
  ref: AirportRef | null | undefined,
  airport: HomeAirport,
): boolean {
  if (!ref) return false;
  return ref.icao === airport.icao || ref.iata === airport.iata;
}

/**
 * Is this aircraft landing at or taking off from one particular airport?
 * Null for everything else: overflights, and traffic at other airports nearby.
 *
 * Same evidence order as classifyPhase: a low aircraft climbing or descending
 * near the airport outranks a possibly stale filed route, the route decides
 * everything else, and the vertical profile fills in when nothing is filed.
 */
export function classifyHomeAirport(
  contact: Pick<
    Contact,
    | "lat"
    | "lon"
    | "trackDeg"
    | "baroAltitudeM"
    | "verticalRateMs"
    | "enrichment"
  >,
  airport: HomeAirport,
): "arriving" | "departing" | null {
  const { enrichment: e, baroAltitudeM: altM, verticalRateMs: vs } = contact;
  const distKm = haversineKm(contact.lat, contact.lon, airport.lat, airport.lon);

  // Inbound = pointed within 90 degrees of the airport. An unknown track gets
  // the benefit of the doubt.
  const gap =
    contact.trackDeg == null
      ? null
      : headingGap(
          contact.trackDeg,
          bearingDeg(contact.lat, contact.lon, airport.lat, airport.lon),
        );
  const close = distKm <= HOME_NEAR_KM;
  const inbound = close || gap == null || gap <= 90;
  const outbound = close || gap == null || gap >= 90;

  function fromProfile(maxAltM: number): "arriving" | "departing" | null {
    if (altM == null || vs == null) return null;
    if (altM >= maxAltM || distKm > HOME_TERMINAL_KM) return null;
    if (vs <= -VS_THRESHOLD && inbound) return "arriving";
    if (vs >= VS_THRESHOLD && outbound) return "departing";
    return null;
  }

  const certain = fromProfile(TERMINAL_CERTAIN_ALT_M);
  if (certain) return certain;

  const toHome = isAirport(e?.destination, airport);
  const fromHome = isAirport(e?.origin, airport);
  if (toHome && fromHome) {
    return vs != null && vs >= VS_THRESHOLD ? "departing" : "arriving";
  }
  if (toHome) return "arriving";
  if (fromHome) return "departing";

  // A filed route between two other airports is someone else's flight.
  if (e?.origin && e?.destination) return null;

  return fromProfile(TERMINAL_ALT_M);
}

/** Level at cruise: not landing at or taking off from anywhere nearby. */
export function isCruising(
  contact: Pick<Contact, "baroAltitudeM" | "verticalRateMs">,
): boolean {
  const { baroAltitudeM: altM, verticalRateMs: vs } = contact;
  return (
    altM != null &&
    altM >= CRUISE_ALT_M &&
    (vs == null || Math.abs(vs) < VS_THRESHOLD)
  );
}

export const PHASE_LABEL: Record<FlightPhase, string> = {
  arriving: "NOW ARRIVING",
  departing: "NOW DEPARTING",
  overflight: "PASSING OVER",
  unknown: "IN RANGE",
};

/** Short form for dense rows. */
export const PHASE_SHORT: Record<FlightPhase, string> = {
  arriving: "ARR",
  departing: "DEP",
  overflight: "OVR",
  unknown: "---",
};
