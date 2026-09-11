"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  AirplaneLanding,
  AirplaneTakeoff,
  BeerStein,
  Wind as WindIcon,
} from "@phosphor-icons/react/dist/ssr";
import { HOME_AIRPORT } from "@/lib/config";
import { compass16, compassWord } from "@/lib/format";
import { bearingDeg, haversineKm } from "@/lib/geo";
import type { Contact, RunwayEnd, WeatherResponse, Wind } from "@/lib/types";
import { LearnMore } from "./Explainer";
import {
  Blip,
  C,
  PHASE_COLOR,
  R_MAX,
  SIZE,
  ScopeFrame,
  polar,
} from "./ScopeParts";
import { minutesAgo, type RunwayCall } from "./useAirportConditions";

/**
 * Runways and wind sit back so the aircraft stand out, but stay solid enough
 * to read which runway is in use.
 */
const MAP_OPACITY = 0.7;

const ARRIVAL_COLOR = PHASE_COLOR.arriving;
const DEPART_COLOR = PHASE_COLOR.departing;

/** knots -> km/h */
const KT_TO_KMH = 1.852;

/** The radar's zoom levels, km from the airport to the outer ring. */
const ZOOMS = [25, 50] as const;
type Zoom = (typeof ZOOMS)[number];
const KEY_ZOOM = "fo.zoom";

/**
 * Runways are drawn the size they would be in a 12 km view, so they stay
 * readable at either zoom. Not to scale: at true size they would be specks.
 */
const RUNWAY_VIEW_KM = 12;

function windHeadline(w: Wind): string {
  if (w.speedKt === 0) return "Calm";
  const dir =
    w.dirDeg == null
      ? "Variable"
      : `${String(Math.round(w.dirDeg)).padStart(3, "0")}°`;
  const gust = w.gustKt ? `, gusts ${w.gustKt}` : "";
  return `${dir} at ${w.speedKt} kt${gust}`;
}

/**
 * The compass heading a runway is named for: its number with the dropped
 * zero put back ("32" -> 320). Null for anything unparseable.
 */
function runwayHeading(ident: string): number | null {
  const n = parseInt(ident, 10);
  return Number.isFinite(n) ? n * 10 : null;
}

/** Why these runways: the wind, in plain language. */
function whyText(wind: Wind | null): string {
  if (!wind) return "Waiting for the latest airport weather.";
  if (wind.speedKt === 0 || wind.dirDeg == null) {
    return "The wind is light or shifting, so controllers can use either direction.";
  }
  const kmh = Math.round(wind.speedKt * KT_TO_KMH);
  return `Planes land and take off into the wind for extra lift, and right now it's blowing from the ${compassWord(wind.dirDeg)} at ${wind.speedKt} kt (about ${kmh} km/h).`;
}

/**
 * The airport at a glance, first thing on the page: the radar with the
 * runways in use and every YOW flight nearby, the local time, which way
 * planes are landing and taking off, why the wind decides it, and the latest
 * weather report. The weather and the runway calls come from
 * `useAirportConditions`.
 */
export function AirportPanel({
  contacts,
  selectedId,
  onSelect,
  nowTs,
  weather,
  weatherError,
  landing,
  takeoff,
}: {
  /** Every YOW flight in the feed; the scope keeps the ones in its view. */
  contacts: Contact[];
  selectedId: string | null;
  onSelect: (icao24: string) => void;
  nowTs: number;
  weather: WeatherResponse | null;
  weatherError: string | null;
  landing: RunwayCall;
  takeoff: RunwayCall;
}) {
  const wind = weather?.wind ?? null;

  const [zoomKm, setZoomKm] = useState<Zoom>(50);
  useEffect(() => {
    try {
      const stored = Number(window.localStorage.getItem(KEY_ZOOM));
      if (stored === 25 || stored === 50) setZoomKm(stored);
    } catch {
      // Blocked storage: start at the default zoom.
    }
  }, []);
  const zoom = (km: Zoom) => {
    setZoomKm(km);
    try {
      window.localStorage.setItem(KEY_ZOOM, String(km));
    } catch {
      // Blocked storage: the zoom just does not persist.
    }
  };

  const observed = weather?.observedAt
    ? new Date(weather.observedAt).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

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
    <section className="panel flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3">
        <span className="text-[15px] tracking-[0.28em] text-ink">
          {HOME_AIRPORT.iata} AIRPORT
        </span>
        <span className="text-[11.5px] tracking-[0.2em] text-ink-faint">
          {observed ? `METAR ${observed}` : "METAR --"}
        </span>
      </div>

      {/* The radar, with the runways in use and the weather under it. */}
      <div className="flex flex-col gap-5 p-5">
        <div className="mx-auto w-full max-w-[420px]">
          <div className="relative">
            <AirportScope
              contacts={contacts}
              selectedId={selectedId}
              onSelect={onSelect}
              landing={landing.ident}
              takeoff={takeoff.ident}
              wind={wind}
              zoomKm={zoomKm}
            />
            <ZoomControl value={zoomKm} onChange={zoom} />
          </div>
          <Legend />
          <LocalTime nowTs={nowTs} />
        </div>

        <div className="flex min-w-0 flex-col gap-5 border-t border-line pt-5">
          <div>
            <p className="text-[11.5px] tracking-[0.18em] text-ink-faint">
              RUNWAYS IN USE
            </p>
            <div className="mt-3 grid grid-cols-2 gap-5">
              <RunwayCard
                label="LANDING"
                icon={
                  <AirplaneLanding
                    size={14}
                    weight="bold"
                    style={{ color: ARRIVAL_COLOR }}
                  />
                }
                color={ARRIVAL_COLOR}
                call={landing}
                op="arrival"
                hasWind={wind != null}
                nowTs={nowTs}
              />
              <RunwayCard
                label="TAKING OFF"
                icon={
                  <AirplaneTakeoff
                    size={14}
                    weight="bold"
                    style={{ color: DEPART_COLOR }}
                  />
                }
                color={DEPART_COLOR}
                call={takeoff}
                op="departure"
                hasWind={wind != null}
                nowTs={nowTs}
              />
            </div>
          </div>

          <div className="border-t border-line pt-3.5 text-[13px] leading-relaxed text-ink-dim">
            {whyText(wind)}
            <LearnMore>
              Runways are named for the compass direction they point, with the
              last digit dropped: <strong>Runway 32</strong> points at 320°. The
              same strip of pavement is Runway 14 from the other end, because
              140° is the opposite way. Ottawa has three runways, so six numbers
              in all.
            </LearnMore>
          </div>

          <div className="border-t border-line pt-4">
            <p className="text-[11.5px] tracking-[0.18em] text-ink-faint">
              WIND
            </p>
            {wind ? (
              <>
                <p className="mt-2 flex items-center gap-2.5 text-[20px] leading-tight text-ink">
                  <WindIcon
                    size={20}
                    weight="bold"
                    className="shrink-0 text-accent-ink"
                  />
                  {windHeadline(wind)}
                </p>
                <p className="mt-1.5 text-[13.5px] text-ink-dim">
                  {[
                    wind.dirDeg != null && wind.speedKt > 0
                      ? `From the ${compass16(wind.dirDeg)}`
                      : null,
                    weather?.observedAt
                      ? `reported ${minutesAgo(nowTs - weather.observedAt)}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(", ")}
                </p>
              </>
            ) : (
              <p className="mt-2 text-[13.5px] text-ink-dim">
                {weatherError
                  ? `Weather unavailable: ${weatherError}`
                  : "Loading the latest METAR"}
              </p>
            )}
          </div>

          {conditions && (
            <p className="border-t border-line pt-4 text-[13.5px] text-ink-dim">
              {conditions}
            </p>
          )}
          {weather?.raw && (
            <p className="break-words text-[12px] leading-relaxed text-ink-faint">
              {weather.raw}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function RunwayCard({
  label,
  icon,
  color,
  call,
  op,
  hasWind,
  nowTs,
}: {
  label: string;
  icon: ReactNode;
  color: string;
  call: RunwayCall;
  op: "arrival" | "departure";
  hasWind: boolean;
  nowTs: number;
}) {
  const heading = call.ident ? runwayHeading(call.ident) : null;

  // Where to look from the ground: arrivals come in over the opposite end.
  const direction =
    heading == null
      ? null
      : op === "arrival"
        ? `Coming in from the ${compassWord(heading + 180)}, pointed ${compassWord(heading)} (${heading}°).`
        : `Rolling ${compassWord(heading)} (${heading}°) and climbing out that way.`;

  const detail =
    call.source === "seen"
      ? `${call.sighting.callsign} ${op === "arrival" ? "on final" : "climbing out"}, ${minutesAgo(nowTs - call.sighting.at)}`
      : call.source === "wind"
        ? `Into the wind: ${Math.round(call.wind.headwindKt)} kt headwind, ${Math.round(call.wind.crosswindKt)} kt crosswind`
        : hasWind
          ? "Light wind, so either direction"
          : "Waiting for the weather";

  return (
    <div className="min-w-0">
      <span className="flex items-center gap-1.5 text-[11.5px] tracking-[0.18em] text-ink-faint">
        {icon}
        {label}
      </span>
      <p
        className="mt-2 whitespace-nowrap text-[24px] leading-none"
        style={{ color: call.ident ? color : "var(--color-ink-faint)" }}
      >
        {call.ident ? `RWY ${call.ident}` : "--"}
      </p>
      {direction && (
        <p className="mt-2.5 text-[14px] leading-snug text-ink">{direction}</p>
      )}
      <p className="mt-1.5 text-[12.5px] leading-snug text-ink-dim">{detail}</p>
    </div>
  );
}

/** 25 or 50 km, in the scope's top-right corner, outside the rings. */
function ZoomControl({
  value,
  onChange,
}: {
  value: Zoom;
  onChange: (km: Zoom) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Radar zoom"
      className="absolute right-0 top-0 flex items-center gap-1"
    >
      {ZOOMS.map((km) => (
        <button
          key={km}
          type="button"
          onClick={() => onChange(km)}
          aria-pressed={value === km}
          className={`chip ${value === km ? "chip-on" : ""}`}
        >
          {km}
        </button>
      ))}
      <span className="ml-0.5 text-[11px] tracking-[0.14em] text-ink-faint">
        KM
      </span>
    </div>
  );
}

/** Local time and date under the radar. */
function LocalTime({ nowTs }: { nowTs: number }) {
  const now = new Date(nowTs);
  return (
    <p className="mt-3 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[12.5px] text-ink-dim">
      <span className="status-dot" aria-hidden="true" />
      {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      <span className="text-ink-faint">
        {now.toLocaleDateString([], {
          weekday: "short",
          month: "short",
          day: "numeric",
        })}
      </span>
      <span className="flex items-center gap-1 text-ink-faint">
        <BeerStein size={13} weight="bold" className="text-accent-ink" />
        It&apos;s 5 o&apos;clock somewhere
      </span>
    </p>
  );
}

function Legend() {
  return (
    <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1.5 text-[11.5px] tracking-[0.14em] text-ink-faint">
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
 * wind, and every YOW flight within the zoom as a radar blip.
 */
function AirportScope({
  contacts,
  selectedId,
  onSelect,
  landing,
  takeoff,
  wind,
  zoomKm,
}: {
  contacts: Contact[];
  selectedId: string | null;
  onSelect: (icao24: string) => void;
  landing: string | null;
  takeoff: string | null;
  wind: Wind | null;
  zoomKm: number;
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
    .map((c) => ({ c, d: haversineKm(ap.lat, ap.lon, c.lat, c.lon) }))
    .filter((x) => x.d <= zoomKm);

  const windArrow =
    wind && wind.dirDeg != null && wind.speedKt > 0 ? wind.dirDeg : null;

  return (
    <div className="relative aspect-square w-full">
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="block h-full w-full"
        role="img"
        aria-label={`${ap.iata} airport, ${inView.length} aircraft within ${zoomKm} km${landing ? `, landing runway ${landing}` : ""}${takeoff ? `, departing runway ${takeoff}` : ""}`}
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

        {inView.map(({ c, d }) => {
          const p = polar(C, C, d * scale, bearingDeg(ap.lat, ap.lon, c.lat, c.lon));
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
      fontSize={23}
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
        fontSize={21}
        textAnchor="middle"
        style={{ letterSpacing: "2px" }}
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
        fontSize={22}
        textAnchor="middle"
        style={{ letterSpacing: "1px" }}
      >
        {speedKt} KT
      </text>
    </g>
  );
}
