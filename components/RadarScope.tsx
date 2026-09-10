"use client";

import { flightLevel, metersToFt } from "@/lib/format";
import type { Contact, FlightPhase } from "@/lib/types";

const SIZE = 1000;
const C = SIZE / 2;
const R_MAX = 442;
const RINGS = [0.25, 0.5, 0.75, 1] as const;

const PHASE_COLOR: Record<FlightPhase, string> = {
  arriving: "var(--color-accent-ink)",
  departing: "var(--color-depart)",
  overflight: "var(--color-ink-dim)",
  unknown: "var(--color-ink-dim)",
};

/** Polar to cartesian, bearing 0 = up, clockwise. */
function polar(cx: number, cy: number, radius: number, deg: number) {
  const t = ((deg - 90) * Math.PI) / 180;
  return { x: cx + radius * Math.cos(t), y: cy + radius * Math.sin(t) };
}

export function RadarScope({
  contacts,
  rangeKm,
  overheadRadiusKm,
  loading,
  selectedId,
  onSelect,
}: {
  contacts: Contact[];
  rangeKm: number;
  overheadRadiusKm: number;
  loading: boolean;
  selectedId: string | null;
  onSelect: (icao24: string) => void;
}) {
  const overheadR = R_MAX * Math.min(1, overheadRadiusKm / rangeKm);

  return (
    /* overflow-hidden: the sweep is a rotating square whose bounding box grows
       past the container even though border-radius keeps it inscribed. */
    <div className="relative aspect-square w-full overflow-hidden">
      <div className="radar-sweep" />
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="relative block h-full w-full"
        role="img"
        aria-label={`Radar, ${rangeKm} km range, ${contacts.length} aircraft`}
      >
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

        <circle
          cx={C}
          cy={C}
          r={overheadR}
          fill="color-mix(in srgb, var(--color-alert) 6%, transparent)"
          stroke="color-mix(in srgb, var(--color-alert) 34%, transparent)"
          strokeWidth={1.5}
          strokeDasharray="3 7"
        />

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

        <circle
          cx={C}
          cy={C}
          r={9}
          fill="none"
          stroke="var(--color-accent-ink)"
          strokeWidth={2}
        />
        <circle cx={C} cy={C} r={2.5} fill="var(--color-accent-ink)" />

        {contacts.map((c) => {
          const rr = Math.min(1, c.distanceKm / rangeKm) * R_MAX;
          const pos = polar(C, C, rr, c.bearingDeg);
          const overhead = c.distanceKm <= overheadRadiusKm;
          const selected = c.id === selectedId;
          const color = overhead
            ? "var(--color-alert)"
            : PHASE_COLOR[c.phase];
          const track = c.trackDeg ?? 0;
          const leadLen = Math.min(46, 16 + (c.velocityMs ?? 0) / 6);
          const lead = polar(0, 0, leadLen, track);
          const altFt = metersToFt(c.baroAltitudeM);

          return (
            <g
              key={c.id}
              className="blip cursor-pointer"
              style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }}
              onClick={() => onSelect(c.id)}
              role="button"
              tabIndex={0}
              aria-label={`${c.callsign}, ${flightLevel(c.baroAltitudeM)}, ${c.distanceKm.toFixed(1)} kilometres`}
              onKeyDown={(ev) => {
                if (ev.key === "Enter" || ev.key === " ") {
                  ev.preventDefault();
                  onSelect(c.id);
                }
              }}
            >
              {/* generous invisible hit target */}
              <circle cx={0} cy={0} r={26} fill="transparent" />

              {overhead && (
                <circle
                  className="pulse-ring"
                  cx={0}
                  cy={0}
                  r={16}
                  fill="none"
                  stroke="var(--color-alert)"
                  strokeWidth={2}
                />
              )}
              {selected && (
                <circle
                  cx={0}
                  cy={0}
                  r={14}
                  fill="none"
                  stroke={color}
                  strokeWidth={1.5}
                  strokeDasharray="3 3"
                />
              )}

              <g className="blip-body">
                <line
                  x1={0}
                  y1={0}
                  x2={lead.x}
                  y2={lead.y}
                  stroke={color}
                  strokeWidth={2}
                  opacity={0.75}
                />
                <circle cx={0} cy={0} r={selected ? 7 : 6} fill={color} />
                <text
                  x={14}
                  y={-9}
                  fill={color}
                  fontSize={24}
                  style={{ letterSpacing: "0.5px" }}
                >
                  {c.callsign}
                </text>
                <text x={14} y={13} fill="var(--color-ink-dim)" fontSize={20}>
                  {altFt != null ? flightLevel(c.baroAltitudeM) : "--"}
                </text>
              </g>
            </g>
          );
        })}

        {loading && (
          <text
            x={C}
            y={C + 92}
            fill="var(--color-ink-dim)"
            fontSize={27}
            textAnchor="middle"
            className="glow"
          >
            ACQUIRING FEED
          </text>
        )}
        {!loading && contacts.length === 0 && (
          <text
            x={C}
            y={C + 92}
            fill="var(--color-ink-dim)"
            fontSize={24}
            textAnchor="middle"
          >
            NO CONTACTS · {Math.round(rangeKm)} KM
          </text>
        )}
      </svg>
    </div>
  );
}
