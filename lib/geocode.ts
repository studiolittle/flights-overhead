import type { GeocodeResult } from "./types";

// Nominatim is the primary geocoder: it resolves full 6-character Canadian
// postal codes, US ZIPs, UK postcodes and plain place names. Zippopotam is the
// fallback for CA/US when Nominatim has no postcode record.
//
// Nominatim's usage policy asks for an identifying User-Agent and at most one
// request per second. Both are satisfied here: lookups only happen on an
// explicit user action, and results are cached forever (postal codes do not
// move).
const NOMINATIM = "https://nominatim.openstreetmap.org";
const USER_AGENT = "flights-overhead/0.1 (personal ADS-B dashboard)";

const forwardCache = new Map<string, GeocodeResult | null>();
const reverseCache = new Map<string, string | null>();

const CA_POSTAL_RE = /^[A-Z]\d[A-Z]\s?\d[A-Z]\d$/;
const CA_FSA_RE = /^[A-Z]\d[A-Z]$/;
const US_ZIP_RE = /^\d{5}$/;

export function normalizeQuery(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").toUpperCase();
}

interface NominatimPlace {
  lat: string;
  lon: string;
  display_name?: string;
  address?: Record<string, string>;
}

/** Build a short "City, Region" label instead of Nominatim's full chain. */
function shortLabel(place: NominatimPlace): string {
  const a = place.address ?? {};
  const locality =
    a.city ?? a.town ?? a.village ?? a.suburb ?? a.municipality ?? a.county;
  const region = a.state ?? a.province ?? a.region;
  const parts = [locality, region].filter(Boolean);

  if (parts.length > 0) return parts.join(", ");
  if (place.display_name) {
    return place.display_name.split(",").slice(0, 2).join(",").trim();
  }
  return "Unknown location";
}

async function nominatim(path: string): Promise<unknown | null> {
  const res = await fetch(`${NOMINATIM}${path}`, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) return null;
  return res.json();
}

async function zippopotam(
  country: string,
  code: string,
): Promise<GeocodeResult | null> {
  const res = await fetch(`https://api.zippopotam.us/${country}/${code}`, {
    cache: "no-store",
  });
  if (!res.ok) return null;

  const json = (await res.json()) as {
    places?: Array<{
      "place name"?: string;
      state?: string;
      latitude?: string;
      longitude?: string;
    }>;
  };
  const place = json.places?.[0];
  if (!place?.latitude || !place?.longitude) return null;

  // Zippopotam's Canadian place names include a long neighbourhood list;
  // keep only the part before the first bracket.
  const name = (place["place name"] ?? "").split("(")[0].trim();
  const label = [name, place.state].filter(Boolean).join(", ") || code;

  return {
    lat: Number(place.latitude),
    lon: Number(place.longitude),
    label,
    source: "Zippopotam",
  };
}

export async function forwardGeocode(raw: string): Promise<GeocodeResult | null> {
  const q = normalizeQuery(raw);
  if (!q) return null;

  if (forwardCache.has(q)) return forwardCache.get(q) ?? null;

  let result: GeocodeResult | null = null;

  // 1. Nominatim structured postcode lookup.
  try {
    const params = new URLSearchParams({
      postalcode: q,
      format: "jsonv2",
      limit: "1",
      addressdetails: "1",
    });
    const json = (await nominatim(`/search?${params}`)) as
      | NominatimPlace[]
      | null;
    const hit = json?.[0];
    if (hit) {
      result = {
        lat: Number(hit.lat),
        lon: Number(hit.lon),
        label: shortLabel(hit),
        source: "Nominatim",
      };
    }
  } catch {
    result = null;
  }

  // 2. Zippopotam for CA/US postal codes Nominatim did not have.
  if (!result) {
    try {
      if (CA_POSTAL_RE.test(q) || CA_FSA_RE.test(q)) {
        result = await zippopotam("CA", q.replace(/\s/g, "").slice(0, 3));
      } else if (US_ZIP_RE.test(q)) {
        result = await zippopotam("US", q);
      }
    } catch {
      result = null;
    }
  }

  // 3. Free-text search, so a city or address also works.
  if (!result) {
    try {
      const params = new URLSearchParams({
        q,
        format: "jsonv2",
        limit: "1",
        addressdetails: "1",
      });
      const json = (await nominatim(`/search?${params}`)) as
        | NominatimPlace[]
        | null;
      const hit = json?.[0];
      if (hit) {
        result = {
          lat: Number(hit.lat),
          lon: Number(hit.lon),
          label: shortLabel(hit),
          source: "Nominatim",
        };
      }
    } catch {
      result = null;
    }
  }

  if (result && (!Number.isFinite(result.lat) || !Number.isFinite(result.lon))) {
    result = null;
  }

  forwardCache.set(q, result);
  return result;
}

/** Coarse reverse lookup, used to name where a flight's track began. */
export async function reverseGeocode(
  lat: number,
  lon: number,
): Promise<string | null> {
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  if (reverseCache.has(key)) return reverseCache.get(key) ?? null;

  let label: string | null = null;
  try {
    const params = new URLSearchParams({
      lat: String(lat),
      lon: String(lon),
      format: "jsonv2",
      zoom: "10",
      addressdetails: "1",
    });
    const json = (await nominatim(`/reverse?${params}`)) as
      | NominatimPlace
      | null;
    if (json) {
      const a = json.address ?? {};
      const locality =
        a.city ?? a.town ?? a.village ?? a.county ?? a.state_district;
      const region = a.state ?? a.province;
      const country = a.country;
      label =
        [locality, region ?? country].filter(Boolean).join(", ") ||
        shortLabel(json);
    }
  } catch {
    label = null;
  }

  reverseCache.set(key, label);
  return label;
}
