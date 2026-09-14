const WINDOW_MS = 75_000;

// Development only: production must use shared storage across instances.
const localSessions = new Map<string, number>();

export async function updatePresence(session: string, active: boolean): Promise<number> {
  const now = Date.now();
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    if (process.env.NODE_ENV !== "development") throw new Error("Presence storage unavailable");
    for (const [id, seen] of localSessions) {
      if (seen <= now - WINDOW_MS) localSessions.delete(id);
    }
    if (active) localSessions.set(session, now);
    else localSessions.delete(session);
    return localSessions.size;
  }

  const key = `flights-overhead:radar-presence:${process.env.VERCEL_ENV ?? "development"}`;
  const response = await fetch(`${url.replace(/\/$/, "")}/multi-exec`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify([
      ["ZREMRANGEBYSCORE", key, "-inf", now - WINDOW_MS],
      active ? ["ZADD", key, now, session] : ["ZREM", key, session],
      ["ZCARD", key],
      ["EXPIRE", key, 150],
    ]),
    cache: "no-store",
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error("Presence storage unavailable");
  const result = await response.json();
  if (!Array.isArray(result) || result.some((entry) => entry.error) ||
      !Number.isSafeInteger(result[2]?.result) || result[2].result < 0) {
    throw new Error("Invalid presence response");
  }
  return result[2].result;
}
