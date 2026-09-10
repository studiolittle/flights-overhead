import { NextResponse } from "next/server";
import { fetchTrack } from "@/lib/opensky";
import { reverseGeocode } from "@/lib/geocode";
import type { TrackPoint, TrackResponse } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Tracks are only fetched when a user selects a flight, never on the polling
// loop, so a short cache is enough to absorb repeated clicks.
const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { at: number; data: TrackResponse }>();

const ICAO24_RE = /^[0-9a-f]{6}$/;

export async function GET(request: Request) {
  const icao24 = (
    new URL(request.url).searchParams.get("icao24") ?? ""
  )
    .trim()
    .toLowerCase();

  if (!ICAO24_RE.test(icao24)) {
    return NextResponse.json(
      { error: "Invalid icao24 address." },
      { status: 400 },
    );
  }

  const now = Date.now();
  const cached = cache.get(icao24);
  if (cached && now - cached.at < CACHE_TTL_MS) {
    return NextResponse.json(cached.data);
  }

  const empty: TrackResponse = {
    icao24,
    callsign: null,
    startTime: null,
    endTime: null,
    path: [],
    origin: null,
    error: null,
  };

  try {
    const raw = await fetchTrack(icao24);

    const path: TrackPoint[] = raw.path
      .filter((p) => Array.isArray(p) && p[1] != null && p[2] != null)
      .map((p) => ({
        t: p[0],
        lat: p[1],
        lon: p[2],
        altM: p[3] ?? null,
        trackDeg: p[4] ?? null,
        onGround: Boolean(p[5]),
      }));

    let origin: TrackResponse["origin"] = null;
    if (path.length > 0) {
      const first = path[0];
      const label = await reverseGeocode(first.lat, first.lon).catch(() => null);
      origin = { lat: first.lat, lon: first.lon, label };
    }

    const data: TrackResponse = {
      icao24,
      callsign: raw.callsign,
      startTime: raw.startTime,
      endTime: raw.endTime,
      path,
      origin,
      error: null,
    };

    cache.set(icao24, { at: now, data });
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Track lookup failed";
    // 200 with an error field: a missing track is normal, not a page failure.
    return NextResponse.json({ ...empty, error: message });
  }
}
