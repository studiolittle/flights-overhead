"use client";

import type { ReactNode } from "react";
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

/** A section title bar, the same on every section of the page. */
function SectionHeader({ title, aside }: { title: string; aside?: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3">
      <span className="text-[15px] tracking-[0.28em] text-ink">{title}</span>
      {aside && (
        <span className="text-[11.5px] tracking-[0.2em] text-ink-faint">
          {aside}
        </span>
      )}
    </div>
  );
}

/**
 * The YOW Radar section: every YOW flight within 50 km of the airport, with
 * the colour key. Tapping a plane opens it in Fun Facts.
 */
export function RadarPanel({
  contacts,
  selectedId,
  onSelect,
  wind,
  landing,
  takeoff,
}: {
  /** Every YOW flight in the feed; the scope keeps the ones in its view. */
  contacts: Contact[];
  /** The flight tapped on the radar, drawn highlighted. */
  selectedId: string | null;
  onSelect: (icao24: string) => void;
  wind: Wind | null;
  landing: RunwayCall;
  takeoff: RunwayCall;
}) {
  return (
    <section className="panel flex flex-col">
      <SectionHeader
        title={`${HOME_AIRPORT.iata} RADAR`}
        aside="TAP A PLANE FOR FUN FACTS"
      />

      <div className="flex flex-col gap-4 p-4 md:p-5">
        <div className="mx-auto w-full max-w-[420px]">
          <AirportScope
            contacts={contacts}
            selectedId={selectedId}
            onSelect={onSelect}
            landing={landing.ident}
            takeoff={takeoff.ident}
            wind={wind}
            zoomKm={RADAR_KM}
          />
        </div>
        <Legend />
      </div>
    </section>
  );
}

/**
 * The Airport Conditions section: the runways in use, wind, weather, local
 * time and the raw METAR, in one tidy left-aligned list. The weather and the
 * runway calls come from `useAirportConditions`.
 */
export function ConditionsPanel({
  nowTs,
  weather,
  weatherError,
  landing,
  takeoff,
}: {
  nowTs: number;
  weather: WeatherResponse | null;
  weatherError: string | null;
  landing: RunwayCall;
  takeoff: RunwayCall;
}) {
  const wind = weather?.wind ?? null;

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
      <SectionHeader
        title="AIRPORT CONDITIONS"
        aside={observed ? `METAR ${observed}` : "METAR --"}
      />
      <div className="px-5 py-4">
          <dl className="grid grid-cols-[max-content_minmax(0,1fr)] items-baseline gap-x-4 gap-y-2 text-[12.5px] leading-snug text-ink-dim">
            <InfoRow label="LANDING">
              <RunwayValue
                icon={<AirplaneLanding size={13} weight="bold" />}
                color={ARRIVAL_COLOR}
                call={landing}
                op="arrival"
              />
            </InfoRow>
            <InfoRow label="TAKING OFF">
              <RunwayValue
                icon={<AirplaneTakeoff size={13} weight="bold" />}
                color={DEPART_COLOR}
                call={takeoff}
                op="departure"
              />
            </InfoRow>
            <InfoRow label="WIND">
              {wind ? (
                <>
                  {windHeadline(wind)}
                  {wind.dirDeg != null && wind.speedKt > 0 && (
                    <span className="text-ink-faint">
                      {" "}
                      · from the {compass16(wind.dirDeg)}
                    </span>
                  )}
                </>
              ) : (
                <span className="text-ink-faint">
                  {weatherError
                    ? `Unavailable: ${weatherError}`
                    : "Loading the latest METAR"}
                </span>
              )}
            </InfoRow>
            {conditions && <InfoRow label="WEATHER">{conditions}</InfoRow>}
            <InfoRow label="LOCAL TIME">
              <LocalTime nowTs={nowTs} />
            </InfoRow>
            {weather?.raw && (
              <InfoRow label="METAR">
                <span className="break-words text-[11.5px] text-ink-faint">
                  {/* The row label already says METAR. */}
                  {weather.raw.replace(/^METAR\s+/, "")}
                  {weather.observedAt
                    ? ` · ${minutesAgo(nowTs - weather.observedAt)}`
                    : ""}
                </span>
              </InfoRow>
            )}
          </dl>
      </div>
    </section>
  );
}

/** One labelled row of the list under the radar. */
function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-[10.5px] tracking-[0.16em] text-ink-faint">
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
      <span style={{ color: call.ident ? color : "var(--color-ink-faint)" }}>
        {call.ident ? `RWY ${call.ident}` : "--"}
      </span>
      {where && <span className="text-ink-faint">{where}</span>}
    </span>
  );
}

/** Local time and date, for the list under the radar. */
function LocalTime({ nowTs }: { nowTs: number }) {
  const now = new Date(nowTs);
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
      <span className="status-dot" aria-hidden="true" />
      {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      <span className="text-ink-faint">
        {now.toLocaleDateString([], {
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
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[11.5px] tracking-[0.14em] text-ink-faint">
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
      {/* The sweep: a slow, faint beam going round so the radar reads as
          searching. Fitted inside the outer ring, and behind the aircraft
          (the svg is positioned and comes later), so blips stay on top and
          tappable. */}
      <div
        className="radar-sweep"
        style={{ inset: `${((C - R_MAX) / SIZE) * 100}%` }}
        aria-hidden="true"
      />
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="relative block h-full w-full"
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
