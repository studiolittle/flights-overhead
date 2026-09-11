"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BeerStein, Broadcast } from "@phosphor-icons/react/dist/ssr";
import { bearingDeg, haversineKm, project } from "@/lib/geo";
import { HOME_AIRPORT } from "@/lib/config";
import type { ApiResponse, Contact } from "@/lib/types";
import { AirportPanel } from "./AirportPanel";
import { FlightBoard, type BoardSlot } from "./FlightBoard";
import { InRangeList } from "./InRangeList";
import { LearningCentre } from "./LearningCentre";
import { StatusBar } from "./StatusBar";
import { ThemeToggle } from "./ThemeToggle";
import { useAirportConditions } from "./useAirportConditions";

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

/**
 * Flights are always fetched for 50 km around YOW, the whole approach. The
 * radar's zoom only changes what it shows.
 */
const RANGE_KM = 50;

export function RadarConsole() {
  const [mounted, setMounted] = useState(false);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [nowTs, setNowTs] = useState(0);

  const [selectedId, setSelectedId] = useState<string | null>(null);

  const pollAbort = useRef<AbortController | null>(null);

  // --- boot -------------------------------------------------------------------
  useEffect(() => {
    setNowTs(Date.now());
    setMounted(true);
  }, []);

  // --- polling --------------------------------------------------------------
  const load = useCallback(async () => {
    pollAbort.current?.abort();
    const ac = new AbortController();
    pollAbort.current = ac;

    const params = new URLSearchParams({ range: String(RANGE_KM) });

    try {
      const res = await fetch(`/api/flights?${params}`, {
        signal: ac.signal,
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`API ${res.status}`);
      const json = (await res.json()) as ApiResponse;
      setData(json);
      setFetchError(null);
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setFetchError((err as Error).message || "Network error");
    }
  }, []);

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
  const home = data?.home ?? HOME_AIRPORT;
  const effectiveRange = data?.rangeKm ?? RANGE_KM;
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

  /** Weather and the runways in use, shared by the runways strip and the map. */
  const airport = useAirportConditions(reckoned, nowTs || Date.now());

  // --- the two boards --------------------------------------------------------
  const selected = selectedId
    ? (reckoned.find((c) => c.id === selectedId) ?? null)
    : null;

  /**
   * The flight leading one side of the board on its own: anything overhead,
   * then whichever is closest to the airport: the next to land, or the one
   * that just took off. Shown with its numbers from `reckoned`.
   */
  const lead = (slot: BoardSlot): Contact | null => {
    const inSlot = live.filter((c) => c.phase === slot);
    const top = inSlot.find((c) => c.overhead) ?? inSlot[0];
    return top ? (reckoned.find((c) => c.id === top.id) ?? null) : null;
  };
  const arriving = lead("arriving");
  const departing = lead("departing");

  /**
   * The flight the Learning Centre's tags describe: the one you picked, else
   * the next arrival, else the latest departure.
   */
  const focus = selected ?? arriving ?? departing;

  // --- actions --------------------------------------------------------------
  const toggleSelect = useCallback((id: string) => {
    setSelectedId((cur) => (cur === id ? null : id));
  }, []);

  const clearSelection = useCallback(() => setSelectedId(null), []);

  const loading = !data && !fetchError;
  const code = HOME_AIRPORT.iata;

  /**
   * One side of the board, in a desktop and a phone version. On desktop the
   * boards sit beside the radar, so a flight you pick takes over its own
   * side. On phones the picked flight opens under the radar instead
   * (AirportPanel), so the board keeps its own lead and hides if that lead is
   * the picked flight. Either way the flight shows once.
   */
  const boardFor = (slot: BoardSlot, auto: Contact | null) => {
    const picked = selected?.phase === slot ? selected : null;
    const desk = picked ?? auto;
    const emptyText = loading
      ? `Scanning the sky around ${code}…`
      : slot === "arriving"
        ? `Nothing landing at ${code} right now. Crack a beer, there's always another one on the way in.`
        : `Nothing taking off from ${code} right now. Keep an eye on the runway.`;
    return (
      <>
        <div className="hidden lg:block">
          <FlightBoard
            slot={slot}
            contact={desk}
            overhead={desk?.overhead ?? false}
            pinned={picked != null}
            onClear={clearSelection}
            emptyText={emptyText}
          />
        </div>
        <div className={auto && auto.id === selectedId ? "hidden" : "lg:hidden"}>
          <FlightBoard
            slot={slot}
            contact={auto}
            overhead={auto?.overhead ?? false}
            pinned={false}
            onClear={clearSelection}
            emptyText={emptyText}
          />
        </div>
      </>
    );
  };

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

      {/* On phones the welcome drops to the bottom, just above the footer,
          so the radar is the first thing on screen. */}
      <div className="panel order-1 flex items-start gap-3 px-5 py-4 lg:order-none">
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
        <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(340px,400px)] lg:items-start">
          {/* On desktop the two wrappers below are real columns. Narrower,
              they are display:contents, so `order` can interleave their
              children: airport, the two boards, learning, then traffic.
              min-w-0: grid and flex items default to
              min-width:auto and would otherwise refuse to shrink below their
              longest text. */}

          {/* Main: the airport and its runways in use, then learning. */}
          <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-4">
            <div className="order-1 min-w-0 lg:order-none">
              <AirportPanel
                contacts={reckoned}
                selected={selected}
                onSelect={toggleSelect}
                onClear={clearSelection}
                nowTs={nowTs || Date.now()}
                weather={airport.weather}
                weatherError={airport.weatherError}
                landing={airport.landing}
                takeoff={airport.takeoff}
              />
            </div>
            <div className="order-3 min-w-0 lg:order-none">
              <LearningCentre flight={focus} />
            </div>
          </div>

          {/* Side: what is landing and what is taking off, then the full
              traffic list. */}
          <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-4">
            <div className="order-2 flex min-w-0 flex-col gap-4 lg:order-none">
              {boardFor("arriving", arriving)}
              {boardFor("departing", departing)}
            </div>
            <div className="order-4 flex min-w-0 flex-col gap-4 lg:order-none">
              <InRangeList
                contacts={live}
                selectedId={selectedId}
                onSelect={toggleSelect}
                title={`${code} TRAFFIC`}
                emptyText={`No ${code} arrivals or departures within ${Math.round(effectiveRange)} km.`}
              />
            </div>
          </div>
        </div>
      )}

      <footer className="order-2 mt-auto flex flex-col lg:order-none items-center gap-1.5 border-t border-line pt-4 text-center text-[12.5px] tracking-[0.14em] text-ink-faint">
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
    </main>
  );
}
