import type { HomeAirport, Station } from "./types";

/**
 * The only airport the app shows traffic for. Ottawa Macdonald-Cartier sits
 * ~8 km east of the default station.
 */
export const HOME_AIRPORT: HomeAirport = {
  iata: "YOW",
  icao: "CYOW",
  name: "Ottawa",
  lat: 45.3225,
  lon: -75.6692,
  // Thresholds and TRUE headings from OurAirports. 04/22 is a short
  // general-aviation strip; airliners use 14/32 and 07/25.
  runways: [
    {
      lengthFt: 10000,
      ends: [
        { ident: "14", lat: 45.32703, lon: -75.68624, headingDeg: 126.3 },
        { ident: "32", lat: 45.31079, lon: -75.65492, headingDeg: 306.3 },
      ],
    },
    {
      lengthFt: 8000,
      ends: [
        { ident: "07", lat: 45.3133, lon: -75.671, headingDeg: 57.2 },
        { ident: "25", lat: 45.3252, lon: -75.6448, headingDeg: 237.2 },
      ],
    },
    {
      lengthFt: 3300,
      ends: [
        { ident: "04", lat: 45.32668, lon: -75.68902, headingDeg: 26 },
        { ident: "22", lat: 45.3343, lon: -75.6835, headingDeg: 206 },
      ],
    },
  ],
};

/** Radius of the airport panel's scope, km from the airport. */
export const AIRPORT_VIEW_KM = 12;

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
