import { NextResponse } from "next/server";
import { getCache } from "@vercel/functions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Who has the app open. Each browser checks in every 30 s with a random,
// anonymous id; any id seen inside ONLINE_WINDOW_MS counts as online.
//
// The map lives in Vercel's Runtime Cache, which every function instance in
// the region shares. This app runs in a single region, so in practice that is
// everyone. Locally, getCache() falls back to an in-memory store.
//
// The read-modify-write is not atomic: two check-ins landing at the same
// instant can drop one id for a cycle. It comes back on its next beat, which
// is fine for a headcount.

/**
 * Browsers throttle timers in hidden tabs to about once a minute, so the
 * window has to outlast that or background tabs would flicker off the count.
 */
const ONLINE_WINDOW_MS = 90_000;
const CACHE_TTL_S = 180;
const KEY = "users-online";
/** Stops one misbehaving client from growing the map without bound. */
const MAX_TRACKED = 5000;
const ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/;

type LastSeen = Record<string, number>;

export async function POST(request: Request) {
  let id: string | null = null;
  let leaving = false;
  try {
    const body = (await request.json()) as { id?: unknown; leave?: unknown };
    if (typeof body.id === "string" && ID_PATTERN.test(body.id)) id = body.id;
    leaving = body.leave === true;
  } catch {
    // Unreadable body: answered by the 400 below.
  }
  if (!id) {
    return NextResponse.json({ error: "Missing or invalid id" }, { status: 400 });
  }

  const cache = getCache({ namespace: "flights-overhead" });
  const now = Date.now();

  let seen: LastSeen = {};
  try {
    seen = ((await cache.get(KEY)) as LastSeen | undefined) ?? {};
  } catch {
    // Cache unreachable: count from scratch rather than fail the request.
  }

  const next: LastSeen = {};
  for (const [key, at] of Object.entries(seen)) {
    if (typeof at === "number" && now - at < ONLINE_WINDOW_MS) next[key] = at;
  }
  if (leaving) {
    delete next[id];
  } else if (id in next || Object.keys(next).length < MAX_TRACKED) {
    next[id] = now;
  }

  try {
    await cache.set(KEY, next, { ttl: CACHE_TTL_S, name: "users-online" });
  } catch {
    // The next check-in rebuilds it.
  }

  return NextResponse.json(
    { online: Object.keys(next).length },
    { headers: { "Cache-Control": "no-store" } },
  );
}
