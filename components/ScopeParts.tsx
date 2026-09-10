"use client";

// Shared SVG pieces for the radar and the airport scope, so an aircraft looks
// the same on both.

import { flightLevel, metersToFt } from "@/lib/format";
import type { Contact, FlightPhase } from "@/lib/types";

export const SIZE = 1000;
export const C = SIZE / 2;
export const R_MAX = 442;
const RINGS = [0.25, 0.5, 0.75, 1] as const;

/** Rings, ticks and labels sit back so the aircraft carry the scope. */
const FRAME_OPACITY = 0.5;

/**
 * Top-down airliner silhouette, nose up (north), ~42 units wingtip to
 * wingtip. Rotated to the aircraft's track, so it shows heading on its own.
 */
const PLANE_PATH =
  "M 0 -22 C 2.2 -22 3 -19 3 -16 L 3 -6 L 21 4 L 21 8 L 3 3 L 3 13 L 9 18 L 9 21 L 0 19 L -9 21 L -9 18 L -3 13 L -3 3 L -21 8 L -21 4 L -3 -6 L -3 -16 C -3 -19 -2.2 -22 0 -22 Z";

/**
 * A stroke in the panel colour painted under the fill: lifts planes and their
 * labels off whatever ring or runway they happen to cross.
 */
const HALO = {
  stroke: "var(--color-surface)",
  strokeLinejoin: "round",
  paintOrder: "stroke",
} as const;

export const PHASE_COLOR: Record<FlightPhase, string> = {
  arriving: "var(--color-accent-ink)",
  departing: "var(--color-depart)",
  overflight: "var(--color-ink-dim)",
  unknown: "var(--color-ink-dim)",
};

/** Polar to cartesian, bearing 0 = up, clockwise. */
export function polar(cx: number, cy: number, radius: number, deg: number) {
  const t = ((deg - 90) * Math.PI) / 180;
  return { x: cx + radius * Math.cos(t), y: cy + radius * Math.sin(t) };
}

/** Range rings, bearing ticks, N/E/S/W and (optionally) the crosshair. */
export function ScopeFrame({
  rangeKm,
  crosshair = true,
}: {
  rangeKm: number;
  crosshair?: boolean;
}) {
  return (
    <g opacity={FRAME_OPACITY}>
      {RINGS.map((f) => (
        <g key={f}>
          <circle
            cx={C}
            cy={C}
            r={R_MAX * f}
            fill="none"
            stroke="var(--color-grid)"
            strokeWidth={1.5}
          />
          <text
            x={C + 7}
            y={C - R_MAX * f + 22}
            fill="var(--color-ink-faint)"
            fontSize={24}
          >
            {Math.round(rangeKm * f)}
            {f === 1 ? " KM" : ""}
          </text>
        </g>
      ))}

      {Array.from({ length: 12 }).map((_, i) => {
        const deg = i * 30;
        const outer = polar(C, C, R_MAX, deg);
        const inner = polar(C, C, R_MAX - (deg % 90 === 0 ? 24 : 12), deg);
        return (
          <line
            key={deg}
            x1={inner.x}
            y1={inner.y}
            x2={outer.x}
            y2={outer.y}
            stroke="var(--color-line-strong)"
            strokeWidth={1.5}
          />
        );
      })}
      {([["N", 0], ["E", 90], ["S", 180], ["W", 270]] as const).map(
        ([label, deg]) => {
          const p = polar(C, C, R_MAX - 46, deg);
          return (
            <text
              key={label}
              x={p.x}
              y={p.y}
              fill="var(--color-ink-dim)"
              fontSize={27}
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {label}
            </text>
          );
        },
      )}

      {crosshair && (
        <>
          <line
            x1={C - R_MAX}
            y1={C}
            x2={C + R_MAX}
            y2={C}
            stroke="var(--color-grid)"
            strokeWidth={1}
          />
          <line
            x1={C}
            y1={C - R_MAX}
            x2={C}
            y2={C + R_MAX}
            stroke="var(--color-grid)"
            strokeWidth={1}
          />
        </>
      )}
    </g>
  );
}

/** One aircraft: silhouette pointing along its track, callsign, altitude. */
export function Blip({
  contact: c,
  x,
  y,
  distanceKm,
  color,
  selected,
  pulse,
  onSelect,
}: {
  contact: Contact;
  x: number;
  y: number;
  /** From the centre of whichever scope this is drawn on. */
  distanceKm: number;
  color: string;
  selected: boolean;
  pulse: boolean;
  onSelect: (icao24: string) => void;
}) {
  const track = c.trackDeg ?? 0;
  const altFt = metersToFt(c.baroAltitudeM);

  return (
    <g
      className="blip cursor-pointer"
      style={{ transform: `translate(${x}px, ${y}px)` }}
      onClick={() => onSelect(c.id)}
      role="button"
      tabIndex={0}
      aria-label={`${c.callsign}, ${flightLevel(c.baroAltitudeM)}, ${distanceKm.toFixed(1)} kilometres`}
      onKeyDown={(ev) => {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          onSelect(c.id);
        }
      }}
    >
      {/* generous invisible hit target */}
      <circle cx={0} cy={0} r={40} fill="transparent" />

      {pulse && (
        <circle
          className="pulse-ring"
          cx={0}
          cy={0}
          r={34}
          fill="none"
          stroke="var(--color-alert)"
          strokeWidth={2.5}
        />
      )}
      {selected && (
        <circle
          cx={0}
          cy={0}
          r={38}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeDasharray="4 4"
        />
      )}

      <g className="blip-body">
        <path
          d={PLANE_PATH}
          transform={`rotate(${track}) scale(${selected ? 1.35 : 1.2})`}
          fill={color}
          strokeWidth={2.5}
          style={HALO}
        />
        <text
          x={34}
          y={-8}
          fill={color}
          fontSize={32}
          fontWeight={600}
          strokeWidth={7}
          style={{ ...HALO, letterSpacing: "0.5px" }}
        >
          {c.callsign}
        </text>
        <text
          x={34}
          y={22}
          fill="var(--color-ink-dim)"
          fontSize={24}
          strokeWidth={6}
          style={HALO}
        >
          {altFt != null ? flightLevel(c.baroAltitudeM) : "--"}
        </text>
      </g>
    </g>
  );
}
