import type { Station } from "./types";

/**
 * Where the radar points before anyone types a postal code.
 *
 * Coordinates are the K2G forward-sortation-area centroid, which is accurate
 * enough for a station: the scope is kilometres wide. Override per-deployment
 * with HOME_LAT / HOME_LON, or just type a postal code in the app.
 */
export const DEFAULT_STATION: Station = {
  lat: 45.3286,
  lon: -75.7703,
  label: "Nepean, Ontario",
  query: "K2G 6P3",
};
