import { bearingDeg, haversineKm, headingGap } from "./geo";
import type {
  AirportRef,
  Contact,
  Enrichment,
  FlightPhase,
  HomeAirport,
} from "./types";

/** Below this, an aircraft is in the approach/departure regime, not cruising. */
const TERMINAL_ALT_M = 4000;
/**
 * Below this (~6,500 ft) an aircraft near the airport that is climbing or
 * descending is unambiguously working it, so the vertical profile is trusted
 * over any filed route.
 */
const TERMINAL_CERTAIN_ALT_M = 2000;
const CRUISE_ALT_M = 7000;

/** Vertical rate that counts as a genuine climb or descent, m/s. */
const VS_THRESHOLD = 1.0;

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

function isAirport(
  ref: AirportRef | null | undefined,
  airport: HomeAirport,
): boolean {
  if (!ref) return false;
  return ref.icao === airport.icao || ref.iata === airport.iata;
}

/**
 * Is this aircraft landing at or taking off from the home airport? Null for
 * everything else: overflights, and traffic at other airports nearby.
 *
 * Physical evidence comes first. A callsign's route in the upstream database
 * can be stale or from a different leg (seen in the wild: a regional jet at
 * 1300 ft descending into Ottawa still filed as EWR to Greer), so a low
 * aircraft climbing or descending near the airport outranks the route. The
 * route decides everything else, and the vertical profile fills in when
 * nothing is filed.
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

/**
 * A flight classified as YOW traffic from how it is flying can still carry a
 * filed route between two other airports: the upstream database keys routes
 * by callsign, and airlines reuse flight numbers across legs (seen: RPA3663
 * climbing out of YOW, filed as EWR to ROC). Showing that route makes a real
 * YOW departure look like someone else's flight, so the YOW end is restored,
 * the other end is left blank rather than guessed, and the old route is kept
 * only as a note.
 */
export function reconcileRoute(
  e: Enrichment | null,
  phase: "arriving" | "departing",
  airport: HomeAirport,
): Enrichment | null {
  if (!e || (!e.origin && !e.destination)) return e;
  const homeEnd = phase === "arriving" ? e.destination : e.origin;
  if (isAirport(homeEnd, airport)) return e;

  const home: AirportRef = {
    iata: airport.iata,
    icao: airport.icao,
    name: airport.name,
    municipality: airport.name,
    countryName: null,
    lat: airport.lat,
    lon: airport.lon,
  };
  const code = (a: AirportRef | null) => a?.iata ?? a?.icao ?? "?";

  return {
    ...e,
    origin: phase === "departing" ? home : null,
    destination: phase === "arriving" ? home : null,
    staleRoute: `${code(e.origin)} → ${code(e.destination)}`,
  };
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
