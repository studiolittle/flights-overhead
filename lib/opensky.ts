import type { AuthMode } from "./types";

// OpenSky moved to OAuth2 client-credentials only for authenticated access.
// Anonymous (no credentials) still works for recent state vectors, but with a
// much lower per-IP daily quota.
const TOKEN_URL =
  "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token";
const STATES_URL = "https://opensky-network.org/api/states/all";
const TRACKS_URL = "https://opensky-network.org/api/tracks/all";

export interface BBox {
  lamin: number;
  lomin: number;
  lamax: number;
  lomax: number;
}

// A single OpenSky state vector: 18 positional fields, loosely typed.
export type RawState = Array<string | number | boolean | null | number[]>;

let tokenCache: { token: string; expiresAt: number } | null = null;

const NET_TIMEOUT_MS = 12_000;

/**
 * fetch() collapses every connection problem into the string "fetch failed",
 * which is useless when diagnosing a deployment. Surface the underlying cause
 * (DNS, TLS, refused, timeout) so the UI can show something actionable.
 */
async function netFetch(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(NET_TIMEOUT_MS),
    });
  } catch (err) {
    const e = err as Error & { cause?: { code?: string; message?: string } };
    if (e.name === "TimeoutError" || e.name === "AbortError") {
      throw new Error(`OpenSky timed out after ${NET_TIMEOUT_MS / 1000}s`);
    }
    const detail = e.cause?.code ?? e.cause?.message ?? e.message;
    const host = new URL(url).host;
    throw new Error(`Cannot reach ${host}: ${detail}`);
  }
}

async function getAccessToken(): Promise<string | null> {
  const clientId = process.env.OPENSKY_CLIENT_ID?.trim();
  const clientSecret = process.env.OPENSKY_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;

  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt - 60_000 > now) {
    return tokenCache.token;
  }

  const res = await netFetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`OpenSky auth failed (HTTP ${res.status})`);
  }

  const json = (await res.json()) as { access_token: string; expires_in?: number };
  tokenCache = {
    token: json.access_token,
    expiresAt: now + (json.expires_in ?? 1800) * 1000,
  };
  return tokenCache.token;
}

/** Authenticated when credentials are configured, anonymous otherwise. */
async function openskyFetch(url: string): Promise<{
  json: unknown;
  auth: AuthMode;
}> {
  const hasCredentials = Boolean(
    process.env.OPENSKY_CLIENT_ID?.trim() &&
      process.env.OPENSKY_CLIENT_SECRET?.trim(),
  );

  let token: string | null = null;
  try {
    token = await getAccessToken();
  } catch (err) {
    // Credentials that are configured but failing is a real problem worth
    // reporting, not something to silently downgrade.
    if (hasCredentials) {
      throw new Error(`OpenSky auth failed: ${(err as Error).message}`);
    }
    token = null;
  }

  const res = await netFetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    cache: "no-store",
  });

  if (res.status === 429) {
    throw new Error("OpenSky rate limit reached (HTTP 429)");
  }
  if (!res.ok) {
    throw new Error(`OpenSky request failed (HTTP ${res.status})`);
  }

  return { json: await res.json(), auth: token ? "authenticated" : "anonymous" };
}

export async function fetchStates(bbox: BBox): Promise<{
  time: number;
  states: RawState[];
  auth: AuthMode;
}> {
  const qs = new URLSearchParams({
    lamin: bbox.lamin.toFixed(4),
    lomin: bbox.lomin.toFixed(4),
    lamax: bbox.lamax.toFixed(4),
    lomax: bbox.lomax.toFixed(4),
  });

  const { json, auth } = await openskyFetch(`${STATES_URL}?${qs.toString()}`);
  const data = json as { time: number; states: RawState[] | null };

  return { time: data.time, states: data.states ?? [], auth };
}

/**
 * The live track for one aircraft. Each path entry is
 * [time, lat, lon, baroAltitude, trueTrack, onGround].
 *
 * OpenSky marks this endpoint experimental, so callers must tolerate failure.
 * It is only ever hit on an explicit user action, never on the polling loop.
 */
export async function fetchTrack(icao24: string): Promise<{
  icao24: string;
  callsign: string | null;
  startTime: number | null;
  endTime: number | null;
  path: Array<[number, number, number, number | null, number | null, boolean]>;
}> {
  const qs = new URLSearchParams({ icao24: icao24.toLowerCase(), time: "0" });
  const { json } = await openskyFetch(`${TRACKS_URL}?${qs.toString()}`);

  const data = json as {
    icao24?: string;
    callsign?: string | null;
    startTime?: number | null;
    endTime?: number | null;
    path?: Array<[number, number, number, number | null, number | null, boolean]>;
  };

  return {
    icao24: data.icao24 ?? icao24,
    callsign: data.callsign?.trim() || null,
    startTime: data.startTime ?? null,
    endTime: data.endTime ?? null,
    path: data.path ?? [],
  };
}
