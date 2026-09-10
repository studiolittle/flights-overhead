"use client";

import { bearingDeg, haversineKm } from "@/lib/geo";
import { flightLevel, metersToFt } from "@/lib/format";
import type { Contact, FlightPhase, TrackPoint } from "@/lib/types";

const SIZE = 1000;
const C = SIZE / 2;
const R_MAX = 442;
const RINGS = [0.25, 0.5, 0.75, 1] as const;

const PHASE_COLOR: Record<FlightPhase, string> = {
  arriving: "var(--accent)",
  departing: "var(--warn)",
  overflight: "var(--text-dim)",
  unknown: "var(--text-dim)",
};

/** Polar to cartesian, bearing 0 = up, clockwise. */
function polar(cx: number, cy: number, radius: number, deg: number) {
  const t = ((deg - 90) * Math.PI) / 180;
  return { x: cx + radius * Math.cos(t), y: cy + radius * Math.sin(t) };
}

export function RadarScope({
  contacts,
  station,
  rangeKm,
  overheadRadiusKm,
  loading,
  selectedId,
  onSelect,
  trackPoints,
}: {
  contacts: Contact[];
  station: { lat: number; lon: number };
  rangeKm: number;
  overheadRadiusKm: number;
  loading: boolean;
  selectedId: string | null;
  onSelect: (icao24: string) => void;
  trackPoints: TrackPoint[] | null;
}) {
  const overheadR = R_MAX * Math.min(1, overheadRadiusKm / rangeKm);

  // The portion of the selected aircraft's real track that crosses the scope.
  const trackPoly = (() => {
    if (!trackPoints || trackPoints.length < 2) return null;
    const pts: string[] = [];
    for (const p of trackPoints) {
      const d = haversineKm(station.lat, station.lon, p.lat, p.lon);
      if (d > rangeKm) continue;
      const b = bearingDeg(station.lat, station.lon, p.lat, p.lon);
      const { x, y } = polar(C, C, (d / rangeKm) * R_MAX, b);
      pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }
    return pts.length >= 2 ? pts.join(" ") : null;
  })();

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
            <circle cx={C} cy={C} r={R_MAX * f} fill="none" stroke="var(--grid)" strokeWidth={1.5} />
            <text x={C + 7} y={C - R_MAX * f + 22} fill="var(--text-faint)" fontSize={18} fontFamily="var(--font-sans)">
              {Math.round(rangeKm * f)}
              {f === 1 ? " KM" : ""}
            </text>
          </g>
        ))}

        <circle
          cx={C}
          cy={C}
          r={overheadR}
          fill="color-mix(in srgb, var(--alert) 6%, transparent)"
          stroke="color-mix(in srgb, var(--alert) 32%, transparent)"
          strokeWidth={1.5}
          strokeDasharray="3 7"
        />

        {Array.from({ length: 12 }).map((_, i) => {
          const deg = i * 30;
          const outer = polar(C, C, R_MAX, deg);
          const inner = polar(C, C, R_MAX - (deg % 90 === 0 ? 24 : 12), deg);
          return (
            <line key={deg} x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} stroke="var(--line-bright)" strokeWidth={1.5} />
          );
        })}
        {([["N", 0], ["E", 90], ["S", 180], ["W", 270]] as const).map(([label, deg]) => {
          const p = polar(C, C, R_MAX - 46, deg);
          return (
            <text key={label} x={p.x} y={p.y} fill="var(--text-dim)" fontSize={23} fontFamily="var(--font-sans)" textAnchor="middle" dominantBaseline="middle">
              {label}
            </text>
          );
        })}

        <line x1={C - R_MAX} y1={C} x2={C + R_MAX} y2={C} stroke="var(--grid)" strokeWidth={1} />
        <line x1={C} y1={C - R_MAX} x2={C} y2={C + R_MAX} stroke="var(--grid)" strokeWidth={1} />

        {/* selected aircraft's real path across the scope */}
        {trackPoly && (
          <polyline
            points={trackPoly}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={2.5}
            strokeOpacity={0.5}
            strokeDasharray="8 6"
            strokeLinecap="round"
          />
        )}

        <circle cx={C} cy={C} r={9} fill="none" stroke="var(--accent)" strokeWidth={2} />
        <circle cx={C} cy={C} r={2.5} fill="var(--accent)" />

        {contacts.map((c) => {
          const rr = Math.min(1, c.distanceKm / rangeKm) * R_MAX;
          const pos = polar(C, C, rr, c.bearingDeg);
          const overhead = c.distanceKm <= overheadRadiusKm;
          const selected = c.id === selectedId;
          const color = overhead ? "var(--alert)" : PHASE_COLOR[c.phase];
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
                <circle className="pulse-ring" cx={0} cy={0} r={16} fill="none" stroke="var(--alert)" strokeWidth={2} />
              )}
              {selected && (
                <circle cx={0} cy={0} r={14} fill="none" stroke={color} strokeWidth={1.5} strokeDasharray="3 3" />
              )}

              <g className="blip-body">
                <line x1={0} y1={0} x2={lead.x} y2={lead.y} stroke={color} strokeWidth={2} opacity={0.75} />
                <circle cx={0} cy={0} r={selected ? 7 : 6} fill={color} />
                <text x={14} y={-9} fill={color} fontSize={21} fontFamily="var(--font-sans)" style={{ letterSpacing: "0.5px" }}>
                  {c.callsign}
                </text>
                <text x={14} y={13} fill="var(--text-dim)" fontSize={17} fontFamily="var(--font-sans)">
                  {altFt != null ? flightLevel(c.baroAltitudeM) : "--"}
                </text>
              </g>
            </g>
          );
        })}

        {loading && (
          <text x={C} y={C + 92} fill="var(--text-dim)" fontSize={23} textAnchor="middle" fontFamily="var(--font-sans)" className="glow">
            ACQUIRING FEED
          </text>
        )}
        {!loading && contacts.length === 0 && (
          <text x={C} y={C + 92} fill="var(--text-dim)" fontSize={21} textAnchor="middle" fontFamily="var(--font-sans)">
            NO CONTACTS · {Math.round(rangeKm)} KM
          </text>
        )}
      </svg>
    </div>
  );
}
