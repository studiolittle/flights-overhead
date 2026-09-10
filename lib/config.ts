import type { HomeAirport, Station } from "./types";

/**
 * The airport whose arrivals and departures the board shows by default.
 * Ottawa Macdonald-Cartier sits ~8 km east of the default station, so runway
 * 07/25 traffic crosses it on approach and climb-out.
 */
export const HOME_AIRPORT: HomeAirport = {
  iata: "YOW",
  icao: "CYOW",
  name: "Ottawa",
  lat: 45.3225,
  lon: -75.6692,
};

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
