"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Broadcast } from "@phosphor-icons/react/dist/ssr";
import { bearingDeg, haversineKm, project } from "@/lib/geo";
import { decodeCallsign } from "@/lib/aircraft";
import { PHASE_LABEL } from "@/lib/classify";
import { flightLevel } from "@/lib/format";
import {
  fireNotification,
  notifyState,
  requestNotifyPermission,
  type NotifyState,
} from "@/lib/notify";
import type {
  ApiResponse,
  Contact,
  Station,
  TrackResponse,
} from "@/lib/types";
import { StationControls } from "./StationControls";
import { FlightBoard } from "./FlightBoard";
import { InRangeList } from "./InRangeList";
import { OverheadLog, type LogEntry } from "./OverheadLog";
import { RadarScope } from "./RadarScope";
import { StatusBar } from "./StatusBar";

/**
 * 40s keeps a tab left open all day at roughly half the authenticated OpenSky
 * daily quota (~2,160 requests vs a ~4,000 limit). Dead reckoning moves the
 * blips between polls, so the board still reads as live.
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

const LOG_LIMIT = 40;
const KEY_STATION = "fo.station";
const KEY_RANGE = "fo.range";
const KEY_LOG = "fo.log";

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
  const [track, setTrack] = useState<TrackResponse | null>(null);
  const [trackLoading, setTrackLoading] = useState(false);

  const [log, setLog] = useState<LogEntry[]>([]);
  const [notify, setNotify] = useState<NotifyState>("default");

  const [resolving, setResolving] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  const pollAbort = useRef<AbortController | null>(null);
  const trackAbort = useRef<AbortController | null>(null);
  /** icao24 -> last alert time, so one pass does not alert repeatedly. */
  const alerted = useRef<Map<string, number>>(new Map());

  // --- boot: restore preferences -------------------------------------------
  useEffect(() => {
    const storedStation = readStore<Station>(KEY_STATION);
    const storedRange = readStore<number>(KEY_RANGE);
    const storedLog = readStore<LogEntry[]>(KEY_LOG);

    if (storedStation) setStation(storedStation);
    if (typeof storedRange === "number") setRangeKm(storedRange);
    if (Array.isArray(storedLog)) setLog(storedLog);

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
    const meaningful = live.find((c) => c.phase === "arriving" || c.phase === "departing");
    return meaningful ?? live[0];
  }, [live, overheadRadius]);

  const boardContact = pinned
    ? (live.find((c) => c.id === selectedId) ?? null)
    : autoFocus;
  const boardOverhead =
    boardContact != null && boardContact.distanceKm <= overheadRadius;

  // --- overhead alerts + log ------------------------------------------------
  useEffect(() => {
    if (!data) return;
    const now = Date.now();
    const fresh: LogEntry[] = [];

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
      const route =
        e?.origin?.iata && e?.destination?.iata
          ? `${e.origin.iata} → ${e.destination.iata}`
          : null;
      const routeWords =
        e?.origin?.municipality && e?.destination?.municipality
          ? `${e.origin.municipality} → ${e.destination.municipality}`
          : route;

      fresh.push({
        id: c.id,
        at: now,
        callsign: c.callsign,
        operator,
        phase: c.phase,
        type: e?.icaoType ?? type,
        route,
        altitude: flightLevel(c.baroAltitudeM),
      });

      const title = PHASE_LABEL[c.phase];
      const body = [
        operator && cs.flightNumber ? `${operator} ${cs.flightNumber}` : c.callsign,
        type,
        routeWords,
      ]
        .filter(Boolean)
        .join(" · ");
      fireNotification(title, body, `fo-${c.id}`);
    }

    if (fresh.length > 0) {
      setLog((prev) => {
        const next = [...fresh, ...prev].slice(0, LOG_LIMIT);
        writeStore(KEY_LOG, next);
        return next;
      });
    }
  }, [data]);

  // --- flight path for the board -------------------------------------------
  const trackTargetId = pinned
    ? selectedId
    : boardOverhead
      ? (boardContact?.id ?? null)
      : null;

  useEffect(() => {
    if (!trackTargetId) {
      setTrack(null);
      setTrackLoading(false);
      return;
    }
    trackAbort.current?.abort();
    const ac = new AbortController();
    trackAbort.current = ac;
    setTrackLoading(true);

    fetch(`/api/track?icao24=${trackTargetId}`, {
      signal: ac.signal,
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((json: TrackResponse) => {
        setTrack(json);
        setTrackLoading(false);
      })
      .catch((err) => {
        if ((err as Error).name === "AbortError") return;
        setTrack(null);
        setTrackLoading(false);
      });

    return () => ac.abort();
  }, [trackTargetId]);

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
      setTrack(null);
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
    const state = notifyState();
    if (state === "granted") {
      // The API has no revoke; point the user at their browser settings.
      setNotify("granted");
      return;
    }
    setNotify(await requestNotifyPermission());
  }, []);

  const clearLog = useCallback(() => {
    setLog([]);
    writeStore(KEY_LOG, []);
  }, []);

  const loading = !data && !fetchError;

  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-[1500px] flex-col gap-4 p-4 md:p-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Broadcast size={20} weight="bold" className="text-[var(--accent)]" />
          <h1 className="text-sm tracking-[0.35em] text-[var(--text)]">
            FLIGHTS OVERHEAD
          </h1>
        </div>
        <span className="hidden text-[11px] tracking-[0.2em] text-[var(--text-dim)] sm:block">
          LIVE ADS-B · OPENSKY + ADSBDB
        </span>
      </header>

      {!mounted ? (
        <div className="panel flex flex-1 items-center justify-center p-8 text-sm tracking-[0.2em] text-[var(--text-dim)]">
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
            source={data?.source ?? "OpenSky Network"}
            auth={data?.auth ?? "anonymous"}
            snapshotAt={data?.updatedAt ?? null}
            count={live.length}
            rangeKm={effectiveRange}
            home={home}
            pollMs={POLL_MS}
            stale={Boolean(data?.stale) || Boolean(fetchError)}
            error={fetchError ?? data?.error ?? null}
            nowTs={nowTs || Date.now()}
          />

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(300px,360px)]">
            {/* min-w-0: grid items default to min-width:auto and would
                otherwise refuse to shrink below their longest text. */}
            <div className="flex min-w-0 flex-col gap-4">
              <FlightBoard
                contact={boardContact}
                overhead={boardOverhead}
                pinned={pinned}
                onClear={() => setSelectedId(null)}
                track={track}
                trackLoading={trackLoading}
                station={home}
              />
              <InRangeList
                contacts={live}
                selectedId={selectedId}
                overheadRadiusKm={overheadRadius}
                onSelect={(id) => setSelectedId((cur) => (cur === id ? null : id))}
              />
            </div>

            <div className="flex min-w-0 flex-col gap-4">
              <section className="panel p-4">
                <RadarScope
                  contacts={live}
                  station={home}
                  rangeKm={effectiveRange}
                  overheadRadiusKm={overheadRadius}
                  loading={loading}
                  selectedId={selectedId}
                  onSelect={(id) => setSelectedId((cur) => (cur === id ? null : id))}
                  trackPoints={track?.path ?? null}
                />
              </section>
              <OverheadLog entries={log} onClear={clearLog} />
            </div>
          </div>
        </>
      )}

      <footer className="mt-auto border-t border-[var(--line)] pt-4 text-center text-[11px] tracking-[0.14em] text-[var(--text-faint)]">
        Built by Jesse Little, for fun. Enjoy :)
      </footer>
    </main>
  );
}
