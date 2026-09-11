"use client";

import { useEffect, useState } from "react";
import {
  favouredRunway,
  runwayInUse,
  type RunwayOp,
  type RunwayWind,
} from "@/lib/airport";
import { HOME_AIRPORT } from "@/lib/config";
import type { Contact, WeatherResponse, Wind } from "@/lib/types";

/** METARs are hourly, so there is no point asking more often. */
const WEATHER_POLL_MS = 5 * 60 * 1000;

/** A runway seen in use stays the answer this long after the last sighting. */
const SIGHTING_TTL_MS = 20 * 60 * 1000;

export interface Sighting {
  ident: string;
  callsign: string;
  at: number;
}

/** The runway shown for one operation, and why. */
export type RunwayCall =
  | { source: "seen"; ident: string; sighting: Sighting }
  | { source: "wind"; ident: string; wind: RunwayWind }
  | { source: "none"; ident: null };

function callRunway(
  sighting: Sighting | null,
  favoured: RunwayWind | null,
): RunwayCall {
  if (sighting) return { source: "seen", ident: sighting.ident, sighting };
  if (favoured) return { source: "wind", ident: favoured.ident, wind: favoured };
  return { source: "none", ident: null };
}

export function minutesAgo(ms: number): string {
  const m = Math.round(ms / 60_000);
  return m < 1 ? "just now" : `${m} min ago`;
}

export interface AirportConditions {
  weather: WeatherResponse | null;
  weatherError: string | null;
  wind: Wind | null;
  landing: RunwayCall;
  takeoff: RunwayCall;
}

/**
 * The airport's weather and the runways in use, shared by the runways strip
 * and the airport panel. Polls the METAR, and remembers the last aircraft seen
 * on each runway so the answer holds in the gaps between movements; with no
 * recent sighting it falls back to the runway the wind favours.
 */
export function useAirportConditions(
  contacts: Contact[],
  nowTs: number,
): AirportConditions {
  const [weather, setWeather] = useState<WeatherResponse | null>(null);
  const [weatherError, setWeatherError] = useState<string | null>(null);
  const [seen, setSeen] = useState<Record<RunwayOp, Sighting | null>>({
    arrival: null,
    departure: null,
  });

  useEffect(() => {
    const ac = new AbortController();
    const load = () =>
      fetch("/api/weather", { signal: ac.signal, cache: "no-store" })
        .then((r) =>
          r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)),
        )
        .then((json: WeatherResponse) => {
          setWeather(json);
          setWeatherError(json.error);
        })
        .catch((err) => {
          if ((err as Error).name === "AbortError") return;
          setWeatherError((err as Error).message || "Weather lookup failed");
        });

    load();
    const poll = setInterval(load, WEATHER_POLL_MS);
    return () => {
      clearInterval(poll);
      ac.abort();
    };
  }, []);

  // Remember the last aircraft seen using each runway, so the answer holds in
  // the gaps between movements.
  useEffect(() => {
    const hits = contacts.flatMap((c) => {
      const hit = runwayInUse(c, HOME_AIRPORT);
      return hit ? [{ ...hit, callsign: c.callsign }] : [];
    });
    if (hits.length === 0) return;
    const at = Date.now();
    setSeen((prev) => {
      const next = { ...prev };
      for (const h of hits) {
        next[h.op] = { ident: h.ident, callsign: h.callsign, at };
      }
      return next;
    });
  }, [contacts]);

  const wind = weather?.wind ?? null;
  const favoured = favouredRunway(wind, HOME_AIRPORT);
  const fresh = (s: Sighting | null) =>
    s && nowTs - s.at < SIGHTING_TTL_MS ? s : null;

  return {
    weather,
    weatherError,
    wind,
    landing: callRunway(fresh(seen.arrival), favoured),
    takeoff: callRunway(fresh(seen.departure), favoured),
  };
}
