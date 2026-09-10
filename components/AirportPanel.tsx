"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  AirplaneLanding,
  AirplaneTakeoff,
  Wind as WindIcon,
} from "@phosphor-icons/react/dist/ssr";
import {
  favouredRunway,
  findEnd,
  oppositeEnd,
  runwayInUse,
  type RunwayOp,
  type RunwayWind,
} from "@/lib/airport";
import { AIRPORT_VIEW_KM, HOME_AIRPORT } from "@/lib/config";
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

/** METARs are hourly, so there is no point asking more often. */
const WEATHER_POLL_MS = 5 * 60 * 1000;

/** A runway seen in use stays the answer this long after the last sighting. */
const SIGHTING_TTL_MS = 20 * 60 * 1000;

/** How far the approach and climb-out paths are drawn from the runway, km. */
const PATH_KM = 9;

/**
 * Runways, paths and wind sit back so the aircraft stand out, but stay solid
 * enough to read which runway is in use.
 */
const MAP_OPACITY = 0.7;

const ARRIVAL_COLOR = PHASE_COLOR.arriving;
const DEPART_COLOR = PHASE_COLOR.departing;

interface Sighting {
  ident: string;
  callsign: string;
  at: number;
}

/** The runway shown for one operation, and why. */
type RunwayCall =
  | { source: "seen"; ident: string; sighting: Sighting }
  | { source: "wind"; ident: string; wind: RunwayWind }
  | { source: "none"; ident: null };

function callRunway(
  sighting: Sighting | null,
  favoured: RunwayWind | null,
): RunwayCall {
  if (sighting) return { source: "seen", ident: sighting.ident, sighting };
  if (favoured) return { source: "wind", ident: favoured.ident, wind: favoured };
  return { source: "none", ident: null };
}

function minutesAgo(ms: number): string {
  const m = Math.round(ms / 60_000);
  return m < 1 ? "just now" : `${m} min ago`;
}

function windHeadline(w: Wind): string {
  if (w.speedKt === 0) return "Calm";
  const dir =
    w.dirDeg == null
      ? "Variable"
      : `${String(Math.round(w.dirDeg)).padStart(3, "0")}°`;
  const gust = w.gustKt ? `, gusts ${w.gustKt}` : "";
  return `${dir} at ${w.speedKt} kt${gust}`;
}

export function AirportPanel({
  contacts,
  station,
  selectedId,
  onSelect,
  nowTs,
}: {
  /** Every YOW flight in the feed; the scope keeps the ones in its view. */
  contacts: Contact[];
  station: { lat: number; lon: number };
  selectedId: string | null;
  onSelect: (icao24: string) => void;
  nowTs: number;
}) {
  const [weather, setWeather] = useState<WeatherResponse | null>(null);
  const [weatherError, setWeatherError] = useState<string | null>(null);
  const [seen, setSeen] = useState<Record<RunwayOp, Sighting | null>>({
    arrival: null,
    departure: null,
  });

  useEffect(() => {
    const ac = new AbortController();
    const load = () =>
      fetch("/api/weather", { signal: ac.signal, cache: "no-store" })
        .then((r) =>
          r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)),
        )
        .then((json: WeatherResponse) => {
          setWeather(json);
          setWeatherError(json.error);
        })
        .catch((err) => {
          if ((err as Error).name === "AbortError") return;
          setWeatherError((err as Error).message || "Weather lookup failed");
        });

    load();
    const poll = setInterval(load, WEATHER_POLL_MS);
    return () => {
      clearInterval(poll);
      ac.abort();
    };
  }, []);

  // Remember the last aircraft seen using each runway, so the answer holds in
  // the gaps between movements.
  useEffect(() => {
    const hits = contacts.flatMap((c) => {
      const hit = runwayInUse(c, HOME_AIRPORT);
      return hit ? [{ ...hit, callsign: c.callsign }] : [];
    });
    if (hits.length === 0) return;
    const at = Date.now();
    setSeen((prev) => {
      const next = { ...prev };
      for (const h of hits) {
        next[h.op] = { ident: h.ident, callsign: h.callsign, at };
      }
      return next;
    });
  }, [contacts]);

  const wind = weather?.wind ?? null;
  const favoured = favouredRunway(wind, HOME_AIRPORT);
  const fresh = (s: Sighting | null) =>
    s && nowTs - s.at < SIGHTING_TTL_MS ? s : null;
  const landing = callRunway(fresh(seen.arrival), favoured);
  const takeoff = callRunway(fresh(seen.departure), favoured);

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

      <div className="grid gap-6 p-5 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="mx-auto w-full max-w-[560px]">
          <AirportScope
            contacts={contacts}
            station={station}
            selectedId={selectedId}
            onSelect={onSelect}
            landing={landing.ident}
            takeoff={takeoff.ident}
            wind={wind}
          />
          <Legend />
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <div>
            <p className="text-[11.5px] tracking-[0.18em] text-ink-faint">
              WIND
            </p>
            {wind ? (
              <>
                <p className="mt-2 flex items-center gap-2.5 text-[24px] leading-tight text-ink">
                  <WindIcon
                    size={22}
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

          <div className="grid grid-cols-2 gap-4 border-y border-line py-4">
            <RunwayStat
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
            <RunwayStat
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

          {conditions && (
            <p className="text-[13.5px] text-ink-dim">{conditions}</p>
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

function RunwayStat({
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
  op: RunwayOp;
  hasWind: boolean;
  nowTs: number;
}) {
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
        className="mt-2 text-[32px] leading-none"
        style={{ color: call.ident ? color : "var(--color-ink-faint)" }}
      >
        {call.ident ? `RWY ${call.ident}` : "--"}
      </p>
      <p className="mt-2 text-[12.5px] leading-snug text-ink-dim">{detail}</p>
    </div>
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
      <span className="flex items-center gap-1.5">
        <svg width="22" height="6" aria-hidden="true">
          <line
            x1="0"
            y1="3"
            x2="22"
            y2="3"
            stroke="currentColor"
            strokeWidth="2"
            strokeDasharray="4 3"
          />
        </svg>
        APPROACH / CLIMB-OUT
      </span>
    </div>
  );
}

/**
 * The airport from above: runways to scale, the paths aircraft fly in and out,
 * the wind, and every YOW flight nearby as a radar blip.
 */
function AirportScope({
  contacts,
  station,
  selectedId,
  onSelect,
  landing,
  takeoff,
  wind,
}: {
  contacts: Contact[];
  station: { lat: number; lon: number };
  selectedId: string | null;
  onSelect: (icao24: string) => void;
  landing: string | null;
  takeoff: string | null;
  wind: Wind | null;
}) {
  const ap = HOME_AIRPORT;
  const scale = R_MAX / AIRPORT_VIEW_KM;

  const toScope = (lat: number, lon: number) =>
    polar(
      C,
      C,
      haversineKm(ap.lat, ap.lon, lat, lon) * scale,
      bearingDeg(ap.lat, ap.lon, lat, lon),
    );

  const inView = contacts
    .map((c) => ({ c, d: haversineKm(ap.lat, ap.lon, c.lat, c.lon) }))
    .filter((x) => x.d <= AIRPORT_VIEW_KM);

  const homeKm = haversineKm(ap.lat, ap.lon, station.lat, station.lon);
  const homePt = homeKm <= AIRPORT_VIEW_KM * 0.95 ? toScope(station.lat, station.lon) : null;

  const landEnd = landing ? findEnd(ap, landing) : null;
  const takeoffEnd = takeoff ? findEnd(ap, takeoff) : null;
  // A departure lifts off near the far end and climbs out beyond it.
  const liftoffEnd = takeoff ? oppositeEnd(ap, takeoff) : null;

  const windArrow =
    wind && wind.dirDeg != null && wind.speedKt > 0 ? wind.dirDeg : null;

  return (
    <div className="relative aspect-square w-full">
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="block h-full w-full"
        role="img"
        aria-label={`${ap.iata} airport, ${inView.length} aircraft within ${AIRPORT_VIEW_KM} km${landing ? `, landing runway ${landing}` : ""}${takeoff ? `, departing runway ${takeoff}` : ""}`}
      >
        <ScopeFrame rangeKm={AIRPORT_VIEW_KM} crosshair={false} />

        <g opacity={MAP_OPACITY}>
          {landEnd && (
            <FlightPath
              from={toScope(landEnd.lat, landEnd.lon)}
              outboundDeg={landEnd.headingDeg + 180}
              flownDeg={landEnd.headingDeg}
              length={PATH_KM * scale}
              color={ARRIVAL_COLOR}
              inbound
            />
          )}
          {takeoffEnd && liftoffEnd && (
            <FlightPath
              from={toScope(liftoffEnd.lat, liftoffEnd.lon)}
              outboundDeg={takeoffEnd.headingDeg}
              flownDeg={takeoffEnd.headingDeg}
              length={PATH_KM * scale}
              color={DEPART_COLOR}
            />
          )}

          {ap.runways.map((rwy) => {
            const [a, b] = rwy.ends;
            const pa = toScope(a.lat, a.lon);
            const pb = toScope(b.lat, b.lon);
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
                    at={toScope(end.lat, end.lon)}
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

        {homePt && (
          <g>
            <circle
              cx={homePt.x}
              cy={homePt.y}
              r={9}
              fill="none"
              stroke="var(--color-accent-ink)"
              strokeWidth={2}
            />
            <circle
              cx={homePt.x}
              cy={homePt.y}
              r={2.5}
              fill="var(--color-accent-ink)"
            />
            <text
              x={homePt.x}
              y={homePt.y + 34}
              fill="var(--color-accent-ink)"
              fontSize={20}
              textAnchor="middle"
              style={{ letterSpacing: "2px" }}
            >
              HOME
            </text>
          </g>
        )}

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
 * A dashed path off the end of a runway with chevrons showing which way it is
 * flown: toward the runway for an approach, away from it for a climb-out.
 */
function FlightPath({
  from,
  outboundDeg,
  flownDeg,
  length,
  color,
  inbound = false,
}: {
  from: { x: number; y: number };
  outboundDeg: number;
  flownDeg: number;
  length: number;
  color: string;
  inbound?: boolean;
}) {
  const to = polar(from.x, from.y, length, outboundDeg);
  const chevrons = inbound ? [0.3, 0.55, 0.8] : [0.25, 0.5, 0.75];
  return (
    <g>
      <line
        x1={from.x}
        y1={from.y}
        x2={to.x}
        y2={to.y}
        stroke={color}
        strokeWidth={2.5}
        strokeDasharray="10 9"
        opacity={0.8}
      />
      {chevrons.map((f) => {
        const p = polar(from.x, from.y, length * f, outboundDeg);
        return (
          <path
            key={f}
            d="M -11 -9 L 0 0 L -11 9"
            transform={`translate(${p.x} ${p.y}) rotate(${flownDeg - 90})`}
            fill="none"
            stroke={color}
            strokeWidth={3}
          />
        );
      })}
    </g>
  );
}

/**
 * Wind inset in the scope's top-left corner, outside the rings, so it never
 * lands on a runway, a blip or the home marker (Ottawa's prevailing westerly
 * sits right on the house). The arrow points the way the wind blows.
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
