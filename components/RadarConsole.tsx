"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Broadcast } from "@phosphor-icons/react/dist/ssr";
import { bearingDeg, haversineKm, project } from "@/lib/geo";
import { decodeCallsign } from "@/lib/aircraft";
import { PHASE_LABEL } from "@/lib/classify";
import {
  fireNotification,
  notifyState,
  requestNotifyPermission,
  type NotifyState,
} from "@/lib/notify";
import type { ApiResponse, Contact, Station } from "@/lib/types";
import { StationControls } from "./StationControls";
import { FlightBoard } from "./FlightBoard";
import { InRangeList } from "./InRangeList";
import { RadarScope } from "./RadarScope";
import { StatusBar } from "./StatusBar";
import { ThemeToggle } from "./ThemeToggle";

/**
 * 40s is easy on a free community feed: a tab left open all day makes ~2,160
 * requests. Dead reckoning moves the blips between polls, so the board still
 * reads as live.
 */
const POLL_MS = Math.max(
  15_000,
  Number(process.env.NEXT_PUBLIC_POLL_INTERVAL_MS) || 40_000,
);

/**
 * Cap dead reckoning so a stale snapshot never flies a blip off-scope. Must
 * stay above POLL_MS or blips visibly freeze at the end of every cycle.
 */
const MAX_DR_SECONDS = 45;

/** Do not re-alert for the same aircraft within this window. */
const RENOTIFY_MS = 30 * 60 * 1000;

const KEY_STATION = "fo.station";
const KEY_RANGE = "fo.range";

function readStore<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeStore(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode or blocked storage: preferences just do not persist.
  }
}

export function RadarConsole() {
  const [mounted, setMounted] = useState(false);
  const [station, setStation] = useState<Station | null>(null);
  const [rangeKm, setRangeKm] = useState(10);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [nowTs, setNowTs] = useState(0);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notify, setNotify] = useState<NotifyState>("default");

  const [resolving, setResolving] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  const pollAbort = useRef<AbortController | null>(null);
  /** icao24 -> last alert time, so one pass does not alert repeatedly. */
  const alerted = useRef<Map<string, number>>(new Map());

  // --- boot: restore preferences -------------------------------------------
  useEffect(() => {
    const storedStation = readStore<Station>(KEY_STATION);
    const storedRange = readStore<number>(KEY_RANGE);

    if (storedStation) setStation(storedStation);
    if (typeof storedRange === "number") setRangeKm(storedRange);

    setNotify(notifyState());
    setNowTs(Date.now());
    setMounted(true);
  }, []);

  // --- polling --------------------------------------------------------------
  const load = useCallback(async () => {
    pollAbort.current?.abort();
    const ac = new AbortController();
    pollAbort.current = ac;

    const params = new URLSearchParams({ range: String(rangeKm) });
    if (station) {
      params.set("lat", String(station.lat));
      params.set("lon", String(station.lon));
    }

    try {
      const res = await fetch(`/api/flights?${params}`, {
        signal: ac.signal,
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`API ${res.status}`);
      const json = (await res.json()) as ApiResponse;
      setData(json);
      setFetchError(null);
      // Adopt the server's default station on first load.
      setStation(
        (prev) =>
          prev ?? {
            lat: json.home.lat,
            lon: json.home.lon,
            label: json.homeLabel,
            query: json.homeQuery,
          },
      );
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setFetchError((err as Error).message || "Network error");
    }
  }, [rangeKm, station]);

  useEffect(() => {
    if (!mounted) return;
    load();
    const poll = setInterval(load, POLL_MS);
    return () => {
      clearInterval(poll);
      pollAbort.current?.abort();
    };
  }, [mounted, load]);

  useEffect(() => {
    if (!mounted) return;
    const clock = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(clock);
  }, [mounted]);

  // --- derived: dead-reckoned live contacts --------------------------------
  const home = data?.home ?? station ?? { lat: 0, lon: 0 };
  const effectiveRange = data?.rangeKm ?? rangeKm;
  const overheadRadius = data?.overheadRadiusKm ?? 2.5;

  const live: Contact[] = useMemo(() => {
    if (!data) return [];
    const elapsed = Math.min(
      MAX_DR_SECONDS,
      Math.max(0, (nowTs - data.updatedAt) / 1000),
    );
    return data.contacts
      .map((c) => {
        let { lat, lon } = c;
        if (c.velocityMs && c.trackDeg != null && elapsed > 0) {
          const p = project(c.lat, c.lon, c.trackDeg, c.velocityMs, elapsed);
          lat = p.lat;
          lon = p.lon;
        }
        return {
          ...c,
          lat,
          lon,
          distanceKm: haversineKm(home.lat, home.lon, lat, lon),
          bearingDeg: bearingDeg(home.lat, home.lon, lat, lon),
        };
      })
      .filter((c) => c.distanceKm <= effectiveRange)
      .sort((a, b) => a.distanceKm - b.distanceKm);
  }, [data, nowTs, home.lat, home.lon, effectiveRange]);

  // What the board shows: your pick, else the most interesting live event.
  const pinned = selectedId != null;
  const autoFocus = useMemo(() => {
    if (live.length === 0) return null;
    const overheadNow = live.find((c) => c.distanceKm <= overheadRadius);
    if (overheadNow) return overheadNow;
    const meaningful = live.find(
      (c) => c.phase === "arriving" || c.phase === "departing",
    );
    return meaningful ?? live[0];
  }, [live, overheadRadius]);

  const boardContact = pinned
    ? (live.find((c) => c.id === selectedId) ?? null)
    : autoFocus;
  const boardOverhead =
    boardContact != null && boardContact.distanceKm <= overheadRadius;

  // --- overhead alerts ----------------------------------------------------
  useEffect(() => {
    if (!data) return;
    const now = Date.now();

    for (const c of data.contacts) {
      if (c.distanceKm > data.overheadRadiusKm) continue;
      const last = alerted.current.get(c.id);
      if (last && now - last < RENOTIFY_MS) continue;
      alerted.current.set(c.id, now);

      const cs = decodeCallsign(c.callsign);
      const e = c.enrichment;
      const operator = cs.operator ?? e?.airlineName ?? e?.owner ?? null;
      const type =
        e?.manufacturer && e?.type
          ? `${e.manufacturer} ${e.type}`
          : (e?.type ?? e?.icaoType ?? null);
      const routeWords =
        e?.origin?.municipality && e?.destination?.municipality
          ? `${e.origin.municipality} → ${e.destination.municipality}`
          : e?.origin?.iata && e?.destination?.iata
            ? `${e.origin.iata} → ${e.destination.iata}`
            : null;

      const title = PHASE_LABEL[c.phase];
      const body = [
        operator && cs.flightNumber
          ? `${operator} ${cs.flightNumber}`
          : c.callsign,
        type,
        routeWords,
      ]
        .filter(Boolean)
        .join(" · ");
      fireNotification(title, body, `fo-${c.id}`);
    }
  }, [data]);

  // --- actions --------------------------------------------------------------
  const applyStation = useCallback(async (query: string) => {
    setResolving(true);
    setGeoError(null);
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) {
        setGeoError(json?.error ?? "Location not found.");
        return;
      }
      const next: Station = {
        lat: json.lat,
        lon: json.lon,
        label: json.label,
        query,
      };
      setStation(next);
      writeStore(KEY_STATION, next);
      setSelectedId(null);
      alerted.current.clear();
    } catch {
      setGeoError("Location lookup failed.");
    } finally {
      setResolving(false);
    }
  }, []);

  const applyRange = useCallback((km: number) => {
    setRangeKm(km);
    writeStore(KEY_RANGE, km);
  }, []);

  const toggleNotify = useCallback(async () => {
    if (notifyState() === "granted") {
      setNotify("granted");
      return;
    }
    setNotify(await requestNotifyPermission());
  }, []);

  const loading = !data && !fetchError;

  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-[1500px] flex-col gap-4 p-4 md:p-6">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <Broadcast size={26} weight="bold" className="text-accent-ink" />
          <div className="flex flex-col gap-0.5">
            <h1 className="text-[19px] leading-none tracking-[0.3em] text-ink">
              FLIGHTS OVERHEAD
            </h1>
            <span className="text-[12px] tracking-[0.14em] text-ink-dim">
              Built by Jesse Little
            </span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="hidden text-[12.5px] tracking-[0.2em] text-ink-dim sm:block">
            LIVE ADS-B · ADSB.LOL + ADSBDB
          </span>
          <ThemeToggle />
        </div>
      </header>

      {!mounted ? (
        <div className="panel flex flex-1 items-center justify-center p-8 text-[15px] tracking-[0.2em] text-ink-dim">
          INITIALISING
        </div>
      ) : (
        <>
          <StationControls
            /* Remount when the applied station changes so the field shows
               the value that is actually in effect. */
            key={station?.query ?? "unset"}
            query={station?.query ?? ""}
            stationLabel={station?.label ?? null}
            rangeKm={rangeKm}
            onSetStation={applyStation}
            onSetRange={applyRange}
            resolving={resolving}
            error={geoError}
            notify={notify}
            onToggleNotify={toggleNotify}
          />

          <StatusBar
            source={data?.source ?? "adsb.lol"}
            snapshotAt={data?.updatedAt ?? null}
            count={live.length}
            rangeKm={effectiveRange}
            home={home}
            pollMs={POLL_MS}
            stale={Boolean(data?.stale) || Boolean(fetchError)}
            error={fetchError ?? data?.error ?? null}
            nowTs={nowTs || Date.now()}
          />

          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,400px)]">
            {/* min-w-0: grid items default to min-width:auto and would
                otherwise refuse to shrink below their longest text. */}
            <div className="min-w-0">
              <FlightBoard
                contact={boardContact}
                overhead={boardOverhead}
                pinned={pinned}
                onClear={() => setSelectedId(null)}
              />
            </div>

            <div className="flex min-w-0 flex-col gap-4">
              <section className="panel flex justify-center p-4">
                {/* Cap the square so it does not balloon to full width on a
                    single-column (tablet / narrow) layout. */}
                <div className="w-full max-w-[400px]">
                  <RadarScope
                    contacts={live}
                    rangeKm={effectiveRange}
                    overheadRadiusKm={overheadRadius}
                    loading={loading}
                    selectedId={selectedId}
                    onSelect={(id) =>
                      setSelectedId((cur) => (cur === id ? null : id))
                    }
                  />
                </div>
              </section>
              <InRangeList
                contacts={live}
                selectedId={selectedId}
                overheadRadiusKm={overheadRadius}
                onSelect={(id) =>
                  setSelectedId((cur) => (cur === id ? null : id))
                }
              />
            </div>
          </div>
        </>
      )}

      <footer className="mt-auto border-t border-line pt-4 text-center text-[12.5px] tracking-[0.14em] text-ink-faint">
        For fun. Enjoy :)
      </footer>
    </main>
  );
}
