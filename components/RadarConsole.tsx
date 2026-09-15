"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Broadcast, AirplaneLanding, AirplaneTakeoff } from "@phosphor-icons/react/dist/ssr";
import { bearingDeg, haversineKm, project } from "@/lib/geo";
import { HOME_AIRPORT } from "@/lib/config";
import type { ApiResponse, Contact } from "@/lib/types";
import { ConditionsPanel, RadarPanel } from "./AirportPanel";
import type { BoardSlot } from "./FlightBoard";
import { flightTitle } from "@/lib/aircraft";
import { FunFactsSpot } from "./FunFactsSpot";
import { LearningCentre } from "./LearningCentre";
import { StatusBar } from "./StatusBar";
import { ThemeToggle } from "./ThemeToggle";
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
   * nearest the airport first, for picking each board's lead. `overhead` (house-relative) rides along from `reckoned`.
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
  const focus = selected ?? arriving ?? departing ?? live[0] ?? null;

  // --- actions --------------------------------------------------------------
  const toggleSelect = useCallback((id: string) => {
    setSelectedId((cur) => (cur === id ? null : id));
  }, []);

  const clearSelection = useCallback(() => setSelectedId(null), []);

  const loading = !data && !fetchError;


  return (
    <main data-dashboard-ready={mounted && Boolean(data || fetchError)} className="mx-auto flex min-h-[100dvh] max-w-[1440px] flex-col gap-6 p-4 md:p-8">
      <header className="flex items-start justify-between gap-4 border-b border-line pb-6">
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
        <div className="ml-auto shrink-0">
          <ThemeToggle />
        </div>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-4">
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
              className={`border-b-2 py-3 text-[length:var(--type-0)] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent-ink ${activeTab === tab ? "border-accent-ink text-ink" : "border-transparent text-ink-dim hover:text-ink"}`}
            >
              {tab === "dashboard" ? "Dashboard" : "Learning centre"}
            </button>
          ))}
        </div>
        <span className="text-[length:var(--type-small)] text-ink-dim">
          <span className="font-semibold text-ink">{mounted && data ? live.length : "—"}</span> aircraft nearby
          <span className="mx-2 text-ink-faint">·</span>{effectiveRange} km range
        </span>
      </div>

      <div id="dashboard-panel" role="tabpanel" aria-labelledby="dashboard-tab" tabIndex={0} hidden={activeTab !== "dashboard"} className="min-w-0">
      {!mounted ? (
        <div className="panel p-8 text-ink-dim">Scanning the sky…</div>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(340px,1fr)] xl:grid-cols-[minmax(0,2fr)_minmax(340px,1fr)]">
          <div className="flex min-w-0 flex-col gap-6">
            <div className="panel grid min-w-0 xl:grid-cols-[minmax(0,2fr)_minmax(220px,1fr)]">
              <RadarPanel nowTs={nowTs} contacts={reckoned} ready={data != null} selectedId={selectedId} onSelect={toggleSelect} wind={airport.wind} landing={airport.landing} takeoff={airport.takeoff} embedded />
            <section className="min-w-0 border-t border-line p-5 xl:border-t-0 xl:border-l xl:p-4" aria-labelledby="activity-title">
              <h2 id="activity-title" className="type-heading text-[length:var(--type-1)]">Arriving & departing</h2>
              <p className="mt-1 text-[length:var(--type-small)] text-ink-dim">Select a flight to explore.</p>
              <div className="mt-4 grid gap-6 md:grid-cols-2 xl:grid-cols-1">
                {(["arriving", "departing"] as const).map((phase) => {
                  const flights = live.filter((c) => c.phase === phase);
                  return (
                    <div key={phase} className={`overflow-hidden rounded-xl border ${phase === "arriving" ? "border-accent-ink/25 bg-accent/10" : "border-depart/25 bg-depart/5"}`}>
                      <h3 className={`flex items-center gap-2 px-3 py-3 text-[length:var(--type-1)] font-semibold ${phase === "arriving" ? "bg-accent/25 text-accent-ink" : "bg-depart/15 text-depart"}`}>
                        {phase === "arriving" ? <AirplaneLanding size={20} weight="bold" aria-hidden="true" /> : <AirplaneTakeoff size={20} weight="bold" aria-hidden="true" />}
                        {phase === "arriving" ? "Arriving" : "Departing"}
                        <span className={`ml-auto min-w-6 rounded-md px-1.5 py-0.5 text-center text-[length:var(--type-small)] tabular-nums ${phase === "arriving" ? "bg-accent text-on-accent" : "bg-depart text-on-depart"}`}>{flights.length}</span>
                      </h3>
                      <div className="flex flex-col gap-1 p-2">
                        {flights.map((flight) => (
                          <button key={flight.id} type="button" aria-pressed={focus?.id === flight.id} onClick={() => setSelectedId(flight.id)}
                            className={`flex w-full items-center justify-between gap-2 rounded-lg border px-2 py-2.5 text-left text-[length:var(--type-small)] transition-colors focus-visible:outline-2 focus-visible:outline-accent-ink ${focus?.id === flight.id ? phase === "arriving" ? "border-accent-ink bg-accent/25" : "border-depart bg-depart/15" : phase === "arriving" ? "border-transparent hover:bg-accent/15" : "border-transparent hover:bg-depart/10"}`}>
                            <span className="min-w-0 break-words font-medium">{flightTitle(flight)}</span>
                            <span className="shrink-0 text-ink-dim">{flight.distanceKm.toFixed(1)} km</span>
                          </button>
                        ))}
                        {!flights.length && <p className="py-3 text-[length:var(--type-small)] text-ink-faint">{loading ? "Scanning for aircraft…" : "No aircraft right now."}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
            </div>
            <ConditionsPanel nowTs={nowTs} weather={airport.weather} landing={airport.landing} takeoff={airport.takeoff} />
          </div>
          <div className="flex min-w-0 flex-col gap-6">
            <div>
              <FunFactsSpot selected={selected} featured={arriving ?? departing ?? live[0] ?? null} onClear={clearSelection} />
            </div>
            <section className="panel p-5" aria-labelledby="learning-preview-title">
              <h2 id="learning-preview-title" className="type-heading text-[length:var(--type-1)] text-ink">Curious about what you’re seeing?</h2>
              <p className="mt-2 text-[length:var(--type-small)] leading-relaxed text-ink-dim">
                Explore flight codes, aircraft and aviation terms—with examples from the plane in your spotlight.
              </p>
              <button type="button" onClick={openLearning} className="mt-3 text-[length:var(--type-0)] font-medium text-accent-ink underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-accent-ink">
                Explore the learning centre <span aria-hidden="true">→</span>
              </button>
            </section>
          </div>
        </div>
      )}
      </div>

      <div id="learning-panel" role="tabpanel" aria-labelledby="learning-tab" tabIndex={0} hidden={activeTab !== "learning"} className="mx-auto w-full max-w-4xl min-w-0">
        <LearningCentre flight={focus} />
      </div>

      <footer className="order-2 mt-auto flex flex-col items-center gap-1.5 border-t border-line pt-6 text-center text-[length:var(--type-0)] tracking-normal text-ink-faint">
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
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
          <span>Built by Jesse Little</span>
          <a
            href="mailto:info@studiolittle.ca"
            className="text-ink-dim transition-colors hover:text-accent-ink"
          >
            info@studiolittle.ca
          </a>
        </div>
        <div className="mt-2 self-end">
          <ViewerCount active={activeTab === "dashboard"} />
        </div>
      </footer>
    </main>
  );
}
