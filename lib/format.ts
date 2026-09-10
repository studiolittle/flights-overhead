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

/** Flight level above ~4000 ft, plain feet below it. */
export function flightLevel(baroM: number | null): string {
  if (baroM == null) return "--";
  const ft = baroM * M_TO_FT;
  if (ft < 4000) return `${Math.round(ft / 10) * 10} ft`;
  return `FL${String(Math.round(ft / 100)).padStart(3, "0")}`;
}

export function compass16(deg: number): string {
  const dirs = [
    "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
    "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
  ];
  return dirs[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];
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
