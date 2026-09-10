import { haversineKm } from "./geo";
import type { Contact, Enrichment, FlightPhase } from "./types";

/**
 * How close an airport has to be to your station to count as "your" airport.
 * Toronto Pearson sits ~25 km from downtown, so 70 km comfortably covers the
 * airports whose traffic actually crosses a given house.
 */
const LOCAL_AIRPORT_KM = 70;

/** Below this, an aircraft is in the approach/departure regime, not cruising. */
const TERMINAL_ALT_M = 4000;
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
