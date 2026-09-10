"use client";

import { toRad } from "@/lib/geo";
import type { AirportRef } from "@/lib/types";

const W = 640;
const PAD = 26;
const H_MIN = 120;
const H_MAX = 250;
const ARC_STEPS = 48;

interface Pt {
  lat: number;
  lon: number;
}

/**
 * Great-circle interpolation, so a long leg bows the way a real route does
 * instead of cutting a straight line across the projection.
 */
function greatCircle(a: Pt, b: Pt, steps = ARC_STEPS): Pt[] {
  const [lat1, lon1, lat2, lon2] = [
    toRad(a.lat),
    toRad(a.lon),
    toRad(b.lat),
    toRad(b.lon),
  ];
  const d =
    2 *
    Math.asin(
      Math.sqrt(
        Math.sin((lat2 - lat1) / 2) ** 2 +
          Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2,
      ),
    );
  if (!Number.isFinite(d) || d === 0) return [a, b];

  const out: Pt[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const f = i / steps;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(lat1) * Math.cos(lon1) + B * Math.cos(lat2) * Math.cos(lon2);
    const y = A * Math.cos(lat1) * Math.sin(lon1) + B * Math.cos(lat2) * Math.sin(lon2);
    const z = A * Math.sin(lat1) + B * Math.sin(lat2);
    out.push({
      lat: (Math.atan2(z, Math.sqrt(x * x + y * y)) * 180) / Math.PI,
      lon: (Math.atan2(y, x) * 180) / Math.PI,
    });
  }
  return out;
}

function airportPoint(a: AirportRef | null): Pt | null {
  if (!a || a.lat == null || a.lon == null) return null;
  return { lat: a.lat, lon: a.lon };
}

function airportName(a: AirportRef | null): string {
  if (!a) return "Unknown";
  return a.municipality ?? a.name ?? a.iata ?? a.icao ?? "Unknown";
}

export function FlightPathMap({
  origin,
  destination,
  current,
  station,
}: {
  origin: AirportRef | null;
  destination: AirportRef | null;
  current: Pt;
  station: Pt;
}) {
  const from = airportPoint(origin);
  const to = airportPoint(destination);
  if (!from && !to) return null;

  // Flown leg: origin to where it is now. Remaining leg: now to destination.
  const flown = from ? greatCircle(from, current) : [];
  const remaining = to ? greatCircle(current, to) : [];
  const all = [...flown, ...remaining, current, station];

  const lats = all.map((p) => p.lat);
  const lons = all.map((p) => p.lon);
  const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const kx = Math.cos(toRad(midLat)) || 1e-6;

  const xs = lons.map((l) => l * kx);
  const ys = lats.map((l) => -l);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const spanX = maxX - minX || 1e-6;
  const spanY = maxY - minY || 1e-6;

  // Fit to width, then let the viewBox height follow the route's own aspect
  // (clamped) so a near-horizontal leg is not marooned in a tall empty box.
  // A very vertical route refits so it never overflows the max height.
  const fitW = (W - PAD * 2) / spanX;
  const scale = Math.min(fitW, (H_MAX - PAD * 2) / spanY);
  const H = Math.max(H_MIN, Math.min(H_MAX, spanY * scale + PAD * 2));
  const offX = (W - spanX * scale) / 2;
  const offY = (H - spanY * scale) / 2;

  const project = (p: Pt) => ({
    x: (p.lon * kx - minX) * scale + offX,
    y: (-p.lat - minY) * scale + offY,
  });

  const toPoly = (pts: Pt[]) =>
    pts.map((p) => {
      const { x, y } = project(p);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");

  const here = project(current);
  const home = project(station);

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto w-full max-w-[560px]"
        role="img"
        aria-label={`Route from ${airportName(origin)} to ${airportName(destination)}`}
      >
        {flown.length > 1 && (
          <polyline
            points={toPoly(flown)}
            fill="none"
            stroke="var(--color-accent-ink)"
            strokeWidth={2}
            strokeOpacity={0.75}
            strokeLinecap="round"
          />
        )}
        {remaining.length > 1 && (
          <polyline
            points={toPoly(remaining)}
            fill="none"
            stroke="var(--color-ink-dim)"
            strokeWidth={2}
            strokeOpacity={0.55}
            strokeDasharray="6 6"
            strokeLinecap="round"
          />
        )}

        {from && (
          <circle
            cx={project(from).x}
            cy={project(from).y}
            r={4.5}
            fill="none"
            stroke="var(--color-ink-dim)"
            strokeWidth={2}
          />
        )}
        {to && (
          <circle
            cx={project(to).x}
            cy={project(to).y}
            r={4.5}
            fill="none"
            stroke="var(--color-ink-dim)"
            strokeWidth={2}
          />
        )}

        {/* your station */}
        <circle
          cx={home.x}
          cy={home.y}
          r={9}
          fill="none"
          stroke="var(--color-alert)"
          strokeWidth={1.5}
          strokeDasharray="3 4"
        />
        <circle cx={home.x} cy={home.y} r={2.5} fill="var(--color-alert)" />

        {/* current position */}
        <circle cx={here.x} cy={here.y} r={5.5} fill="var(--color-accent-ink)" />
      </svg>

      <figcaption className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-ink-faint">
        <span>
          <span className="text-ink-dim">Flown</span> {airportName(origin)}
        </span>
        <span>
          <span className="text-ink-dim">Remaining</span>{" "}
          {airportName(destination)}
        </span>
      </figcaption>
    </figure>
  );
}
