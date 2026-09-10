import { NextResponse } from "next/server";
import { fetchNearby, type AdsbAircraft } from "@/lib/adsblol";
import { haversineKm, bearingDeg } from "@/lib/geo";
import { enrichMany } from "@/lib/enrich";
import { classifyHomeAirport, classifyPhase, isCruising } from "@/lib/classify";
import { DEFAULT_STATION, HOME_AIRPORT } from "@/lib/config";
import type {
  ApiResponse,
  Contact,
  Enrichment,
  TrafficFilter,
} from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** How many of the nearest contacts get an operator/route lookup per poll. */
const ENRICH_LIMIT = 10;

const MIN_RANGE_KM = 3;
const MAX_RANGE_KM = 80;

/** Nothing airborne is doing under ~58 kt, so this filters ground traffic. */
const MIN_AIRBORNE_MS = 30;

const FT_TO_M = 0.3048;
const KT_TO_MS = 0.514444;
const FPM_TO_MS = 0.00508;

function num(value: string | undefined | null, fallback: number): number {
  // Number(null) and Number("") are both 0, which is a legitimate coordinate,
  // so absent values must be rejected before coercion.
  if (value == null || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clampRange(km: number): number {
  return Math.min(MAX_RANGE_KM, Math.max(MIN_RANGE_KM, km));
}

const HAS_ENV_HOME = Boolean(process.env.HOME_LAT && process.env.HOME_LON);
const DEFAULT_LAT = num(process.env.HOME_LAT, DEFAULT_STATION.lat);
const DEFAULT_LON = num(process.env.HOME_LON, DEFAULT_STATION.lon);
const DEFAULT_RANGE_KM = clampRange(num(process.env.RADAR_RANGE_KM, 10));
const OVERHEAD_KM = Math.max(0.5, num(process.env.OVERHEAD_RADIUS_KM, 2.5));

// Query wider than the visible scope so aircraft about to enter range are
// already tracked and can be dead-reckoned in smoothly.
const QUERY_BUFFER = 1.35;

// Serve the same upstream snapshot to every client for a few seconds.
const CACHE_TTL_MS = 9000;
const payloadCache = new Map<string, { at: number; data: ApiResponse }>();

/** Convert one feed record into our internal (metric) shape. */
function mapAircraft(a: AdsbAircraft): Contact | null {
  const icao24 = (a.hex ?? "").trim().toLowerCase();
  if (!icao24 || a.lat == null || a.lon == null) return null;

  // alt_baro is the string "ground" for surface traffic.
  const onGround = a.alt_baro === "ground";
  if (onGround) return null;

  const altFt = typeof a.alt_baro === "number" ? a.alt_baro : null;
  const geomFt = typeof a.alt_geom === "number" ? a.alt_geom : null;
  const callsign = a.flight?.trim();

  return {
    id: icao24,
    icao24,
    callsign: callsign && callsign.length > 0 ? callsign : "UNKNOWN",
    lat: a.lat,
    lon: a.lon,
    baroAltitudeM: altFt != null ? altFt * FT_TO_M : null,
    geoAltitudeM: geomFt != null ? geomFt * FT_TO_M : null,
    velocityMs: a.gs != null ? a.gs * KT_TO_MS : null,
    trackDeg: a.track ?? null,
    verticalRateMs: a.baro_rate != null ? a.baro_rate * FPM_TO_MS : null,
    squawk: a.squawk ?? null,
    seenPosS: a.seen_pos ?? null,
    category: a.category ?? null,
    distanceKm: 0,
    bearingDeg: 0,
    enrichment: null,
    phase: "unknown",
  };
}

/**
 * The live feed already knows the registration and type code, so every
 * aircraft gets at least that even when adsbdb has no record of it.
 */
function mergeEnrichment(
  feed: AdsbAircraft,
  looked: Enrichment | null,
): Enrichment | null {
  const registration = looked?.registration ?? feed.r ?? null;
  const icaoType = looked?.icaoType ?? feed.t ?? null;
  if (!looked && !registration && !icaoType) return null;

  return {
    type: looked?.type ?? null,
    icaoType,
    manufacturer: looked?.manufacturer ?? null,
    registration,
    owner: looked?.owner ?? null,
    photoThumbUrl: looked?.photoThumbUrl ?? null,
    airlineName: looked?.airlineName ?? null,
    callsignIata: looked?.callsignIata ?? null,
    origin: looked?.origin ?? null,
    destination: looked?.destination ?? null,
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
  const isBuiltInDefault = !hasStationParam && !HAS_ENV_HOME;
  // Home-airport traffic unless the client explicitly asks for everything.
  const filter: TrafficFilter =
    params.get("filter") === "all" ? "all" : "airport";

  const cacheKey = `${lat.toFixed(3)}:${lon.toFixed(3)}:${rangeKm}:${filter}`;
  const cached = payloadCache.get(cacheKey);
  if (cached && now - cached.at < CACHE_TTL_MS) {
    return NextResponse.json(cached.data);
  }

  const base = {
    fetchedAt: now,
    source: "adsb.lol",
    home: { lat, lon },
    homeLabel: isBuiltInDefault ? DEFAULT_STATION.label : null,
    homeQuery: isBuiltInDefault ? DEFAULT_STATION.query : null,
    rangeKm,
    overheadRadiusKm: overheadKm,
  };

  try {
    const { now: snapshotAt, aircraft } = await fetchNearby(
      lat,
      lon,
      rangeKm * QUERY_BUFFER,
    );

    // Keep the raw record alongside so registration/type can be merged later.
    const inRange = aircraft
      .map((a) => ({ feed: a, contact: mapAircraft(a) }))
      .filter(
        (x): x is { feed: AdsbAircraft; contact: Contact } =>
          x.contact !== null &&
          (x.contact.velocityMs == null ||
            x.contact.velocityMs >= MIN_AIRBORNE_MS),
      )
      .map((x) => ({
        feed: x.feed,
        contact: {
          ...x.contact,
          distanceKm: haversineKm(lat, lon, x.contact.lat, x.contact.lon),
          bearingDeg: bearingDeg(lat, lon, x.contact.lat, x.contact.lon),
        },
      }))
      .filter((x) => x.contact.distanceKm <= rangeKm * QUERY_BUFFER)
      .sort((a, b) => a.contact.distanceKm - b.contact.distanceKm);

    // Level cruisers can never be home-airport traffic, so drop them before
    // they use up the enrichment budget meant for the flights we will show.
    const candidates =
      filter === "airport"
        ? inRange.filter((x) => !isCruising(x.contact))
        : inRange;

    const lookups = await enrichMany(
      candidates.map((x) => ({
        icao24: x.contact.icao24,
        callsign: x.contact.callsign,
      })),
      ENRICH_LIMIT,
    );

    const contacts = candidates.flatMap(({ feed, contact }): Contact[] => {
      const enriched = {
        ...contact,
        enrichment: mergeEnrichment(feed, lookups.get(contact.icao24) ?? null),
      };
      if (filter === "all") {
        return [{ ...enriched, phase: classifyPhase(enriched, lat, lon) }];
      }
      const phase = classifyHomeAirport(enriched, HOME_AIRPORT);
      return phase ? [{ ...enriched, phase }] : [];
    });

    const data: ApiResponse = {
      ...base,
      updatedAt: snapshotAt,
      contacts,
      count: contacts.length,
      stale: false,
      error: null,
    };

    payloadCache.set(cacheKey, { at: now, data });
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown upstream error";

    // Keep the last good snapshot on screen rather than blanking the board.
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
      contacts: [],
      count: 0,
      stale: true,
      error: message,
    } satisfies ApiResponse);
  }
}
