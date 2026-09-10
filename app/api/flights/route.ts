import { NextResponse } from "next/server";
import { fetchStates, type RawState } from "@/lib/opensky";
import { haversineKm, bearingDeg, toRad } from "@/lib/geo";
import { enrichMany } from "@/lib/enrich";
import { classifyPhase } from "@/lib/classify";
import { DEFAULT_STATION } from "@/lib/config";
import type { ApiResponse, Contact } from "@/lib/types";

/** How many of the nearest contacts get an airframe/route lookup per poll. */
const ENRICH_LIMIT = 10;

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function num(value: string | undefined | null, fallback: number): number {
  // Number(null) and Number("") are both 0, which is a legitimate coordinate,
  // so absent values must be rejected before coercion.
  if (value == null || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

const MIN_RANGE_KM = 3;
const MAX_RANGE_KM = 80;

function clampRange(km: number): number {
  return Math.min(MAX_RANGE_KM, Math.max(MIN_RANGE_KM, km));
}

const HAS_ENV_HOME = Boolean(process.env.HOME_LAT && process.env.HOME_LON);
const DEFAULT_LAT = num(process.env.HOME_LAT, DEFAULT_STATION.lat);
const DEFAULT_LON = num(process.env.HOME_LON, DEFAULT_STATION.lon);
const DEFAULT_RANGE_KM = clampRange(num(process.env.RADAR_RANGE_KM, 10));
const OVERHEAD_KM = Math.max(0.5, num(process.env.OVERHEAD_RADIUS_KM, 2.5));

// The query box is wider than the visible scope so aircraft about to enter
// range are already tracked and can be dead-reckoned in smoothly.
const QUERY_BUFFER = 1.35;

// Serve the same upstream snapshot to every client/tab for a few seconds to
// protect the OpenSky quota. Keyed by station + range.
const CACHE_TTL_MS = 9000;
const payloadCache = new Map<string, { at: number; data: ApiResponse }>();

function mapState(s: RawState): Contact | null {
  const icao24 = String(s[0] ?? "").trim();
  const lon = s[5] as number | null;
  const lat = s[6] as number | null;
  if (!icao24 || lat == null || lon == null) return null;

  const callsign = (s[1] as string | null)?.trim();

  return {
    id: icao24,
    icao24,
    callsign: callsign && callsign.length > 0 ? callsign : "UNKNOWN",
    originCountry: String(s[2] ?? "").trim() || "Unknown",
    lat,
    lon,
    baroAltitudeM: (s[7] as number | null) ?? null,
    geoAltitudeM: (s[13] as number | null) ?? null,
    onGround: Boolean(s[8]),
    velocityMs: (s[9] as number | null) ?? null,
    trackDeg: (s[10] as number | null) ?? null,
    verticalRateMs: (s[11] as number | null) ?? null,
    squawk: (s[14] as string | null) ?? null,
    lastContact: (s[4] as number | null) ?? null,
    timePosition: (s[3] as number | null) ?? null,
    positionSource: (s[16] as number | null) ?? null,
    category: (s[17] as number | null) ?? null,
    distanceKm: 0,
    bearingDeg: 0,
    enrichment: null,
    phase: "unknown",
  };
}

export async function GET(request: Request) {
  const now = Date.now();
  const params = new URL(request.url).searchParams;

  const rawLat = params.get("lat");
  const rawLon = params.get("lon");
  const hasStationParam = rawLat !== null && rawLon !== null;

  let lat = num(rawLat, DEFAULT_LAT);
  let lon = num(rawLon, DEFAULT_LON);
  if (!Number.isFinite(lat) || Math.abs(lat) > 90) lat = DEFAULT_LAT;
  if (!Number.isFinite(lon) || Math.abs(lon) > 180) lon = DEFAULT_LON;

  const rangeKm = clampRange(num(params.get("range"), DEFAULT_RANGE_KM));
  // Overhead radius scales with range so it stays meaningful when zoomed out.
  const overheadKm = Math.max(
    OVERHEAD_KM,
    Math.min(OVERHEAD_KM * 4, rangeKm * 0.2),
  );
  // Only describe the station in words when it is the built-in default; a
  // client-supplied position already knows its own label.
  const isBuiltInDefault = !hasStationParam && !HAS_ENV_HOME;

  const cacheKey = `${lat.toFixed(3)}:${lon.toFixed(3)}:${rangeKm}`;
  const cached = payloadCache.get(cacheKey);
  if (cached && now - cached.at < CACHE_TTL_MS) {
    return NextResponse.json(cached.data);
  }

  const dLat = (rangeKm * QUERY_BUFFER) / 111.32;
  const dLon = (rangeKm * QUERY_BUFFER) / (111.32 * Math.cos(toRad(lat)) || 1e-6);
  const bbox = {
    lamin: lat - dLat,
    lamax: lat + dLat,
    lomin: lon - dLon,
    lomax: lon + dLon,
  };

  const base = {
    fetchedAt: now,
    source: "OpenSky Network",
    home: { lat, lon },
    homeLabel: isBuiltInDefault ? DEFAULT_STATION.label : null,
    homeQuery: isBuiltInDefault ? DEFAULT_STATION.query : null,
    rangeKm,
    overheadRadiusKm: overheadKm,
  };

  try {
    const { time, states, auth } = await fetchStates(bbox);

    const inRange = states
      .map(mapState)
      .filter(
        (c): c is Contact =>
          c !== null &&
          !c.onGround &&
          // OpenSky's on_ground flag is unreliable, so taxiing aircraft and
          // airport ground vehicles slip through. Nothing airborne is doing
          // under ~58 kt, so speed is the more dependable filter.
          (c.velocityMs == null || c.velocityMs >= 30),
      )
      .map((c) => ({
        ...c,
        distanceKm: haversineKm(lat, lon, c.lat, c.lon),
        bearingDeg: bearingDeg(lat, lon, c.lat, c.lon),
      }))
      .filter((c) => c.distanceKm <= rangeKm * QUERY_BUFFER)
      .sort((a, b) => a.distanceKm - b.distanceKm);

    // Airframe + route for the nearest contacts. Cached in module memory, so
    // this is usually zero network calls after the first sighting.
    const enrichments = await enrichMany(
      inRange.map((c) => ({ icao24: c.icao24, callsign: c.callsign })),
      ENRICH_LIMIT,
    );

    const contacts = inRange.map((c) => {
      const enrichment = enrichments.get(c.icao24) ?? null;
      return {
        ...c,
        enrichment,
        phase: classifyPhase({ ...c, enrichment }, lat, lon),
      };
    });

    const data: ApiResponse = {
      ...base,
      updatedAt: (time || Math.floor(now / 1000)) * 1000,
      auth,
      contacts,
      count: contacts.length,
      stale: false,
      error: null,
    };

    payloadCache.set(cacheKey, { at: now, data });
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown upstream error";

    // Keep the last good snapshot on screen rather than blanking the scope.
    if (cached) {
      return NextResponse.json({
        ...cached.data,
        fetchedAt: now,
        stale: true,
        error: message,
      } satisfies ApiResponse);
    }

    return NextResponse.json({
      ...base,
      updatedAt: now,
      auth: "anonymous",
      contacts: [],
      count: 0,
      stale: true,
      error: message,
    } satisfies ApiResponse);
  }
}
