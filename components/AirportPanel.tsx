"use client";

import { useEffect, useId, useRef, useState, type MouseEvent, type ReactNode } from "react";
import {
  AirplaneLanding,
  AirplaneTakeoff,
  ArrowUp,
} from "@phosphor-icons/react/dist/ssr";
import { HOME_AIRPORT } from "@/lib/config";
import { compass16 } from "@/lib/format";
import { bearingDeg, haversineKm } from "@/lib/geo";
import type { Contact, RunwayEnd, WeatherResponse, Wind } from "@/lib/types";
import {
  Blip,
  C,
  PHASE_COLOR,
  R_MAX,
  SIZE,
  ScopeFrame,
  ScopeWidthContext,
  polar,
  useScopeUnits,
} from "./ScopeParts";
import { SectionHeader } from "./SectionHeader";
import { minutesAgo, type RunwayCall } from "./useAirportConditions";

/**
 * Runways and wind sit back so the aircraft stand out, but stay solid enough
 * to read which runway is in use.
 */
const MAP_OPACITY = 0.7;

const ARRIVAL_COLOR = PHASE_COLOR.arriving;
const DEPART_COLOR = PHASE_COLOR.departing;

/** The radar's reach: km from the airport to the outer ring. */
const RADAR_KM = 50;

/**
 * Runways are drawn the size they would be in a 12 km view, so they stay
 * readable at the radar's 50 km reach. Not to scale: at true size they
 * would be specks.
 */
const RUNWAY_VIEW_KM = 12;

/** One turn of the radar sweep, ms. The beam's CSS duration is set from it. */
const SWEEP_MS = 6000;

/**
 * An aircraft missing from the feed for longer than this is forgotten, and
 * waits for the sweep again when it comes back. Shorter gaps are just the
 * feed dropping a poll, and the plane stays on.
 */
const FORGET_MS = 120_000;

/** How long a newly detected aircraft shows its detection ping, ms. */
const PING_MS = 1500;

/**
 * The next moment at or after `from` that the sweep's leading edge points at
 * `bearing`. The beam turns on a shared clock (Date.now() modulo SWEEP_MS,
 * north at the top of each turn), so this is exact.
 */
function nextPass(from: number, bearing: number): number {
  const turnStart = from - (from % SWEEP_MS);
  let t = turnStart + (bearing / 360) * SWEEP_MS;
  if (t < from) t += SWEEP_MS;
  return t;
}

/**
 * Radar-style detection. Aircraft already on the scope when the page loads
 * show straight away; one that turns up later stays hidden until the sweep's
 * leading edge passes its bearing, then appears with a detection ping.
 */
function useSweepReveal(
  items: { id: string; bearing: number }[],
  ready: boolean,
) {
  const known = useRef(
    new Map<string, { revealAt: number; fresh: boolean; lastSeen: number }>(),
  );
  const primed = useRef(false);
  const [reduce] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  // Starts the CSS beam part-way through its turn, so it sits on the same
  // clock as nextPass().
  const [delayMs] = useState(() => -(Date.now() % SWEEP_MS));
  const [, rerender] = useState(0);

  const now = Date.now();
  for (const { id, bearing } of items) {
    let k = known.current.get(id);
    if (!k) {
      // The first snapshot is "already detected". With reduced motion there
      // is no beam to wait for.
      const instant = !primed.current || reduce;
      k = {
        revealAt: instant ? 0 : nextPass(now, bearing),
        fresh: !instant,
        lastSeen: now,
      };
      known.current.set(id, k);
    }
    k.lastSeen = now;
  }
  if (ready) primed.current = true;
  for (const [id, k] of known.current) {
    if (now - k.lastSeen > FORGET_MS) known.current.delete(id);
  }

  // Wake up exactly when the beam reaches the next hidden aircraft.
  useEffect(() => {
    const t = Date.now();
    let next = Infinity;
    for (const { id } of items) {
      const k = known.current.get(id);
      if (k && k.revealAt > t) next = Math.min(next, k.revealAt);
    }
    if (next === Infinity) return;
    const timer = setTimeout(() => rerender((n) => n + 1), next - t + 20);
    return () => clearTimeout(timer);
  });

  return {
    delayMs,
    isRevealed: (id: string) => (known.current.get(id)?.revealAt ?? 0) <= now,
    isFresh: (id: string) => {
      const k = known.current.get(id);
      return !!k?.fresh && now - k.revealAt < PING_MS;
    },
  };
}

/**
 * The compass heading a runway is named for: its number with the dropped
 * zero put back ("32" -> 320). Null for anything unparseable.
 */
function runwayHeading(ident: string): number | null {
  const n = parseInt(ident, 10);
  return Number.isFinite(n) ? n * 10 : null;
}

/**
 * The YOW radar: every YOW flight within 50 km of the airport, drawn straight
 * onto the sky with no card around it. Tapping a plane opens it in the
 * spotlight.
 */
export function RadarPanel({
  contacts,
  ready,
  selectedId,
  onSelect,
  wind,
  landing,
  takeoff,
}: {
  /** Every YOW flight in the feed; the scope keeps the ones in its view. */
  contacts: Contact[];
  /** The first snapshot has arrived: what it holds counts as already detected. */
  ready: boolean;
  /** The flight tapped on the radar, drawn highlighted. */
  selectedId: string | null;
  onSelect: (icao24: string) => void;
  wind: Wind | null;
  landing: RunwayCall;
  takeoff: RunwayCall;
}) {
  const headingId = useId();
  const windFrom =
    wind && wind.dirDeg != null && wind.speedKt > 0 ? wind.dirDeg : null;
  return (
    <section
      aria-labelledby={headingId}
      className="flex min-w-0 flex-col items-center gap-3"
    >
      <h2 id={headingId} className="sr-only">
        {HOME_AIRPORT.iata} radar
      </h2>
      {/* Capped so the whole scope fits the window beside the header. */}
      <div className="relative w-full" style={{ maxWidth: "max(320px, min(780px, calc(100dvh - 15rem)))" }}>
        <AirportScope
          contacts={contacts}
          selectedId={selectedId}
          onSelect={onSelect}
          landing={landing.ident}
          takeoff={takeoff.ident}
          zoomKm={RADAR_KM}
          ready={ready}
        />
        {windFrom != null && (
          <p className="absolute left-0 top-0 flex items-center gap-1.5 text-[length:var(--type-0)] text-ink-dim">
            <ArrowUp
              size={18}
              weight="bold"
              aria-hidden="true"
              style={{ transform: `rotate(${windFrom + 180}deg)` }}
            />
            <span>
              Wind {wind!.speedKt} kt
              <span className="hidden sm:inline"> from the {compass16(windFrom)}</span>
            </span>
          </p>
        )}
      </div>
      <Legend />
    </section>
  );
}

/** Plain-language gloss for the aviation weather category. */
const CATEGORY_GLOSS: Record<string, string> = {
  VFR: "Good visibility",
  MVFR: "Reduced visibility",
  IFR: "Low visibility, flown on instruments",
  LIFR: "Very low visibility",
};

/**
 * The Airport Conditions section: the runways in use and weather. The
 * weather and the runway calls come from `useAirportConditions`.
 */
export function ConditionsPanel({
  nowTs,
  weather,
  landing,
  takeoff,
}: {
  nowTs: number;
  weather: WeatherResponse | null;
  landing: RunwayCall;
  takeoff: RunwayCall;
}) {
  const headingId = useId();

  const category = weather?.flightCategory ?? null;
  const readings = [
    weather?.tempC != null ? `${weather.tempC}°C` : null,
    weather?.visibilitySm ? `visibility ${weather.visibilitySm} mi` : null,
    weather?.altimeterHpa != null
      ? `${Math.round(weather.altimeterHpa)} hPa`
      : null,
  ].filter(Boolean);

  const sameRunway = landing.ident != null && landing.ident === takeoff.ident;

  return (
    <section aria-labelledby={headingId} className="panel flex flex-col">
      <SectionHeader
        id={headingId}
        title="Airport details"
        aside={weather?.observedAt ? `Weather · ${minutesAgo(nowTs - weather.observedAt)}` : "Weather unavailable"}
      />
      <div className="px-5 py-4">
        <dl className="grid grid-cols-[max-content_minmax(0,1fr)] items-baseline gap-x-4 gap-y-3 text-[length:var(--type-0)] leading-snug text-ink-dim">
          {sameRunway ? (
            <InfoRow label="Runway in use">
              <SharedRunway call={landing} takeoff={takeoff} />
            </InfoRow>
          ) : (
            <>
              <InfoRow label="Likely landing">
                <RunwayValue
                  icon={<AirplaneLanding size={13} weight="bold" />}
                  color={ARRIVAL_COLOR}
                  call={landing}
                  op="arrival"
                />
              </InfoRow>
              <InfoRow label="Likely departure">
                <RunwayValue
                  icon={<AirplaneTakeoff size={13} weight="bold" />}
                  color={DEPART_COLOR}
                  call={takeoff}
                  op="departure"
                />
              </InfoRow>
            </>
          )}
          {(readings.length > 0 || category) && (
            <InfoRow label="Weather">
              <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                {readings.length > 0 && <span>{readings.join(" · ")}</span>}
                {category && (
                  <span className="rounded-full bg-surface-2 px-2 py-1 text-ink-dim">
                    <span className="font-semibold text-ink">{category}</span>
                    {CATEGORY_GLOSS[category] ? ` · ${CATEGORY_GLOSS[category]}` : ""}
                  </span>
                )}
              </span>
            </InfoRow>
          )}
        </dl>
        <p className="mt-3 text-[length:var(--type-0)] text-ink-faint">Runways are inferred from aircraft activity or wind, not official tower instructions.</p>
      </div>
    </section>
  );
}

/** One labelled row of the list under the radar. */
function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-[length:var(--type-0)] tracking-normal text-ink-faint">
        {label}
      </dt>
      <dd className="min-w-0">{children}</dd>
    </>
  );
}

/** A runway in use: "RWY 32 in from the SE". */
function RunwayValue({
  icon,
  color,
  call,
  op,
}: {
  icon: ReactNode;
  color: string;
  call: RunwayCall;
  op: "arrival" | "departure";
}) {
  const h = call.ident ? runwayHeading(call.ident) : null;
  // Where to look from the ground: arrivals come in over the opposite end.
  const where =
    h == null
      ? null
      : op === "arrival"
        ? `in from the ${compass16(h + 180)}`
        : `out to the ${compass16(h)}`;
  return (
    <span className="flex flex-wrap items-center gap-x-1.5">
      <span style={{ color }}>{icon}</span>
      <span className="text-[length:var(--type-3)] font-semibold" style={{ color: call.ident ? color : "var(--color-ink-faint)" }}>
        {call.ident ? `RWY ${call.ident}` : "Undetermined"}
      </span>
      {where && <span className="text-ink-faint">{where}</span>}
      <span className="rounded-full bg-surface-2 px-2 py-1 text-[length:var(--type-0)] text-ink-dim">
        {call.source === "seen" ? "Observed activity" : call.source === "wind" ? "Wind estimate" : "Insufficient evidence"}
      </span>
    </span>
  );
}

/** One runway handling both arrivals and departures: "RWY 07", with where to look. */
function SharedRunway({ call, takeoff }: { call: RunwayCall; takeoff: RunwayCall }) {
  const h = call.ident ? runwayHeading(call.ident) : null;
  const sourceLabel = (src: RunwayCall["source"]) =>
    src === "seen" ? "Observed activity" : src === "wind" ? "Wind estimate" : "Insufficient evidence";
  const tag =
    call.source === takeoff.source
      ? sourceLabel(call.source)
      : "Activity and wind agree";
  return (
    <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
      <span style={{ color: ARRIVAL_COLOR }}><AirplaneLanding size={13} weight="bold" /></span>
      <span style={{ color: DEPART_COLOR }}><AirplaneTakeoff size={13} weight="bold" /></span>
      <span className="text-[length:var(--type-3)] font-semibold text-ink">RWY {call.ident}</span>
      {h != null && (
        <span className="text-ink-faint">
          arrivals in from the {compass16(h + 180)}, departures out to the {compass16(h)}
        </span>
      )}
      <span className="rounded-full bg-surface-2 px-2 py-1 text-[length:var(--type-0)] text-ink-dim">{tag}</span>
    </span>
  );
}

/** Airport-local time and date for the radar header. */
export function LocalTime({ nowTs }: { nowTs: number }) {
  if (!nowTs) return <span className="text-ink-dim">Ottawa time · —</span>;
  const now = new Date(nowTs);
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
      <span className="status-dot" aria-hidden="true" />
      <span>Ottawa · {now.toLocaleTimeString("en-CA", { timeZone: "America/Toronto", hour: "2-digit", minute: "2-digit" })}</span>
      <span className="text-ink-faint">
        {now.toLocaleDateString("en-CA", {
          timeZone: "America/Toronto",
          weekday: "short",
          month: "short",
          day: "numeric",
        })}
      </span>
    </span>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap justify-center gap-x-5 gap-y-1.5 text-[length:var(--type-0)] tracking-normal text-ink-dim">
      <span className="flex items-center gap-1.5">
        <span
          className="inline-block size-2 rounded-full"
          style={{ background: ARRIVAL_COLOR }}
        />
        Arriving
      </span>
      <span className="flex items-center gap-1.5">
        <span
          className="inline-block size-2 rounded-full"
          style={{ background: DEPART_COLOR }}
        />
        Departing
      </span>
    </div>
  );
}

/**
 * The airport from above: the runways (enlarged, see RUNWAY_VIEW_KM), the
 * wind, and every YOW flight within `zoomKm` as a radar blip.
 */
function AirportScope({
  contacts,
  selectedId,
  onSelect,
  landing,
  takeoff,
  zoomKm,
  ready,
}: {
  contacts: Contact[];
  selectedId: string | null;
  onSelect: (icao24: string) => void;
  landing: string | null;
  takeoff: string | null;
  zoomKm: number;
  ready: boolean;
}) {
  // The rendered width, so text can be set in real pixels (ScopeWidthContext).
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(460);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setWidth(el.getBoundingClientRect().width || 460);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const ap = HOME_AIRPORT;
  const scale = R_MAX / zoomKm;
  const runwayScale = R_MAX / RUNWAY_VIEW_KM;

  const toRunway = (lat: number, lon: number) =>
    polar(
      C,
      C,
      haversineKm(ap.lat, ap.lon, lat, lon) * runwayScale,
      bearingDeg(ap.lat, ap.lon, lat, lon),
    );

  const inView = contacts
    .map((c) => ({
      c,
      d: haversineKm(ap.lat, ap.lon, c.lat, c.lon),
      b: bearingDeg(ap.lat, ap.lon, c.lat, c.lon),
    }))
    .filter((x) => x.d <= zoomKm);
  // New aircraft wait for the beam; the ones already detected stay on.
  const sweep = useSweepReveal(
    inView.map((x) => ({ id: x.c.id, bearing: x.b })),
    ready,
  );
  const shown = inView.filter((x) => sweep.isRevealed(x.c.id));

  /**
   * When planes are nearly on top of each other their tap areas overlap and
   * the top one wins every tap. Pick the plane nearest the actual tap point
   * instead, so each of a close pair can be chosen.
   */
  const svg = useRef<SVGSVGElement>(null);
  const pick = (id: string, ev?: MouseEvent) => {
    const el = svg.current;
    if (!ev || !el) return onSelect(id);
    const r = el.getBoundingClientRect();
    const px = ((ev.clientX - r.left) * SIZE) / r.width;
    const py = ((ev.clientY - r.top) * SIZE) / r.height;
    let best = id;
    let bestD = Infinity;
    for (const { c, d, b } of shown) {
      const p = polar(C, C, d * scale, b);
      const dist = Math.hypot(p.x - px, p.y - py);
      if (dist < bestD) {
        bestD = dist;
        best = c.id;
      }
    }
    onSelect(best);
  };

  return (
    <ScopeWidthContext.Provider value={width}>
    <div ref={box} className="relative aspect-square w-full overflow-clip">
      {/* The sweep: a slow, faint beam going round so the radar reads as
          searching. Fitted inside the outer ring, and behind the aircraft
          (the svg is positioned and comes later), so blips stay on top and
          tappable. It is a rotating square, so the wrapper clips it: near
          45° its corners would reach past the panel and widen the page on
          phones. */}
      <div
        className="radar-sweep"
        style={{
          inset: `${((C - R_MAX) / SIZE) * 100}%`,
          animationDuration: `${SWEEP_MS}ms`,
          animationDelay: `${sweep.delayMs}ms`,
        }}
        aria-hidden="true"
      />
      <svg
        ref={svg}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="relative block h-full w-full"
        role="img"
        aria-label={`${ap.iata} airport, ${shown.length} aircraft within ${zoomKm} km${landing ? `, landing runway ${landing}` : ""}${takeoff ? `, departing runway ${takeoff}` : ""}`}
      >
        {/* A tint behind the rings keeps labels readable over the stars. */}
        <circle
          cx={C}
          cy={C}
          r={R_MAX}
          fill="var(--color-canvas)"
          fillOpacity={0.6}
        />
        <ScopeFrame rangeKm={zoomKm} crosshair={false} />

        <g opacity={MAP_OPACITY}>
          {ap.runways.map((rwy) => {
            const [a, b] = rwy.ends;
            const pa = toRunway(a.lat, a.lon);
            const pb = toRunway(b.lat, b.lon);
            const active = [landing, takeoff].some(
              (id) => id === a.ident || id === b.ident,
            );
            return (
              <g key={`${a.ident}/${b.ident}`}>
                <line
                  x1={pa.x}
                  y1={pa.y}
                  x2={pb.x}
                  y2={pb.y}
                  stroke={
                    active ? "var(--color-ink)" : "var(--color-ink-faint)"
                  }
                  strokeWidth={rwy.lengthFt >= 6000 ? 13 : 8}
                />
                {rwy.ends.map((end) => (
                  <RunwayLabel
                    key={end.ident}
                    end={end}
                    at={toRunway(end.lat, end.lon)}
                    color={
                      end.ident === landing
                        ? ARRIVAL_COLOR
                        : end.ident === takeoff
                          ? DEPART_COLOR
                          : "var(--color-ink-dim)"
                    }
                  />
                ))}
              </g>
            );
          })}
        </g>

        {shown.map(({ c, d, b }) => {
          const p = polar(C, C, d * scale, b);
          return (
            <Blip
              key={c.id}
              contact={c}
              x={p.x}
              y={p.y}
              distanceKm={d}
              color={PHASE_COLOR[c.phase]}
              selected={c.id === selectedId}
              pulse={false}
              fresh={sweep.isFresh(c.id)}
              onSelect={pick}
            />
          );
        })}
      </svg>
    </div>
    </ScopeWidthContext.Provider>
  );
}

/** Runway number, placed just off the threshold on the approach side. */
function RunwayLabel({
  end,
  at,
  color,
}: {
  end: RunwayEnd;
  at: { x: number; y: number };
  color: string;
}) {
  const u = useScopeUnits();
  const p = polar(at.x, at.y, u(16), end.headingDeg + 180);
  return (
    <text
      x={p.x}
      y={p.y}
      fill={color}
      fontSize={u(14)}
      fontWeight={600}
      textAnchor="middle"
      dominantBaseline="middle"
    >
      {end.ident}
    </text>
  );
}
