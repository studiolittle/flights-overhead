"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BeerStein, Broadcast } from "@phosphor-icons/react/dist/ssr";
import { bearingDeg, haversineKm, project } from "@/lib/geo";
import { HOME_AIRPORT } from "@/lib/config";
import type { ApiResponse, Contact, Station } from "@/lib/types";
import { AirportPanel } from "./AirportPanel";
import { StationControls } from "./StationControls";
import { FlightBoard, type BoardSlot } from "./FlightBoard";
import { InRangeList } from "./InRangeList";
import { LearningCentre } from "./LearningCentre";
import { OnlineCount } from "./OnlineCount";
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
  const [rangeKm, setRangeKm] = useState(50);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [nowTs, setNowTs] = useState(0);

  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [resolving, setResolving] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  const pollAbort = useRef<AbortController | null>(null);

  // --- boot: restore preferences -------------------------------------------
  useEffect(() => {
    const storedStation = readStore<Station>(KEY_STATION);
    const storedRange = readStore<number>(KEY_RANGE);

    if (storedStation) setStation(storedStation);
    if (typeof storedRange === "number") setRangeKm(storedRange);

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

  /**
   * Every YOW flight in the snapshot, advanced by dead reckoning. Distance and
   * bearing are from the house: the boards and the overhead check work from
   * these. `overhead` is fixed here because the airport scope centres on the
   * airport and cannot derive it.
   */
  const reckoned: Contact[] = useMemo(() => {
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
        const distanceKm = haversineKm(home.lat, home.lon, lat, lon);
        return {
          ...c,
          lat,
          lon,
          distanceKm,
          bearingDeg: bearingDeg(home.lat, home.lon, lat, lon),
          overhead: distanceKm <= overheadRadius,
        };
      })
      .sort((a, b) => a.distanceKm - b.distanceKm);
  }, [data, nowTs, home.lat, home.lon, overheadRadius]);

  /**
   * The same contacts placed around the airport and cut to the chosen range,
   * nearest the airport first, for the traffic list and picking each board's
   * lead. `overhead` (house-relative) rides along from `reckoned`.
   */
  const live: Contact[] = useMemo(
    () =>
      reckoned
        .map((c) => ({
          ...c,
          distanceKm: haversineKm(
            HOME_AIRPORT.lat,
            HOME_AIRPORT.lon,
            c.lat,
            c.lon,
          ),
          bearingDeg: bearingDeg(
            HOME_AIRPORT.lat,
            HOME_AIRPORT.lon,
            c.lat,
            c.lon,
          ),
        }))
        .filter((c) => c.distanceKm <= effectiveRange)
        .sort((a, b) => a.distanceKm - b.distanceKm),
    [reckoned, effectiveRange],
  );

  // --- the two boards --------------------------------------------------------
  const selected = selectedId
    ? (reckoned.find((c) => c.id === selectedId) ?? null)
    : null;

  /**
   * The flight leading one side of the board. A flight you picked from the
   * list or the airport scope wins its own side; otherwise anything overhead,
   * then whichever is closest to the airport: the next to land, or the one
   * that just took off. Shown with its house-relative numbers from `reckoned`.
   */
  const lead = (slot: BoardSlot) => {
    if (selected?.phase === slot) return { contact: selected, pinned: true };
    const inSlot = live.filter((c) => c.phase === slot);
    const top = inSlot.find((c) => c.overhead) ?? inSlot[0];
    return {
      contact: top ? (reckoned.find((c) => c.id === top.id) ?? null) : null,
      pinned: false,
    };
  };
  const arriving = lead("arriving");
  const departing = lead("departing");

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

  const toggleSelect = useCallback((id: string) => {
    setSelectedId((cur) => (cur === id ? null : id));
  }, []);

  const clearSelection = useCallback(() => setSelectedId(null), []);

  const loading = !data && !fetchError;
  const code = HOME_AIRPORT.iata;

  return (
    // pb-24: room to scroll the footer clear of the pinned online counter.
    <main className="mx-auto flex min-h-[100dvh] max-w-[1500px] flex-col gap-4 p-4 pb-24 md:p-6 md:pb-24">
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

      <div className="panel flex items-start gap-3 px-5 py-4">
        <BeerStein
          size={20}
          weight="bold"
          className="mt-0.5 shrink-0 text-accent-ink"
        />
        <div>
          <h2 className="text-[13.5px] tracking-[0.14em] text-ink">
            WELCOME
          </h2>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-dim">
            I built this app for fun and to learn more about the airplanes
            flying over my head while in my backyard enjoying a beer (or 12).
            I really hope you enjoy it. Crack open a beer and learn something
            about aviation.{" "}
            <span className="text-ink-faint">&mdash; Jesse</span>
          </p>
        </div>
      </div>

      {!mounted ? (
        <div className="panel flex flex-1 items-center justify-center p-8 text-[15px] tracking-[0.2em] text-ink-dim">
          INITIALISING
        </div>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(340px,420px)]">
          {/* Main: what is landing and what is taking off. min-w-0: grid
              items default to min-width:auto and would otherwise refuse to
              shrink below their longest text. */}
          <div className="flex min-w-0 flex-col gap-4">
            <FlightBoard
              slot="arriving"
              contact={arriving.contact}
              overhead={arriving.contact?.overhead ?? false}
              pinned={arriving.pinned}
              onClear={clearSelection}
              emptyText={
                loading
                  ? `Scanning the sky around ${code}…`
                  : `Nothing landing at ${code} right now. Crack a beer, there's always another one on the way in.`
              }
            />
            <FlightBoard
              slot="departing"
              contact={departing.contact}
              overhead={departing.contact?.overhead ?? false}
              pinned={departing.pinned}
              onClear={clearSelection}
              emptyText={
                loading
                  ? `Scanning the sky around ${code}…`
                  : `Nothing taking off from ${code} right now. Keep an eye on the runway.`
              }
            />
            <InRangeList
              contacts={live}
              selectedId={selectedId}
              onSelect={toggleSelect}
              title={`${code} TRAFFIC`}
              emptyText={`No ${code} arrivals or departures within ${Math.round(effectiveRange)} km.`}
            />
            <StationControls
              /* Remount when the applied station changes so the field
                 shows the value that is actually in effect. */
              key={station?.query ?? "unset"}
              query={station?.query ?? ""}
              stationLabel={station?.label ?? null}
              rangeKm={rangeKm}
              onSetStation={applyStation}
              onSetRange={applyRange}
              resolving={resolving}
              error={geoError}
              nowTs={nowTs}
            />
          </div>

          {/* Side: the airport at a glance, and the glossary. */}
          <div className="flex min-w-0 flex-col gap-4">
            <AirportPanel
              contacts={reckoned}
              station={home}
              selectedId={selectedId}
              onSelect={toggleSelect}
              nowTs={nowTs || Date.now()}
            />
            <LearningCentre />
          </div>
        </div>
      )}

      <footer className="mt-auto flex flex-col items-center gap-1.5 border-t border-line pt-4 text-center text-[12.5px] tracking-[0.14em] text-ink-faint">
        {mounted && (
          <div className="mb-2">
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
          </div>
        )}
        <span>For fun. Enjoy :)</span>
        <a
          href="mailto:info@studiolittle.ca"
          className="text-ink-dim transition-colors hover:text-accent-ink"
        >
          info@studiolittle.ca
        </a>
      </footer>

      {mounted && <OnlineCount />}
    </main>
  );
}
