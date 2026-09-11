// Display formatting for aviation-style readouts.

const M_TO_FT = 3.28084;
const MS_TO_KT = 1.943844;
const MS_TO_FPM = 196.850394;

export function msToKt(v: number | null): number | null {
  return v == null ? null : v * MS_TO_KT;
}

export function msToFpm(v: number | null): number | null {
  return v == null ? null : v * MS_TO_FPM;
}

export function metersToFt(m: number | null): number | null {
  return m == null ? null : m * M_TO_FT;
}

/**
 * Plain feet below 18,000 ft, flight levels above. 18,000 ft is the transition
 * altitude in Canadian airspace: only above it do crews switch their altimeters
 * to the standard setting and start calling height a "flight level".
 */
export function flightLevel(baroM: number | null): string {
  if (baroM == null) return "--";
  const ft = baroM * M_TO_FT;
  if (ft < 18000) return `${(Math.round(ft / 100) * 100).toLocaleString()} ft`;
  return `FL${String(Math.round(ft / 100)).padStart(3, "0")}`;
}

export function compass16(deg: number): string {
  const dirs = [
    "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
    "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
  ];
  return dirs[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];
}

const COMPASS_WORDS: Record<string, string> = {
  N: "north",
  NNE: "north-northeast",
  NE: "northeast",
  ENE: "east-northeast",
  E: "east",
  ESE: "east-southeast",
  SE: "southeast",
  SSE: "south-southeast",
  S: "south",
  SSW: "south-southwest",
  SW: "southwest",
  WSW: "west-southwest",
  W: "west",
  WNW: "west-northwest",
  NW: "northwest",
  NNW: "north-northwest",
};

/** The 16-point direction in words, e.g. 320 -> "northwest". */
export function compassWord(deg: number): string {
  const abbr = compass16(deg);
  return COMPASS_WORDS[abbr] ?? abbr;
}

export function ageLabel(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${String(s % 60).padStart(2, "0")}s`;
}

export function pad(n: number, len = 3): string {
  return String(((Math.round(n) % 360) + 360) % 360).padStart(len, "0");
}
