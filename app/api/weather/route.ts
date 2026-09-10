import { NextResponse } from "next/server";
import { HOME_AIRPORT } from "@/lib/config";
import type { WeatherResponse } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// aviationweather.gov is the NOAA Aviation Weather Center: free, no key.
const METAR_URL = `https://aviationweather.gov/api/data/metar?ids=${HOME_AIRPORT.icao}&format=json`;
const USER_AGENT = "flights-overhead/0.1 (personal ADS-B dashboard)";
const TIMEOUT_MS = 8000;

/**
 * METARs are issued hourly, plus specials when conditions change, so a few
 * minutes of caching loses nothing.
 */
const CACHE_TTL_MS = 5 * 60 * 1000;

let cache: { at: number; data: WeatherResponse } | null = null;

/** The fields used from aviationweather.gov's METAR JSON. */
interface RawMetar {
  icaoId?: string;
  /** Unix seconds. */
  obsTime?: number;
  rawOb?: string;
  /** Degrees true, or "VRB". */
  wdir?: number | string;
  wspd?: number;
  wgst?: number;
  temp?: number;
  /** Statute miles, or "10+" when unrestricted. */
  visib?: number | string;
  altim?: number;
  fltCat?: string;
}

function numOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function mapMetar(m: RawMetar): WeatherResponse {
  const speedKt = numOrNull(m.wspd);
  return {
    station: m.icaoId ?? HOME_AIRPORT.icao,
    observedAt: m.obsTime != null ? m.obsTime * 1000 : null,
    raw: m.rawOb ?? null,
    wind:
      speedKt == null
        ? null
        : {
            dirDeg: numOrNull(m.wdir),
            speedKt,
            gustKt: numOrNull(m.wgst),
          },
    tempC: numOrNull(m.temp),
    visibilitySm: m.visib != null ? String(m.visib) : null,
    altimeterHpa: numOrNull(m.altim),
    flightCategory: m.fltCat ?? null,
    error: null,
  };
}

export async function GET() {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) {
    return NextResponse.json(cache.data);
  }

  try {
    const res = await fetch(METAR_URL, {
      headers: { Accept: "application/json", "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`aviationweather.gov HTTP ${res.status}`);

    const json = (await res.json()) as RawMetar[];
    if (!Array.isArray(json) || json.length === 0) {
      throw new Error(`No METAR on file for ${HOME_AIRPORT.icao}`);
    }

    const data = mapMetar(json[0]);
    cache = { at: now, data };
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Weather lookup failed";

    // An old observation beats none: the wind rarely swings a runway change
    // inside an hour.
    if (cache) {
      return NextResponse.json({
        ...cache.data,
        error: message,
      } satisfies WeatherResponse);
    }

    return NextResponse.json({
      station: HOME_AIRPORT.icao,
      observedAt: null,
      raw: null,
      wind: null,
      tempC: null,
      visibilitySm: null,
      altimeterHpa: null,
      flightCategory: null,
      error: message,
    } satisfies WeatherResponse);
  }
}
