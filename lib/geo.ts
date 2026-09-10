// Pure geometry helpers. Safe to import on both server and client.

export const EARTH_RADIUS_KM = 6371;

export function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

/** Great-circle distance between two lat/lon points, in km. */
export function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial bearing from A to B, degrees true (0 = north, clockwise). */
export function bearingDeg(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const dLon = toRad(bLon - aLon);
  const y = Math.sin(dLon) * Math.cos(toRad(bLat));
  const x =
    Math.cos(toRad(aLat)) * Math.sin(toRad(bLat)) -
    Math.sin(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Smallest angle between two headings, 0-180. */
export function headingGap(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/**
 * Dead reckoning: advance a position along a constant heading and speed.
 * Good enough for a few tens of seconds between API snapshots.
 */
export function project(
  lat: number,
  lon: number,
  trackDeg: number,
  speedMs: number,
  seconds: number,
): { lat: number; lon: number } {
  const distanceM = speedMs * seconds;
  const brng = toRad(trackDeg);
  const dLat = (distanceM * Math.cos(brng)) / 111_320;
  const dLon =
    (distanceM * Math.sin(brng)) / (111_320 * Math.cos(toRad(lat)) || 1e-6);
  return { lat: lat + dLat, lon: lon + dLon };
}
