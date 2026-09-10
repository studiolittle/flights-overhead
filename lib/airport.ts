// Runway geometry and wind for the home airport. Pure, so it is safe to import
// on both server and client.

import { bearingDeg, haversineKm, headingGap, toRad } from "./geo";
import type { Contact, HomeAirport, Runway, RunwayEnd, Wind } from "./types";

/** Runways shorter than this are general-aviation strips (YOW's 04/22). */
const AIRLINER_RUNWAY_FT = 6000;

/** Below this the wind does not decide the runway; the tower picks. */
const CALM_KT = 4;

/** How far out an arrival can be and still count as lined up on final. */
const FINAL_KM = 14;
/** ~5,000 ft: a 3-degree glidepath is well under this 14 km out. */
const FINAL_MAX_ALT_M = 1500;

/**
 * How far a departure flies the runway heading before it can have turned onto
 * its route.
 */
const CLIMB_OUT_KM = 10;
/** ~8,000 ft. */
const CLIMB_OUT_MAX_ALT_M = 2400;

/** Track must be this close to the runway heading, degrees. */
const ALIGN_DEG = 15;
/**
 * And the aircraft this close to the extended centreline, in degrees off the
 * runway axis as seen from the threshold.
 */
const CENTRELINE_DEG = 10;

export type RunwayOp = "arrival" | "departure";

export interface RunwayWind {
  ident: string;
  headwindKt: number;
  crosswindKt: number;
}

function airlinerRunways(airport: HomeAirport): Runway[] {
  return airport.runways.filter((r) => r.lengthFt >= AIRLINER_RUNWAY_FT);
}

export function findEnd(airport: HomeAirport, ident: string): RunwayEnd | null {
  for (const r of airport.runways) {
    for (const end of r.ends) if (end.ident === ident) return end;
  }
  return null;
}

/** The far end of the runway that `ident` belongs to. */
export function oppositeEnd(
  airport: HomeAirport,
  ident: string,
): RunwayEnd | null {
  for (const r of airport.runways) {
    if (r.ends[0].ident === ident) return r.ends[1];
    if (r.ends[1].ident === ident) return r.ends[0];
  }
  return null;
}

/**
 * The runway end pointing most directly into the wind. Aircraft land and take
 * off into wind, so this is the runway the tower will normally use. Null when
 * the wind is calm or variable and either direction works.
 */
export function favouredRunway(
  wind: Wind | null,
  airport: HomeAirport,
): RunwayWind | null {
  if (!wind || wind.dirDeg == null || wind.speedKt < CALM_KT) return null;

  let best: RunwayWind | null = null;
  for (const rwy of airlinerRunways(airport)) {
    for (const end of rwy.ends) {
      const angle = toRad(wind.dirDeg - end.headingDeg);
      const headwindKt = wind.speedKt * Math.cos(angle);
      if (!best || headwindKt > best.headwindKt) {
        best = {
          ident: end.ident,
          headwindKt,
          crosswindKt: Math.abs(wind.speedKt * Math.sin(angle)),
        };
      }
    }
  }
  return best;
}

/**
 * Which runway an aircraft is visibly using, if any. An arrival flies the
 * runway heading toward the threshold from out on the extended centreline; a
 * departure flies it away from the threshold it rolled from.
 */
export function runwayInUse(
  contact: Pick<Contact, "lat" | "lon" | "trackDeg" | "baroAltitudeM" | "phase">,
  airport: HomeAirport,
): { ident: string; op: RunwayOp } | null {
  const { trackDeg, baroAltitudeM: altM, phase } = contact;
  if (trackDeg == null || altM == null) return null;

  const op: RunwayOp | null =
    phase === "arriving" ? "arrival" : phase === "departing" ? "departure" : null;
  if (!op) return null;
  if (altM > (op === "arrival" ? FINAL_MAX_ALT_M : CLIMB_OUT_MAX_ALT_M)) {
    return null;
  }

  for (const rwy of airlinerRunways(airport)) {
    for (const end of rwy.ends) {
      if (headingGap(trackDeg, end.headingDeg) > ALIGN_DEG) continue;

      const distKm = haversineKm(end.lat, end.lon, contact.lat, contact.lon);
      const fromThreshold = bearingDeg(end.lat, end.lon, contact.lat, contact.lon);

      if (op === "arrival") {
        // Out on final: behind the threshold, on the approach side.
        if (
          distKm <= FINAL_KM &&
          headingGap(fromThreshold, end.headingDeg + 180) <= CENTRELINE_DEG
        ) {
          return { ident: end.ident, op };
        }
      } else if (
        // Climbing out: ahead of the threshold it rolled from.
        distKm <= CLIMB_OUT_KM &&
        headingGap(fromThreshold, end.headingDeg) <= CENTRELINE_DEG
      ) {
        return { ident: end.ident, op };
      }
    }
  }
  return null;
}
