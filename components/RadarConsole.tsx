"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Broadcast, AirplaneLanding, AirplaneTakeoff, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { bearingDeg, haversineKm, project } from "@/lib/geo";
import { HOME_AIRPORT } from "@/lib/config";
import type { ApiResponse, Contact } from "@/lib/types";
import { ConditionsPanel, LocalTime, RadarPanel, type FeedStatus } from "./AirportPanel";
import { flightTitle } from "@/lib/aircraft";
import { ageLabel } from "@/lib/format";
import { FunFactsSpot } from "./FunFactsSpot";
import { LearningCentre } from "./LearningCentre";
import { ViewerCount } from "./ViewerCount";
import { useAirportConditions } from "./useAirportConditions";

/**
 * 10 s matches the server's shared 9 s snapshot, which Vercel's CDN hands to
 * every visitor: polling faster would only fetch the same snapshot again,
 * and more visitors don't mean more calls to the feed. Polling pauses while
 * the tab is hidden. Dead reckoning moves the blips between polls.
 */
const POLL_MS = Math.max(
  10_000,
  Number(process.env.NEXT_PUBLIC_POLL_INTERVAL_MS) || 10_000,
);

/**
 * Cap dead reckoning so a stale snapshot never flies a blip off-scope. Must
 * stay above POLL_MS or blips visibly freeze at the end of every cycle.
 */
const MAX_DR_SECONDS = 20;

/**
 * Flights are fetched for 50 km around YOW, the whole approach: the same
 * reach the radar shows.
 */
const RANGE_KM = 50;

/** A snapshot older than this no longer counts as live. */
const STALE_MS = 45_000;

export function RadarConsole() {
  const [mounted, setMounted] = useState(false);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [nowTs, setNowTs] = useState(0);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"dashboard" | "learning">("dashboard");

  const openLearning = () => {
    setActiveTab("learning");
    document.getElementById("learning-tab")?.focus();
  };

  const pollAbort = useRef<AbortController | null>(null);
  /** Polls failed in a row. One dropped poll is noise; two is an outage. */
  const failures = useRef(0);
  const hasData = useRef(false);

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
      if (!res.ok) throw new Error(`The flight feed isn't responding (error ${res.status}).`);
      const json = (await res.json()) as ApiResponse;
      setData(json);
      setFetchError(null);
      failures.current = 0;
      hasData.current = true;
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      failures.current += 1;
      // Before the first snapshot there is nothing to fall back on, so say so
      // at once; after it, wait for a second miss.
      if (failures.current < 2 && hasData.current) return;
      const message = (err as Error).message;
      setFetchError(
        !navigator.onLine
          ? "You appear to be offline."
          : message.startsWith("The flight feed")
            ? message
            : "Can't reach the flight feed.",
      );
    }
  }, []);

  // Poll only while the page is on screen: a background tab costs requests
  // and shows nothing. Coming back refreshes at once.
  useEffect(() => {
    if (!mounted) return;
    let poll: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (poll) return;
      load();
      poll = setInterval(load, POLL_MS);
    };
    const stop = () => {
      if (poll) clearInterval(poll);
      poll = null;
      pollAbort.current?.abort();
    };
    const onVisibility = () => (document.hidden ? stop() : start());
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      stop();
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
   * bearing are from the home point (the airport unless HOME_LAT/HOME_LON
   * move it); `overhead` is within the feed's overhead radius of it.
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
   * nearest the airport first, for picking the featured flight. `overhead` rides along from `reckoned`.
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
  const lead = (slot: "arriving" | "departing"): Contact | null => {
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
  const focus = selected ?? arriving ?? departing ?? live[0] ?? null;

  // --- actions --------------------------------------------------------------
  const toggleSelect = useCallback((id: string) => {
    setSelectedId((cur) => (cur === id ? null : id));
  }, []);

  const clearSelection = useCallback(() => setSelectedId(null), []);

  const loading = !data && !fetchError;

  // A snapshot older than this is not "live": say so instead of showing an
  // empty or frozen sky as if it were current.
  const ageMs = data ? Math.max(0, nowTs - data.updatedAt) : null;
  const stale = ageMs != null && ageMs > STALE_MS;
  const offline = fetchError != null || stale;
  /** Drives the status dot and the sweep, so neither claims a live feed that isn't. */
  const feedStatus: FeedStatus = offline ? "offline" : data ? "live" : "loading";

  // Screen readers get the roster whenever who is in range changes, not on
  // every one-second tick.
  const rosterKey = live.map((c) => c.id).sort().join(",");
  const roster = useMemo(
    () =>
      live.length
        ? `${live.length} aircraft in range: ${live.map(flightTitle).join(", ")}.`
        : "No aircraft in range.",
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rosterKey],
  );

  return (
    <main data-dashboard-ready={mounted && Boolean(data || fetchError)} className={`mx-auto flex min-h-[100dvh] max-w-[1440px] flex-col gap-5 p-4 md:p-8 ${selected && activeTab === "dashboard" ? "max-lg:pb-[calc(var(--sheet-h)+1rem)]" : ""}`}>
      <a href="#activity" className="skip-link">Skip to the flight list</a>
      <header className="flex items-start justify-between gap-4 border-b border-line pb-5">
        <div className="flex min-w-0 items-center gap-3.5">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent text-on-accent shadow-sm">
            <Broadcast size={24} weight="bold" />
          </span>
          <div className="flex flex-col gap-0.5">
            <h1 className="type-heading text-[length:var(--type-3)] text-ink">
              Flights Overhead
            </h1>
            <span className="text-[length:var(--type-0)] tracking-normal text-ink-dim">
              Ottawa International · YOW
            </span>
          </div>
        </div>
      </header>

      <div role="tablist" aria-label="Dashboard sections" className="flex gap-6">
        {(["dashboard", "learning"] as const).map((tab) => (
          <button
            key={tab}
            id={`${tab}-tab`}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            aria-controls={`${tab}-panel`}
            tabIndex={activeTab === tab ? 0 : -1}
            onClick={() => setActiveTab(tab)}
            onKeyDown={(event) => {
              if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
              event.preventDefault();
              const next = event.key === "Home" ? "dashboard" : event.key === "End" ? "learning" : tab === "dashboard" ? "learning" : "dashboard";
              setActiveTab(next);
              document.getElementById(`${next}-tab`)?.focus();
            }}
            className={`min-h-11 border-b-2 py-2 text-[length:var(--type-0)] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent-ink ${activeTab === tab ? "border-accent-ink text-ink" : "border-transparent text-ink-dim hover:text-ink"}`}
          >
            {tab === "dashboard" ? "Dashboard" : "Learning centre"}
          </button>
        ))}
      </div>

      <div id="dashboard-panel" role="tabpanel" aria-labelledby="dashboard-tab" hidden={activeTab !== "dashboard"} className="min-w-0">
      <p className="sr-only" role="status" aria-live="polite">{mounted && data ? roster : ""}</p>
      {!mounted ? (
        <p className="py-8 text-center text-ink-dim">Scanning the sky…</p>
      ) : (
        <div className="grid items-start gap-x-8 gap-y-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(340px,1fr)]">
          {/* The stage: the radar is the page, drawn straight onto the sky. */}
          <div className="flex min-w-0 flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[length:var(--type-small)] tabular-nums text-ink-dim">
              <span className="flex flex-wrap items-center gap-x-2">
                <span className="font-semibold text-ink">{data ? live.length : "—"}</span>
                aircraft within {effectiveRange} km
                {ageMs != null && !offline && (
                  <span className="text-ink-faint">· updated {ageLabel(ageMs)} ago</span>
                )}
              </span>
              <LocalTime nowTs={nowTs} status={feedStatus} />
            </div>

            {offline && (
              <p role="status" className="flex items-center gap-2.5 rounded-lg border border-alert/50 bg-alert/10 py-1.5 pl-3 pr-1 text-[length:var(--type-0)] leading-snug text-ink">
                <WarningCircle size={18} weight="bold" aria-hidden="true" className="shrink-0 text-alert" />
                <span className="min-w-0 flex-1">
                  {stale && ageMs != null
                    ? `The flight feed hasn't updated for ${ageLabel(ageMs)}, so what you see may be out of date.`
                    : fetchError}{" "}
                  Checking again every {Math.round(POLL_MS / 1000)} seconds.
                </span>
                <button type="button" onClick={load} className="inline-flex min-h-11 shrink-0 items-center px-2.5 font-semibold text-accent-ink underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-accent-ink">
                  Try now
                </button>
              </p>
            )}

            <RadarPanel contacts={reckoned} ready={data != null} live={feedStatus === "live"} selectedId={selectedId} onSelect={toggleSelect} wind={airport.wind} landing={airport.landing} takeoff={airport.takeoff} />

            <section id="activity" tabIndex={-1} className="flex min-w-0 scroll-mt-4 flex-col gap-3" aria-labelledby="activity-title">
              <h2 id="activity-title" className="sr-only">Arriving and departing flights</h2>
              {(["arriving", "departing"] as const).map((phase) => {
                const flights = live.filter((c) => c.phase === phase);
                const arrive = phase === "arriving";
                return (
                  <div key={phase} className="flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2">
                    <h3 className={`flex items-center gap-2 sm:mr-1 sm:min-h-11 text-[length:var(--type-0)] font-semibold ${arrive ? "text-accent-ink" : "text-depart"}`}>
                      {arrive ? <AirplaneLanding size={20} weight="bold" aria-hidden="true" /> : <AirplaneTakeoff size={20} weight="bold" aria-hidden="true" />}
                      {arrive ? "Arriving" : "Departing"}
                      <span className="tabular-nums text-ink-dim"><span className="sr-only">, </span>{flights.length}</span>
                    </h3>
                    <div className="flex flex-wrap items-center gap-2">
                    {flights.map((flight) => (
                      <button key={flight.id} type="button" aria-pressed={selectedId === flight.id} onClick={() => toggleSelect(flight.id)}
                        aria-label={`${flightTitle(flight)}, ${flight.distanceKm.toFixed(1)} kilometres from the airport`}
                        className={`flex min-h-11 items-center gap-2 rounded-full border px-3.5 text-[length:var(--type-small)] transition-colors focus-visible:outline-2 focus-visible:outline-accent-ink ${selectedId === flight.id ? arrive ? "border-accent-ink bg-accent/25 text-ink" : "border-depart bg-depart/20 text-ink" : "border-line-strong text-ink hover:bg-surface-2"}`}>
                        <span className="font-medium">{flightTitle(flight)}</span>
                        <span className="tabular-nums text-ink-dim">{flight.distanceKm.toFixed(1)} km</span>
                      </button>
                    ))}
                    {!flights.length && <span className="text-[length:var(--type-small)] text-ink-dim">{loading ? "Listening…" : "none right now"}</span>}
                    </div>
                  </div>
                );
              })}
              {data && !offline && live.length === 0 && (
                <p className="max-w-[60ch] text-[length:var(--type-small)] leading-relaxed text-ink-dim">
                  Quiet sky over Ottawa. Nothing is in range right now, and the radar is still listening. New aircraft appear the moment the sweep finds them.
                </p>
              )}
            </section>
          </div>

          <div className="flex min-w-0 flex-col gap-6">
            <FunFactsSpot radarId="radar" selected={selected} featured={arriving ?? departing ?? live[0] ?? null} onClear={clearSelection} state={loading ? "loading" : offline && !data ? "offline" : "ready"} />
            <ConditionsPanel nowTs={nowTs} weather={airport.weather} landing={airport.landing} takeoff={airport.takeoff} />
            <p className="px-1 text-[length:var(--type-small)] leading-relaxed text-ink-dim">
              Curious what the codes and numbers mean?{" "}
              <button type="button" onClick={openLearning} className="inline-flex min-h-11 items-center font-medium text-accent-ink underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-accent-ink">
                Open the learning centre
              </button>
            </p>
          </div>
        </div>
      )}
      </div>

      <div id="learning-panel" role="tabpanel" aria-labelledby="learning-tab" hidden={activeTab !== "learning"} className="mx-auto w-full max-w-4xl min-w-0">
        <LearningCentre flight={focus} flights={live} selectedId={selectedId} onPick={setSelectedId} hidden={activeTab !== "learning"} />
      </div>

      <footer className="order-2 mt-auto flex flex-wrap items-center justify-between gap-x-6 gap-y-1 border-t border-line pt-2 text-[length:var(--type-0)] tracking-normal text-ink-dim">
        <div className="flex flex-wrap items-center gap-x-3">
          <a href="https://studiolittle.ca" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center underline-offset-4 transition-colors hover:text-accent-ink hover:underline focus-visible:outline-2 focus-visible:outline-accent-ink">studiolittle.ca</a>
          <span aria-hidden="true" className="text-ink-faint">·</span>
          <a href="https://adsb.lol" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center underline-offset-4 transition-colors hover:text-accent-ink hover:underline focus-visible:outline-2 focus-visible:outline-accent-ink">Flight data by adsb.lol</a>
        </div>
        <ViewerCount active={activeTab === "dashboard"} />
      </footer>
    </main>
  );
}
