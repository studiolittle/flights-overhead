"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  AirplaneLanding,
  AirplaneTakeoff,
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
  polar,
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
 * The YOW Radar section: every YOW flight within 50 km of the airport, with
 * the colour key. Tapping a plane opens it in Fun Facts.
 */
export function RadarPanel({
  contacts,
  ready,
  selectedId,
  onSelect,
  wind,
  landing,
  takeoff,
  embedded = false,
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
  embedded?: boolean;
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className={embedded ? "flex min-w-0 flex-col" : "panel flex min-w-0 flex-col"}>
      <SectionHeader
        id={headingId}
        title={`${HOME_AIRPORT.iata} radar`}
        aside="Select an aircraft to explore"
      />

      <div className="flex flex-col gap-4 p-4 md:p-5">
        <div className="mx-auto w-full max-w-[460px] rounded-2xl border border-line bg-canvas p-2 sm:p-4">
          <AirportScope
            contacts={contacts}
            selectedId={selectedId}
            onSelect={onSelect}
            landing={landing.ident}
            takeoff={takeoff.ident}
            wind={wind}
            zoomKm={RADAR_KM}
            ready={ready}
          />
        </div>
        <Legend />
      </div>
    </section>
  );
}

/**
 * The Airport Conditions section: the runways in use and weather,
 * in one tidy left-aligned list. The weather and the
 * runway calls come from `useAirportConditions`.
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

  const conditions = [
    weather?.tempC != null ? `${weather.tempC}°C` : null,
    weather?.visibilitySm ? `Visibility ${weather.visibilitySm} SM` : null,
    weather?.altimeterHpa != null
      ? `${Math.round(weather.altimeterHpa)} hPa`
      : null,
    weather?.flightCategory,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <section aria-labelledby={headingId} className="panel flex flex-col">
      <SectionHeader
        id={headingId}
        title="Airport details"
        aside={weather?.observedAt ? `Weather · ${minutesAgo(nowTs - weather.observedAt)}` : "Weather unavailable"}
      />
      <div className="px-5 py-4">
          <dl className="grid grid-cols-[max-content_minmax(0,1fr)] items-baseline gap-x-4 gap-y-2 text-[length:var(--type-0)] leading-snug text-ink-dim">
            <InfoRow label="LIKELY LANDING">
              <RunwayValue
                icon={<AirplaneLanding size={13} weight="bold" />}
                color={ARRIVAL_COLOR}
                call={landing}
                op="arrival"
              />
            </InfoRow>
            <InfoRow label="LIKELY DEPARTURE">
              <RunwayValue
                icon={<AirplaneTakeoff size={13} weight="bold" />}
                color={DEPART_COLOR}
                call={takeoff}
                op="departure"
              />
            </InfoRow>
          </dl>
          <p className="mt-3 text-[length:var(--type-0)] text-ink-faint">Runway estimates are inferred from aircraft activity or wind, not official tower instructions.</p>
          <div className="mt-4 border-t border-line pt-3">
            <dl className="mt-3 grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-2 text-[length:var(--type-small)] text-ink-dim">
            {conditions && <InfoRow label="WEATHER">{conditions}</InfoRow>}
          </dl>
          </div>
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

/** Airport-local time and date for the site header. */
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
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[length:var(--type-0)] tracking-normal text-ink-faint">
      <span className="flex items-center gap-1.5">
        <span
          className="inline-block size-2 rounded-full"
          style={{ background: ARRIVAL_COLOR }}
        />
        ARRIVING
      </span>
      <span className="flex items-center gap-1.5">
        <span
          className="inline-block size-2 rounded-full"
          style={{ background: DEPART_COLOR }}
        />
        DEPARTING
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
  wind,
  zoomKm,
  ready,
}: {
  contacts: Contact[];
  selectedId: string | null;
  onSelect: (icao24: string) => void;
  landing: string | null;
  takeoff: string | null;
  wind: Wind | null;
  zoomKm: number;
  ready: boolean;
}) {
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

  const windArrow =
    wind && wind.dirDeg != null && wind.speedKt > 0 ? wind.dirDeg : null;

  return (
    <div className="relative aspect-square w-full overflow-clip">
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
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="relative block h-full w-full"
        role="img"
        aria-label={`${ap.iata} airport, ${shown.length} aircraft within ${zoomKm} km${landing ? `, landing runway ${landing}` : ""}${takeoff ? `, departing runway ${takeoff}` : ""}`}
      >
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

          {windArrow != null && (
            <WindInset fromDeg={windArrow} speedKt={wind!.speedKt} />
          )}
        </g>

        {shown.map(({ c, d, b }) => {
          const p = polar(C, C, d * scale, b);
          const overhead = c.overhead === true;
          return (
            <Blip
              key={c.id}
              contact={c}
              x={p.x}
              y={p.y}
              distanceKm={d}
              color={overhead ? "var(--color-alert)" : PHASE_COLOR[c.phase]}
              selected={c.id === selectedId}
              pulse={overhead}
              fresh={sweep.isFresh(c.id)}
              onSelect={onSelect}
            />
          );
        })}
      </svg>
    </div>
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
  const p = polar(at.x, at.y, 30, end.headingDeg + 180);
  return (
    <text
      x={p.x}
      y={p.y}
      fill={color}
      fontSize="var(--type-4)"
      textAnchor="middle"
      dominantBaseline="middle"
    >
      {end.ident}
    </text>
  );
}

/**
 * Wind inset in the scope's top-left corner, outside the rings, so it never
 * lands on a runway or a blip. The arrow points the way the wind blows.
 */
function WindInset({ fromDeg, speedKt }: { fromDeg: number; speedKt: number }) {
  const cx = 84;
  const cy = 104;
  const half = 40;
  const tail = polar(cx, cy, half, fromDeg);
  const tip = polar(cx, cy, half, fromDeg + 180);
  return (
    <g>
      <text
        x={cx}
        y={36}
        fill="var(--color-ink-dim)"
        fontSize="var(--type-3)"
        textAnchor="middle"
        style={{ letterSpacing: "0" }}
      >
        WIND
      </text>
      <circle
        cx={cx}
        cy={cy}
        r={half + 10}
        fill="none"
        stroke="var(--color-line-strong)"
        strokeWidth={1.5}
      />
      <line
        x1={tail.x}
        y1={tail.y}
        x2={tip.x}
        y2={tip.y}
        stroke="var(--color-ink)"
        strokeWidth={3}
      />
      <path
        d="M -16 -11 L 0 0 L -16 11 Z"
        transform={`translate(${tip.x} ${tip.y}) rotate(${fromDeg + 90})`}
        fill="var(--color-ink)"
      />
      <text
        x={cx}
        y={cy + half + 38}
        fill="var(--color-ink)"
        fontSize="var(--type-3)"
        textAnchor="middle"
        style={{ letterSpacing: "0" }}
      >
        {speedKt} KT
      </text>
    </g>
  );
}
