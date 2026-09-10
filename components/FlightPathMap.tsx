"use client";

import { toRad } from "@/lib/geo";
import type { TrackPoint } from "@/lib/types";

const W = 640;
const H = 260;
const PAD = 26;
const MAX_POINTS = 220;

/** Even-stride downsample so a long-haul track stays cheap to render. */
function thin(path: TrackPoint[]): TrackPoint[] {
  if (path.length <= MAX_POINTS) return path;
  const step = path.length / MAX_POINTS;
  const out: TrackPoint[] = [];
  for (let i = 0; i < MAX_POINTS; i += 1) out.push(path[Math.floor(i * step)]);
  out.push(path[path.length - 1]);
  return out;
}

export function FlightPathMap({
  path,
  station,
  originLabel,
}: {
  path: TrackPoint[];
  station: { lat: number; lon: number };
  originLabel: string | null;
}) {
  const points = thin(path);
  if (points.length < 2) return null;

  // Equirectangular, x compressed by cos(lat) so the shape stays honest.
  const lats = [...points.map((p) => p.lat), station.lat];
  const lons = [...points.map((p) => p.lon), station.lon];
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
  const scale = Math.min((W - PAD * 2) / spanX, (H - PAD * 2) / spanY);
  const offX = (W - spanX * scale) / 2;
  const offY = (H - spanY * scale) / 2;

  const project = (lat: number, lon: number) => ({
    x: (lon * kx - minX) * scale + offX,
    y: (-lat - minY) * scale + offY,
  });

  const poly = points
    .map((p) => {
      const { x, y } = project(p.lat, p.lon);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const start = project(points[0].lat, points[0].lon);
  const end = project(
    points[points.length - 1].lat,
    points[points.length - 1].lon,
  );
  const home = project(station.lat, station.lon);

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto w-full"
        role="img"
        aria-label={`Flight path from ${originLabel ?? "its origin"} to the current position`}
      >
        <polyline
          points={poly}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={2}
          strokeOpacity={0.55}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* origin */}
        <circle cx={start.x} cy={start.y} r={4.5} fill="none" stroke="var(--text-dim)" strokeWidth={2} />

        {/* your station */}
        <g>
          <circle cx={home.x} cy={home.y} r={9} fill="none" stroke="var(--alert)" strokeWidth={1.5} strokeDasharray="3 4" />
          <circle cx={home.x} cy={home.y} r={2.5} fill="var(--alert)" />
        </g>

        {/* current position */}
        <circle cx={end.x} cy={end.y} r={5.5} fill="var(--accent)" />
      </svg>

      <figcaption className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[var(--text-faint)]">
        <span>
          <span className="text-[var(--text-dim)]">Track from</span>{" "}
          {originLabel ??
            `${points[0].lat.toFixed(2)}, ${points[0].lon.toFixed(2)}`}
        </span>
        <span>{points.length} points</span>
      </figcaption>
    </figure>
  );
}
