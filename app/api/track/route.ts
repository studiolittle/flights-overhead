import { NextResponse } from "next/server";
import { fetchTrace } from "@/lib/trace";
import type { TrackResponse } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Traces are only pulled when a flight is on the board, and a day-long file
// barely changes minute to minute. A generous cache keeps repeat views free
// and keeps us light on a volunteer-run feed.
const CACHE_TTL_MS = 3 * 60_000;
const cache = new Map<string, { at: number; data: TrackResponse }>();

const ICAO24_RE = /^[0-9a-f]{6}$/;

export async function GET(request: Request) {
  const icao24 = (new URL(request.url).searchParams.get("icao24") ?? "")
    .trim()
    .toLowerCase();

  if (!ICAO24_RE.test(icao24)) {
    return NextResponse.json({ error: "Invalid icao24 address." }, { status: 400 });
  }

  const now = Date.now();
  const hit = cache.get(icao24);
  if (hit && now - hit.at < CACHE_TTL_MS) {
    return NextResponse.json(hit.data);
  }

  const data = await fetchTrace(icao24);

  // Only cache useful answers, so a transient failure is retried next time.
  if (!data.error) {
    cache.set(icao24, { at: now, data });
    // Keep the map from growing without bound on a long-lived instance.
    if (cache.size > 200) {
      for (const [k, v] of cache) {
        if (now - v.at > CACHE_TTL_MS) cache.delete(k);
      }
    }
  }

  return NextResponse.json(data);
}
