import { gunzipSync } from "node:zlib";
import type { TrackPoint, TrackResponse } from "./types";

// adsb.lol mirrors the tar1090 "trace" files: a full day of recorded positions
// per aircraft. globe.adsb.lol redirects to adsb.lol, so hit the target host
// directly. Files are served gzipped with Content-Encoding set, so fetch()
// normally decompresses for us; the manual gunzip is a fallback for proxies
// that strip the header.
const TRACE_HOST = "https://adsb.lol/data/traces";
const USER_AGENT = "flights-overhead/0.1 (personal ADS-B dashboard)";
const TIMEOUT_MS = 15_000;

/** Send the client a readable path, not 3,000 raw samples. */
const MAX_POINTS = 260;

/** Raw trace row: [dt, lat, lon, alt|"ground", gs, track, flags, ...]. */
type RawPoint = [
  number,
  number,
  number,
  number | string | null,
  ...unknown[],
];

interface RawTrace {
  icao?: string;
  r?: string;
  t?: string;
  timestamp?: number;
  trace?: RawPoint[];
}

function isGround(alt: number | string | null | undefined): boolean {
  return alt === "ground";
}

/**
 * Cut the day-long trace down to the leg being flown now: everything after the
 * last time the aircraft was on the ground, up to its last airborne fix. Works
 * whether it is still up or has just landed.
 */
function currentLeg(points: RawPoint[]): { leg: RawPoint[]; fromGround: boolean } {
  let lastAirborne = -1;
  for (let i = points.length - 1; i >= 0; i -= 1) {
    if (!isGround(points[i][3])) {
      lastAirborne = i;
      break;
    }
  }
  if (lastAirborne < 0) return { leg: [], fromGround: false };

  let firstOfLeg = 0;
  for (let i = lastAirborne; i >= 0; i -= 1) {
    if (isGround(points[i][3])) {
      firstOfLeg = i;
      break;
    }
  }

  // Keep the final ground fix so the line starts at the runway, not mid-climb.
  const fromGround = isGround(points[firstOfLeg][3]);
  return { leg: points.slice(firstOfLeg, lastAirborne + 1), fromGround };
}

/** Even-stride downsample that always keeps the first and last fix. */
function thin(points: RawPoint[]): RawPoint[] {
  if (points.length <= MAX_POINTS) return points;
  const step = (points.length - 1) / (MAX_POINTS - 1);
  const out: RawPoint[] = [];
  for (let i = 0; i < MAX_POINTS - 1; i += 1) {
    out.push(points[Math.round(i * step)]);
  }
  out.push(points[points.length - 1]);
  return out;
}

export async function fetchTrace(icao24: string): Promise<TrackResponse> {
  const hex = icao24.trim().toLowerCase();
  const shard = hex.slice(-2);
  const url = `${TRACE_HOST}/${shard}/trace_full_${hex}.json`;

  const empty: TrackResponse = {
    icao24: hex,
    registration: null,
    type: null,
    points: [],
    startedAt: null,
    fromGround: false,
    error: null,
  };

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (err) {
    const e = err as Error & { cause?: { code?: string } };
    const detail =
      e.name === "TimeoutError" ? "timed out" : (e.cause?.code ?? e.message);
    return { ...empty, error: `Cannot reach adsb.lol traces: ${detail}` };
  }

  // No trace file simply means this airframe has not been seen recently.
  if (res.status === 404) return empty;
  if (!res.ok) return { ...empty, error: `Trace request failed (HTTP ${res.status})` };

  let raw: RawTrace;
  try {
    raw = (await res.clone().json()) as RawTrace;
  } catch {
    try {
      const buf = Buffer.from(await res.arrayBuffer());
      raw = JSON.parse(gunzipSync(buf).toString("utf8")) as RawTrace;
    } catch {
      return { ...empty, error: "Could not read the trace file" };
    }
  }

  const base = raw.timestamp ?? 0;
  const all = (raw.trace ?? []).filter(
    (p) => Array.isArray(p) && typeof p[1] === "number" && typeof p[2] === "number",
  );

  const { leg, fromGround } = currentLeg(all);
  if (leg.length < 2) {
    return { ...empty, registration: raw.r ?? null, type: raw.t ?? null };
  }

  const points: TrackPoint[] = thin(leg).map((p) => ({
    t: Math.round(base + p[0]),
    lat: p[1],
    lon: p[2],
    altFt: typeof p[3] === "number" ? p[3] : isGround(p[3]) ? 0 : null,
  }));

  return {
    icao24: hex,
    registration: raw.r ?? null,
    type: raw.t ?? null,
    points,
    startedAt: points[0]?.t ?? null,
    fromGround,
    error: null,
  };
}
