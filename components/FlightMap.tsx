"use client";

import { useEffect, useMemo, useState } from "react";
import {
  geoAzimuthalEquidistant,
  geoCentroid,
  geoGraticule10,
  geoPath,
} from "d3-geo";
import { feature } from "topojson-client";
import type { Feature, FeatureCollection, GeoJsonProperties, Geometry } from "geojson";
import type { AirportRef, TrackResponse } from "@/lib/types";

const W = 640;
const H = 360;
const PAD = 24;

type Land = FeatureCollection<Geometry, GeoJsonProperties>;
type Pt = [number, number];

// Fetched once per page, then shared by every render of the map.
let worldPromise: Promise<Land | null> | null = null;

function loadWorld(): Promise<Land | null> {
  if (!worldPromise) {
    worldPromise = fetch("/geo/countries-110m.json")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((topo: any) => feature(topo, topo.objects.countries) as unknown as Land)
      .catch(() => null);
  }
  return worldPromise;
}

function airportPoint(a: AirportRef | null): Pt | null {
  if (!a || a.lat == null || a.lon == null) return null;
  return [a.lon, a.lat];
}

function line(coords: Pt[]): Feature<Geometry> | null {
  if (coords.length < 2) return null;
  return {
    type: "Feature",
    properties: {},
    geometry: { type: "LineString", coordinates: coords },
  };
}

function point(coords: Pt): Feature<Geometry> {
  return {
    type: "Feature",
    properties: {},
    geometry: { type: "Point", coordinates: coords },
  };
}

export function FlightMap({
  track,
  loading,
  current,
  origin,
  destination,
  station,
}: {
  track: TrackResponse | null;
  loading: boolean;
  current: { lat: number; lon: number };
  origin: AirportRef | null;
  destination: AirportRef | null;
  station: { lat: number; lon: number };
}) {
  const [world, setWorld] = useState<Land | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadWorld().then((w) => {
      if (!cancelled) setWorld(w);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Coarse position, used only when there is no recorded track to anchor to.
  // Rounding keeps the projection (and the whole basemap) from being rebuilt
  // on every dead-reckoning tick.
  const coarseLon = Math.round(current.lon * 10) / 10;
  const coarseLat = Math.round(current.lat * 10) / 10;

  // Everything expensive is derived once per track/route change, never on the
  // 1s position tick: projecting the world at 110m is ~180KB of path data.
  const scene = useMemo(() => {
    const traced: Pt[] = (track?.points ?? []).map((p) => [p.lon, p.lat]);
    const from = airportPoint(origin);
    const to = airportPoint(destination);

    // Anchor the route on the last recorded fix when we have one, so the map
    // does not rescale as the aircraft creeps forward.
    const anchor: Pt =
      traced.length > 0 ? traced[traced.length - 1] : [coarseLon, coarseLat];

    const flownCoords: Pt[] =
      traced.length >= 2 ? traced : from ? [from, anchor] : [];
    const flown = line(flownCoords);
    const remaining = to ? line([anchor, to]) : null;

    if (!flown && !remaining) return null;

    const fitFeatures: Feature<Geometry>[] = [];
    if (flown) fitFeatures.push(flown);
    if (remaining) fitFeatures.push(remaining);
    // Always keep the station in frame; it is the whole point of the page.
    fitFeatures.push(point([station.lon, station.lat]));

    const fit: FeatureCollection<Geometry> = {
      type: "FeatureCollection",
      features: fitFeatures,
    };

    const centre = geoCentroid(fit);
    if (!Number.isFinite(centre[0]) || !Number.isFinite(centre[1])) return null;

    const projection = geoAzimuthalEquidistant()
      .rotate([-centre[0], -centre[1]])
      .fitExtent(
        [
          [PAD, PAD],
          [W - PAD, H - PAD],
        ],
        fit,
      );

    const path = geoPath(projection);

    return {
      projection,
      worldD: world ? path(world) : null,
      graticuleD: path(geoGraticule10()),
      flownD: flown ? path(flown) : null,
      remainingD: remaining ? path(remaining) : null,
      fromXY: from ? projection(from) : null,
      toXY: to ? projection(to) : null,
      homeXY: projection([station.lon, station.lat]),
      hasTrace: traced.length >= 2,
    };
  }, [
    world,
    track,
    origin,
    destination,
    station.lat,
    station.lon,
    coarseLon,
    coarseLat,
  ]);

  if (!scene) {
    return loading ? <MapNote>Loading flight path...</MapNote> : null;
  }

  // Only the aircraft marker follows the live position.
  const hereXY = scene.projection([current.lon, current.lat]);

  return (
    <figure className="m-0">
      <div className="border border-line bg-surface-2">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block h-auto w-full"
          role="img"
          aria-label={`Map of the flight path${origin?.municipality ? ` from ${origin.municipality}` : ""}`}
        >
          <path
            d={scene.graticuleD ?? undefined}
            fill="none"
            stroke="var(--color-grid)"
            strokeWidth={0.7}
          />

          {scene.worldD && (
            <path
              d={scene.worldD}
              fill="color-mix(in srgb, var(--color-ink) 12%, transparent)"
              stroke="var(--color-line-strong)"
              strokeWidth={1}
              strokeLinejoin="round"
            />
          )}

          {scene.remainingD && (
            <path
              d={scene.remainingD}
              fill="none"
              stroke="var(--color-ink-dim)"
              strokeWidth={1.8}
              strokeOpacity={0.7}
              strokeDasharray="5 5"
              strokeLinecap="round"
            />
          )}

          {scene.flownD && (
            <path
              d={scene.flownD}
              fill="none"
              stroke="var(--color-accent-ink)"
              strokeWidth={2.4}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {scene.fromXY && (
            <circle
              cx={scene.fromXY[0]}
              cy={scene.fromXY[1]}
              r={4}
              fill="var(--color-surface)"
              stroke="var(--color-ink-dim)"
              strokeWidth={1.8}
            />
          )}
          {scene.toXY && (
            <circle
              cx={scene.toXY[0]}
              cy={scene.toXY[1]}
              r={4}
              fill="var(--color-surface)"
              stroke="var(--color-ink-dim)"
              strokeWidth={1.8}
            />
          )}

          {scene.homeXY && (
            <g>
              <circle
                cx={scene.homeXY[0]}
                cy={scene.homeXY[1]}
                r={9}
                fill="none"
                stroke="var(--color-alert)"
                strokeWidth={1.5}
                strokeDasharray="3 3"
              />
              <circle
                cx={scene.homeXY[0]}
                cy={scene.homeXY[1]}
                r={2.5}
                fill="var(--color-alert)"
              />
            </g>
          )}

          {hereXY && (
            <g>
              <circle
                cx={hereXY[0]}
                cy={hereXY[1]}
                r={8}
                fill="none"
                stroke="var(--color-accent-ink)"
                strokeWidth={1.5}
                strokeOpacity={0.5}
              />
              <circle
                cx={hereXY[0]}
                cy={hereXY[1]}
                r={4.5}
                fill="var(--color-accent-ink)"
                stroke="var(--color-surface)"
                strokeWidth={1.2}
              />
            </g>
          )}
        </svg>
      </div>

      <figcaption className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ink-faint">
        <Legend swatch="accent">
          {scene.hasTrace ? "Flown (recorded)" : "Flown (approximate)"}
        </Legend>
        {scene.remainingD && <Legend swatch="dim">Remaining</Legend>}
        <Legend swatch="alert">Your station</Legend>
        {loading && <span>Loading path...</span>}
      </figcaption>
    </figure>
  );
}

function Legend({
  swatch,
  children,
}: {
  swatch: "accent" | "dim" | "alert";
  children: React.ReactNode;
}) {
  const color =
    swatch === "accent"
      ? "var(--color-accent-ink)"
      : swatch === "alert"
        ? "var(--color-alert)"
        : "var(--color-ink-dim)";
  return (
    <span className="flex items-center gap-1.5">
      <span
        aria-hidden
        className="inline-block h-[2px] w-[14px]"
        style={{ background: color }}
      />
      {children}
    </span>
  );
}

function MapNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="border border-line bg-surface-2 px-3 py-6 text-center text-[12.5px] text-ink-faint">
      {children}
    </p>
  );
}
