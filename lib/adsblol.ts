// Live aircraft positions from adsb.lol.
//
// This replaced OpenSky as the live feed because OpenSky's network drops
// traffic from cloud IP ranges (TCP connect timeouts from every Vercel region
// tried), so it can only ever work from a home connection. adsb.lol is free,
// needs no key, queries by radius directly, and includes registration and
// aircraft type inline.
//
// Response shape is the readsb/tar1090 `aircraft.json` format. Units differ
// from OpenSky: feet, knots and feet-per-minute rather than metres and m/s.

const BASE = "https://api.adsb.lol/v2";
const TIMEOUT_MS = 12_000;
const KM_PER_NM = 1.852;

// adsb.lol returns 403 to requests with no User-Agent, and Node's fetch sends
// none by default. Identifying the client is also the polite thing to do for a
// free community feed.
const USER_AGENT = "flights-overhead/0.1 (personal ADS-B dashboard)";

export interface AdsbAircraft {
  hex?: string;
  flight?: string;
  /** Registration, e.g. "C-GKQG". */
  r?: string;
  /** ICAO type designator, e.g. "DH8D". */
  t?: string;
  lat?: number;
  lon?: number;
  /** Feet, or the string "ground". */
  alt_baro?: number | string;
  alt_geom?: number;
  /** Ground speed, knots. */
  gs?: number;
  /** True track, degrees. */
  track?: number;
  /** Feet per minute. */
  baro_rate?: number;
  geom_rate?: number;
  squawk?: string;
  emergency?: string;
  /** Emitter category as a letter-digit code, e.g. "A3". */
  category?: string;
  /** Seconds since this position was received. */
  seen_pos?: number;
  /** Distance from the query point, nautical miles. */
  dst?: number;
  /** Bearing from the query point, degrees. */
  dir?: number;
}

export async function fetchNearby(
  lat: number,
  lon: number,
  radiusKm: number,
): Promise<{ now: number; aircraft: AdsbAircraft[] }> {
  // The endpoint takes nautical miles and caps at 250.
  const nm = Math.min(250, Math.max(1, Math.ceil(radiusKm / KM_PER_NM)));
  const url = `${BASE}/lat/${lat.toFixed(4)}/lon/${lon.toFixed(4)}/dist/${nm}`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (err) {
    const e = err as Error & { cause?: { code?: string } };
    if (e.name === "TimeoutError" || e.name === "AbortError") {
      throw new Error(`adsb.lol timed out after ${TIMEOUT_MS / 1000}s`);
    }
    throw new Error(`Cannot reach api.adsb.lol: ${e.cause?.code ?? e.message}`);
  }

  if (res.status === 429) throw new Error("adsb.lol rate limit reached");
  if (!res.ok) throw new Error(`adsb.lol request failed (HTTP ${res.status})`);

  const json = (await res.json()) as {
    now?: number;
    ac?: AdsbAircraft[] | null;
  };

  return {
    // `now` is milliseconds in this format.
    now: json.now ?? Date.now(),
    aircraft: json.ac ?? [],
  };
}
