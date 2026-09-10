"use client";

import { HOME_AIRPORT } from "@/lib/config";
import type { Contact } from "@/lib/types";
import {
  Blip,
  C,
  PHASE_COLOR,
  R_MAX,
  SIZE,
  ScopeFrame,
  polar,
} from "./ScopeParts";

export function RadarScope({
  contacts,
  rangeKm,
  overheadRadiusKm,
  home,
  loading,
  selectedId,
  onSelect,
}: {
  contacts: Contact[];
  rangeKm: number;
  overheadRadiusKm: number;
  /** The user's home, as distance and bearing from the airport at the centre. */
  home: { distanceKm: number; bearingDeg: number };
  loading: boolean;
  selectedId: string | null;
  onSelect: (icao24: string) => void;
}) {
  const homeInView = home.distanceKm <= rangeKm;
  const homePt = polar(
    C,
    C,
    Math.min(1, home.distanceKm / rangeKm) * R_MAX,
    home.bearingDeg,
  );
  // Track the true scale, but keep the ring readable: never a speck when
  // zoomed out, never dominating the scope when zoomed in.
  const overheadR = Math.min(
    58,
    Math.max(11, (overheadRadiusKm / rangeKm) * R_MAX),
  );

  return (
    /* overflow-hidden: the sweep is a rotating square whose bounding box grows
       past the container even though border-radius keeps it inscribed. */
    <div className="relative aspect-square w-full overflow-hidden">
      <div className="radar-sweep" />
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="relative block h-full w-full"
        role="img"
        aria-label={`${HOME_AIRPORT.iata} radar, ${rangeKm} km range, ${contacts.length} aircraft`}
      >
        <ScopeFrame rangeKm={rangeKm} />

        {/* The airport sits at the centre. */}
        <circle
          cx={C}
          cy={C}
          r={9}
          fill="none"
          stroke="var(--color-accent-ink)"
          strokeWidth={2}
        />
        <circle cx={C} cy={C} r={2.5} fill="var(--color-accent-ink)" />
        <text
          x={C}
          y={C + 30}
          fill="var(--color-accent-ink)"
          fontSize={21}
          textAnchor="middle"
          style={{ letterSpacing: "2px" }}
        >
          {HOME_AIRPORT.iata}
        </text>

        {/* The house, with the ring that counts as "overhead". */}
        {homeInView && (
          <g>
            <circle
              cx={homePt.x}
              cy={homePt.y}
              r={overheadR}
              fill="color-mix(in srgb, var(--color-alert) 7%, transparent)"
              stroke="color-mix(in srgb, var(--color-alert) 38%, transparent)"
              strokeWidth={1.5}
              strokeDasharray="3 6"
            />
            <circle
              cx={homePt.x}
              cy={homePt.y}
              r={7}
              fill="none"
              stroke="var(--color-ink)"
              strokeWidth={2}
            />
            <circle cx={homePt.x} cy={homePt.y} r={2} fill="var(--color-ink)" />
            <text
              x={homePt.x + overheadR + 8}
              y={homePt.y + 6}
              fill="var(--color-ink-dim)"
              fontSize={19}
              style={{ letterSpacing: "2px" }}
            >
              HOME
            </text>
          </g>
        )}

        {contacts.map((c) => {
          const rr = Math.min(1, c.distanceKm / rangeKm) * R_MAX;
          const pos = polar(C, C, rr, c.bearingDeg);
          const overhead = c.overhead === true;
          return (
            <Blip
              key={c.id}
              contact={c}
              x={pos.x}
              y={pos.y}
              distanceKm={c.distanceKm}
              color={overhead ? "var(--color-alert)" : PHASE_COLOR[c.phase]}
              selected={c.id === selectedId}
              pulse={overhead}
              onSelect={onSelect}
            />
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
            NO {HOME_AIRPORT.iata} TRAFFIC · {Math.round(rangeKm)} KM
          </text>
        )}
      </svg>
    </div>
  );
}
