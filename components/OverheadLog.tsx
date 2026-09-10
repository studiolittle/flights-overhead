"use client";

import { ClockCounterClockwise } from "@phosphor-icons/react/dist/ssr";
import { PHASE_SHORT } from "@/lib/classify";
import type { FlightPhase } from "@/lib/types";

export interface LogEntry {
  id: string;
  at: number;
  callsign: string;
  operator: string | null;
  phase: FlightPhase;
  type: string | null;
  route: string | null;
  altitude: string;
}

const PHASE_COLOR: Record<FlightPhase, string> = {
  arriving: "var(--accent)",
  departing: "var(--warn)",
  overflight: "var(--text-faint)",
  unknown: "var(--text-faint)",
};

function clockTime(ms: number): string {
  return new Date(ms).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function OverheadLog({
  entries,
  onClear,
}: {
  entries: LogEntry[];
  onClear: () => void;
}) {
  return (
    <div className="panel flex flex-col">
      <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-2.5">
        <span className="flex items-center gap-2 text-[10px] tracking-[0.22em] text-[var(--text-dim)]">
          <ClockCounterClockwise size={13} weight="bold" />
          PASSED OVERHEAD
        </span>
        {entries.length > 0 && (
          <button type="button" onClick={onClear} className="chip">
            CLEAR
          </button>
        )}
      </div>

      {entries.length === 0 ? (
        <p className="px-4 py-6 text-[12px] text-[var(--text-dim)]">
          Nothing logged yet. Aircraft are recorded here as they pass directly
          over your station.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--line)]">
          {entries.map((entry) => (
            <li
              key={`${entry.id}-${entry.at}`}
              className="flex items-center gap-3 px-4 py-2.5 text-[12px]"
            >
              <span className="w-[42px] shrink-0 text-[var(--text-faint)]">
                {clockTime(entry.at)}
              </span>
              <span
                className="w-[30px] shrink-0 text-[10px] tracking-[0.1em]"
                style={{ color: PHASE_COLOR[entry.phase] }}
              >
                {PHASE_SHORT[entry.phase]}
              </span>
              <span className="w-[68px] shrink-0 truncate text-[var(--text)]">
                {entry.callsign}
              </span>
              <span className="hidden min-w-0 flex-1 truncate text-[var(--text-dim)] sm:block">
                {entry.operator ?? ""}
              </span>
              <span className="hidden w-[86px] shrink-0 truncate text-[var(--text-faint)] md:block">
                {entry.type ?? ""}
              </span>
              <span className="w-[124px] shrink-0 truncate text-right text-[var(--text-dim)]">
                {entry.route ?? entry.altitude}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
