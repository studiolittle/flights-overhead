import type { AirportRef, Enrichment } from "./types";

// OpenSky's own aircraft-metadata endpoint returns 410 Gone, so airframe type
// and route come from adsbdb (free, no key), with hexdb as a fallback for the
// airframe. Both are cached in module memory: an aircraft's type never changes,
// and a callsign's route is stable for months.
const ADSBDB = "https://api.adsbdb.com/v0";
const HEXDB = "https://hexdb.io/api/v1";

const AIRCRAFT_TTL_MS = 24 * 60 * 60 * 1000;
const ROUTE_TTL_MS = 12 * 60 * 60 * 1000;
/**
 * Misses expire fast. A timeout or a blip at the upstream would otherwise be
 * cached as "no such aircraft" for the full positive TTL, so one bad moment
 * would cost a flight its type and route for the rest of the day.
 */
const MISS_TTL_MS = 10 * 60 * 1000;
const LOOKUP_TIMEOUT_MS = 3500;

function isFresh(entry: { at: number; data: unknown } | undefined, ttl: number) {
  if (!entry) return false;
  return Date.now() - entry.at < (entry.data ? ttl : MISS_TTL_MS);
}

type AircraftInfo = Pick<
  Enrichment,
  | "type"
  | "icaoType"
  | "manufacturer"
  | "registration"
  | "owner"
  | "photoThumbUrl"
>;

type RouteInfo = Pick<
  Enrichment,
  "airlineName" | "callsignIata" | "origin" | "destination"
>;

const aircraftCache = new Map<string, { at: number; data: AircraftInfo | null }>();
const routeCache = new Map<string, { at: number; data: RouteInfo | null }>();

async function getJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function mapAirport(raw: unknown): AirportRef | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" && v ? v : null);
  const numOrNull = (v: unknown) => (typeof v === "number" ? v : null);

  return {
    iata: str(a.iata_code),
    icao: str(a.icao_code),
    name: str(a.name),
    municipality: str(a.municipality),
    countryName: str(a.country_name),
    lat: numOrNull(a.latitude),
    lon: numOrNull(a.longitude),
  };
}

async function lookupAircraft(icao24: string): Promise<AircraftInfo | null> {
  const key = icao24.toLowerCase();
  const cached = aircraftCache.get(key);
  if (isFresh(cached, AIRCRAFT_TTL_MS)) return cached!.data;

  let data: AircraftInfo | null = null;

  const primary = (await getJson(`${ADSBDB}/aircraft/${key}`)) as
    | { response?: { aircraft?: Record<string, unknown> } }
    | null;
  const ac = primary?.response?.aircraft;

  if (ac) {
    const str = (v: unknown) => (typeof v === "string" && v ? v : null);
    data = {
      type: str(ac.type),
      icaoType: str(ac.icao_type),
      manufacturer: str(ac.manufacturer),
      registration: str(ac.registration),
      owner: str(ac.registered_owner),
      photoThumbUrl: str(ac.url_photo_thumbnail),
    };
  } else {
    // hexdb fallback: same fields, different casing, no photo.
    const alt = (await getJson(`${HEXDB}/aircraft/${key}`)) as Record<
      string,
      unknown
    > | null;
    if (alt && typeof alt.ICAOTypeCode === "string") {
      const str = (v: unknown) => (typeof v === "string" && v ? v : null);
      data = {
        type: str(alt.Type),
        icaoType: str(alt.ICAOTypeCode),
        manufacturer: str(alt.Manufacturer),
        registration: str(alt.Registration),
        owner: str(alt.RegisteredOwners),
        photoThumbUrl: null,
      };
    }
  }

  aircraftCache.set(key, { at: Date.now(), data });
  return data;
}

async function lookupRoute(callsign: string): Promise<RouteInfo | null> {
  const key = callsign.trim().toUpperCase();
  if (!key || key === "UNKNOWN") return null;

  const cached = routeCache.get(key);
  if (isFresh(cached, ROUTE_TTL_MS)) return cached!.data;

  const json = (await getJson(`${ADSBDB}/callsign/${key}`)) as
    | { response?: { flightroute?: Record<string, unknown> } }
    | null;
  const fr = json?.response?.flightroute;

  let data: RouteInfo | null = null;
  if (fr) {
    const airline = fr.airline as Record<string, unknown> | undefined;
    data = {
      airlineName:
        airline && typeof airline.name === "string" ? airline.name : null,
      callsignIata:
        typeof fr.callsign_iata === "string" ? fr.callsign_iata : null,
      origin: mapAirport(fr.origin),
      destination: mapAirport(fr.destination),
    };
  }

  routeCache.set(key, { at: Date.now(), data });
  return data;
}

/** Airframe + route for one aircraft. Never throws; missing data is null. */
export async function enrichOne(
  icao24: string,
  callsign: string,
): Promise<Enrichment | null> {
  const [aircraft, route] = await Promise.all([
    lookupAircraft(icao24),
    lookupRoute(callsign),
  ]);

  if (!aircraft && !route) return null;

  return {
    type: aircraft?.type ?? null,
    icaoType: aircraft?.icaoType ?? null,
    manufacturer: aircraft?.manufacturer ?? null,
    registration: aircraft?.registration ?? null,
    owner: aircraft?.owner ?? null,
    photoThumbUrl: aircraft?.photoThumbUrl ?? null,
    airlineName: route?.airlineName ?? null,
    callsignIata: route?.callsignIata ?? null,
    origin: route?.origin ?? null,
    destination: route?.destination ?? null,
  };
}

/**
 * Enrich a batch, bounded so a cold cache cannot stall the poll.
 * Steady state is nearly free: repeat aircraft are served from memory.
 */
export async function enrichMany(
  targets: Array<{ icao24: string; callsign: string }>,
  limit: number,
): Promise<Map<string, Enrichment | null>> {
  const slice = targets.slice(0, limit);
  const results = await Promise.allSettled(
    slice.map((t) => enrichOne(t.icao24, t.callsign)),
  );

  const out = new Map<string, Enrichment | null>();
  slice.forEach((t, i) => {
    const r = results[i];
    out.set(t.icao24, r.status === "fulfilled" ? r.value : null);
  });
  return out;
}
