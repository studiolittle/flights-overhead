"use client";

// Shared SVG pieces for the radar and the airport scope, so an aircraft looks
// the same on both.

import { createContext, useContext, type MouseEvent } from "react";
import { aircraftShape, flightTitle, type AircraftShape } from "@/lib/aircraft";
import { flightLevel, metersToFt } from "@/lib/format";
import type { Contact, FlightPhase } from "@/lib/types";

export const SIZE = 1000;

/**
 * The scope is a 1000-unit viewBox drawn at whatever width the page gives it,
 * so a fixed unit size means text that shrinks with the screen. The scope
 * measures its rendered width and shares it here, so labels are set in real
 * pixels and never fall below a readable size.
 */
export const ScopeWidthContext = createContext(460);

/** Pixels to viewBox units at the scope's current rendered width. */
export function useScopeUnits() {
  const width = useContext(ScopeWidthContext);
  return (px: number) => (px * SIZE) / Math.max(width, 200);
}

/** Past this fraction of the width, a blip's label flips to its left. */
const FLIP_AFTER = 0.6;
export const C = SIZE / 2;
export const R_MAX = 442;
const RINGS = [0.25, 0.5, 0.75, 1] as const;

/** Rings, ticks and labels sit back so the aircraft carry the scope. */
const FRAME_OPACITY = 0.5;

type Pt = [number, number];

/**
 * One closed outline from its right half, traced nose to tail along the
 * centreline and mirrored, so every silhouette is exactly symmetric.
 */
function mirrored(half: Pt[]): string {
  const left = half.slice(1, -1).reverse().map(([x, y]): Pt => [-x, y]);
  return `M ${[...half, ...left].map(([x, y]) => `${x} ${y}`).join(" L ")} Z`;
}

/** A pair of engine pods or nacelles, one under each wing. */
function pods(...boxes: [x0: number, y0: number, x1: number, y1: number][]): string {
  // Both drawn clockwise, like the outline, so the fill covers them solidly.
  return boxes
    .flatMap(([x0, y0, x1, y1]) => [
      `M ${x0} ${y0} L ${x1} ${y0} L ${x1} ${y1} L ${x0} ${y1} Z`,
      `M ${-x1} ${y0} L ${-x0} ${y0} L ${-x0} ${y1} L ${-x1} ${y1} Z`,
    ])
    .join(" ");
}

/** A propeller across the nose: one bar on the centreline. */
function prop(halfSpan: number, y0: number, y1: number): string {
  return `M ${-halfSpan} ${y0} L ${halfSpan} ${y0} L ${halfSpan} ${y1} L ${-halfSpan} ${y1} Z`;
}

const WIDEBODY_HALF: Pt[] = [
  [0, -23], [2, -22.2], [3.3, -19.8], [3.7, -16], [3.7, -6.5], [22.5, 4.6],
  [22.5, 7], [3.7, 1.6], [3.4, 13], [10, 18], [10, 20.4], [2, 18.6], [1.1, 22], [0, 22.5],
];

/**
 * Top-down silhouettes, nose up (north), rotated to the aircraft's track so
 * each shows heading on its own. Drawn on one grid, about 42 units wingtip to
 * wingtip for an airliner; `scale` then sets the size against the others, so
 * a Cessna reads small and a 777 big.
 */
const SHAPES: Record<Exclude<AircraftShape, "helicopter">, { d: string; scale: number }> = {
  // Cessna 172, Piper, Cirrus: straight high wing, prop on the nose.
  light: {
    d:
      mirrored([
        [0, -16.2], [1.1, -15.6], [1.8, -13.5], [2, -10], [2, -7.2], [17.5, -7.2],
        [17.5, -2.4], [2, -2.4], [1.5, 6], [0.9, 11], [6.2, 11.6], [6.2, 14.2], [0.7, 14], [0, 14.6],
      ]) +
      " " +
      prop(5.2, -17.4, -16.5),
    scale: 0.8,
  },
  // Dash 8, ATR: long straight wing, two nacelles with props, T-tail.
  turboprop: {
    d:
      mirrored([
        [0, -20], [1.5, -19.2], [2.3, -17], [2.5, -13], [2.5, -4.2], [21.5, -3.6],
        [21.5, -0.8], [2.5, 0.8], [2.2, 12.5], [1.4, 15.5], [8, 17], [8, 18.8], [1, 18.4], [0, 19.4],
      ]) +
      " " +
      pods([5.8, -8.5, 8.2, 3], [3.4, -9.9, 10.6, -9.1]),
    scale: 0.95,
  },
  // Hercules: a stout fuselage and four props on a straight wing.
  quadprop: {
    d:
      mirrored([
        [0, -21], [2, -20.2], [3, -17.5], [3.2, -13], [3.2, -4], [22.5, -3.4],
        [22.5, -0.6], [3.2, 1], [3, 10], [2, 14.5], [9, 16], [9, 18], [1.4, 18], [0, 19],
      ]) +
      " " +
      pods(
        [5.6, -7.5, 7.6, 2],
        [12, -7, 14, 2.4],
        [3.9, -8.6, 9.3, -7.9],
        [10.3, -8.1, 15.7, -7.4],
      ),
    scale: 1.12,
  },
  // CRJ, Citation, Gulfstream: slim, swept, engines on the rear fuselage.
  rearjet: {
    d:
      mirrored([
        [0, -20], [1.3, -19.2], [2, -17], [2.2, -13], [2.2, -3], [15.5, 3.8],
        [15.5, 5.6], [2.2, 2.4], [2.2, 13], [1.6, 16], [7.6, 17.8], [7.6, 19.4], [1.1, 19], [0, 19.6],
      ]) +
      " " +
      pods([2.6, 6.5, 5.6, 12.6]),
    scale: 0.9,
  },
  // A320, 737, A220, E-jets: swept wing, an engine under each.
  narrowbody: {
    d:
      mirrored([
        [0, -22], [1.6, -21.2], [2.6, -19], [3, -16], [3, -6], [20.5, 3.8],
        [20.5, 6.5], [3, 2], [2.8, 12], [8.8, 17], [8.8, 19.5], [1.6, 17.6], [0.9, 20.6], [0, 21],
      ]) +
      " " +
      pods([7.3, -5.6, 9.9, -0.6]),
    scale: 1,
  },
  // 777, 787, A330: wider fuselage, longer wing, big engines.
  widebody: {
    d: mirrored(WIDEBODY_HALF) + " " + pods([7.4, -6.6, 10.8, -0.2]),
    scale: 1.22,
  },
  // 747, C-17, KC-135: four engines under the wing.
  quad: {
    d: mirrored(WIDEBODY_HALF) + " " + pods([6.6, -6.4, 9.2, -1.6], [13.4, -2.6, 16, 2]),
    scale: 1.3,
  },
};

/**
 * Top-down helicopter, nose up: a rounded cabin, a thin tail boom and the
 * tail rotor across its end. The main rotor is drawn on its own so it can
 * spin, centred on the mast at HELI_MAST_Y.
 */
const HELI_BODY =
  "M 0 -13 C 5 -13 7 -8 7 -3 C 7 3 4 7 0 7 C -4 7 -7 3 -7 -3 C -7 -8 -5 -13 0 -13 Z " +
  "M -1.6 6 L 1.6 6 L 1.1 19 L -1.1 19 Z " +
  "M -5.5 18 L 5.5 18 L 5.5 21 L -5.5 21 Z";
const HELI_MAST_Y = -3;

/** Four main-rotor blades, ~44 units tip to tip, centred on the mast. */
const ROTOR_BLADES =
  "M -22 -1 L 22 -1 L 22 1 L -22 1 Z M -1 -22 L 1 -22 L 1 22 L -1 22 Z";

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
  const u = useScopeUnits();
  const width = useContext(ScopeWidthContext);
  // On a narrow scope the inner ring labels would crowd the aircraft.
  const rings = width < 420 ? RINGS.filter((f) => f >= 0.5 && f !== 0.75) : RINGS;
  return (
    <g aria-hidden="true">
      {rings.map((f) => (
        <g key={f}>
          <circle
            cx={C}
            cy={C}
            r={R_MAX * f}
            fill="none"
            stroke="var(--color-grid)"
            strokeWidth={1.5}
            opacity={FRAME_OPACITY}
          />
          <text
            x={C + 7}
            y={C - R_MAX * f + u(16)}
            fill="var(--color-ink-faint)"
            fontSize={u(14)}
          >
            {+(rangeKm * f).toFixed(1)}
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
            opacity={FRAME_OPACITY}
          />
        );
      })}
      {([["N", 0], ["E", 90], ["S", 180], ["W", 270]] as const).map(
        ([label, deg]) => {
          const p = polar(C, C, R_MAX + 30, deg);
          return (
            <text
              key={label}
              x={p.x}
              y={p.y}
              fill="var(--color-ink-dim)"
              fontSize={u(15)}
              fontWeight={600}
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

/** Where a blip's callsign sits, and the box it takes up (viewBox units). */
export type LabelSpot = {
  side: "left" | "right";
  dy: number;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
};

/** Gap between a plane's centre and its label, in viewBox units. */
const LABEL_GAP = 34;

/**
 * Place every blip's label so labels don't sit on each other or on another
 * plane: try the natural side, then the other side, then a line lower or
 * higher. Greedy and cheap; the scope rarely holds more than a dozen planes.
 */
export function placeLabels(
  planes: { c: Contact; x: number; y: number }[],
  u: (px: number) => number,
): LabelSpot[] {
  const half = u(18);
  const step = u(34);
  const planeR = u(14);
  const taken: LabelSpot[] = [];
  const hitsPlane = (b: LabelSpot, self: number) =>
    planes.some(
      (p, j) =>
        j !== self &&
        p.x + planeR > b.x0 &&
        p.x - planeR < b.x1 &&
        p.y + planeR > b.y0 &&
        p.y - planeR < b.y1,
    );
  const overlaps = (a: LabelSpot, b: LabelSpot) =>
    a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

  return planes.map(({ c, x, y }, i) => {
    const width = Math.max(c.callsign.length, 5) * u(15) * 0.62;
    const natural = x > SIZE * FLIP_AFTER ? "left" : "right";
    const other = natural === "left" ? "right" : "left";
    const box = (side: "left" | "right", dy: number): LabelSpot => {
      const x0 = side === "right" ? x + LABEL_GAP : x - LABEL_GAP - width;
      return { side, dy, x0, x1: x0 + width, y0: y + dy - half, y1: y + dy + half };
    };
    const tries = [
      box(natural, 0),
      box(other, 0),
      box(natural, step),
      box(other, step),
      box(natural, -step),
      box(other, -step),
    ];
    const spot =
      tries.find((b) => !taken.some((t) => overlaps(t, b)) && !hitsPlane(b, i)) ??
      tries[0];
    taken.push(spot);
    return spot;
  });
}

/** A small aircraft for the legend, drawn the way the scope draws it. */
export function PlaneGlyph({ color, hollow }: { color: string; hollow: boolean }) {
  return (
    <svg width="16" height="16" viewBox="-26 -26 52 52" aria-hidden="true">
      <Silhouette d={SHAPES.narrowbody.d} color={color} hollow={hollow} inside="var(--color-canvas)" />
    </svg>
  );
}

/**
 * A silhouette, solid or hollow. Hollow is drawn as a thick outline with the
 * shape filled again on top, so only the outer edge shows: engines and props
 * merge into the wing instead of leaving their own outlines across it.
 */
function Silhouette({
  d,
  color,
  hollow,
  inside = "var(--color-canvas)",
  transform,
}: {
  d: string;
  color: string;
  hollow: boolean;
  /** What the hollow shows through: the colour behind the scope. */
  inside?: string;
  transform?: string;
}) {
  if (!hollow) {
    return <path d={d} transform={transform} fill={color} strokeWidth={2.5} style={HALO} />;
  }
  return (
    <g transform={transform}>
      <path d={d} fill={color} stroke={color} strokeWidth={4.5} strokeLinejoin="round" />
      <path d={d} fill={inside} />
    </g>
  );
}

/** Spoken phase, matching the list under the radar. */
const PHASE_SPOKEN: Record<FlightPhase, string> = {
  arriving: "arriving",
  departing: "departing",
  overflight: "passing over",
  unknown: "nearby",
};

/**
 * One aircraft: a silhouette of its kind (light single, turboprop, jet,
 * widebody...) pointing along its track, with callsign and altitude.
 * Arrivals are solid; departures are hollow, so the two read apart without
 * relying on hue.
 */
export function Blip({
  contact: c,
  x,
  y,
  distanceKm,
  color,
  selected,
  fresh = false,
  label,
  onSelect,
}: {
  contact: Contact;
  x: number;
  y: number;
  /** From the centre of whichever scope this is drawn on. */
  distanceKm: number;
  color: string;
  selected: boolean;
  /** Just picked up by the radar sweep: plays the detection ping. */
  fresh?: boolean;
  /** Where the callsign goes, from placeLabels(). */
  label: LabelSpot;
  onSelect: (icao24: string, ev?: MouseEvent) => void;
}) {
  const track = c.trackDeg ?? 0;
  const altFt = metersToFt(c.baroAltitudeM);
  const shape = aircraftShape(c);
  const heli = shape === "helicopter";
  const hollow = c.phase === "departing";
  const iconScale = selected ? 1.35 : 1.2;
  const u = useScopeUnits();
  const width = useContext(ScopeWidthContext);
  // On a narrow scope the aircraft crowd the airport: the altitude waits
  // until you pick the plane.
  const showAlt = width >= 420 || selected;
  const labelX = label.side === "right" ? LABEL_GAP : -LABEL_GAP;
  const anchor = label.side === "right" ? "start" : "end";
  return (
    <g
      className="blip cursor-pointer"
      style={{ transform: `translate(${x}px, ${y}px)` }}
      onClick={(ev) => onSelect(c.id, ev)}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`${flightTitle(c)}${heli ? ", helicopter" : ""}, ${PHASE_SPOKEN[c.phase]}, ${flightLevel(c.baroAltitudeM)}, ${distanceKm.toFixed(1)} kilometres from the airport`}
      onKeyDown={(ev) => {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          onSelect(c.id);
        }
      }}
    >
      {/* Invisible hit target: at least a 48px fingertip at any scope width. */}
      <circle cx={0} cy={0} r={Math.max(60, u(24))} fill="transparent" />
      {/* Keyboard focus ring drawn in the SVG: an outline on a <g> is unreliable. */}
      <circle
        className="blip-focus"
        cx={0}
        cy={0}
        r={50}
        fill="none"
        stroke="var(--color-accent-ink)"
        strokeWidth={4}
      />

      {/* Just picked up by the sweep: one ring ripples out, then it's gone. */}
      {fresh && (
        <circle
          className="detect-ping"
          cx={0}
          cy={0}
          r={26}
          fill="none"
          stroke={color}
          strokeWidth={3}
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
        {heli ? (
          <g transform={`rotate(${track}) scale(${iconScale})`}>
            <Silhouette d={HELI_BODY} color={color} hollow={hollow} />
            <g transform={`translate(0 ${HELI_MAST_Y})`}>
              {/* The blur of the blades, under the blades themselves. */}
              <circle r={22} fill={color} opacity={0.14} />
              <g className="rotor">
                <path
                  d={ROTOR_BLADES}
                  fill={color}
                  strokeWidth={1.5}
                  style={HALO}
                />
              </g>
            </g>
          </g>
        ) : (
          <Silhouette
            d={SHAPES[shape].d}
            color={color}
            hollow={hollow}
            transform={`rotate(${track}) scale(${iconScale * SHAPES[shape].scale})`}
          />
        )}
        <text
          x={labelX}
          y={label.dy - u(4)}
          textAnchor={anchor}
          fill={color}
          fontSize={u(15)}
          fontWeight={600}
          strokeWidth={u(4)}
          style={{ ...HALO, letterSpacing: "0" }}
        >
          {c.callsign}
        </text>
        {showAlt && <text
          x={labelX}
          y={label.dy + u(14)}
          textAnchor={anchor}
          fill="var(--color-ink-dim)"
          fontSize={u(14)}
          strokeWidth={u(4)}
          style={HALO}
        >
          {altFt != null ? flightLevel(c.baroAltitudeM) : "--"}
        </text>}
      </g>
    </g>
  );
}
