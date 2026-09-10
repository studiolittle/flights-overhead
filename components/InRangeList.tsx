"use client";

import { PHASE_SHORT } from "@/lib/classify";
import { decodeCallsign } from "@/lib/aircraft";
import { flightLevel } from "@/lib/format";
import type { Contact, FlightPhase } from "@/lib/types";

const PHASE_COLOR: Record<FlightPhase, string> = {
  arriving: "var(--accent)",
  departing: "var(--warn)",
  overflight: "var(--text-faint)",
  unknown: "var(--text-faint)",
};

export function InRangeList({
  contacts,
  selectedId,
  overheadRadiusKm,
  onSelect,
}: {
  contacts: Contact[];
  selectedId: string | null;
  overheadRadiusKm: number;
  onSelect: (icao24: string) => void;
}) {
  return (
    <div className="panel flex flex-col">
      <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-2.5">
        <span className="text-[10px] tracking-[0.22em] text-[var(--text-dim)]">
          IN RANGE
        </span>
        <span className="text-[10px] tracking-[0.18em] text-[var(--text-faint)]">
          {contacts.length === 0 ? "NONE" : `${contacts.length} AIRCRAFT`}
        </span>
      </div>

      {contacts.length === 0 ? (
        <p className="px-4 py-6 text-[12px] text-[var(--text-dim)]">
          Nothing overhead right now.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--line)]">
          {contacts.map((c) => {
            const cs = decodeCallsign(c.callsign);
            const e = c.enrichment;
            const selected = c.id === selectedId;
            const overhead = c.distanceKm <= overheadRadiusKm;
            const operator = cs.operator ?? e?.airlineName;
            const route =
              e?.origin?.iata && e?.destination?.iata
                ? `${e.origin.iata} → ${e.destination.iata}`
                : null;

            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onSelect(c.id)}
                  aria-pressed={selected}
                  className={`row ${selected ? "row-on" : ""}`}
                >
                  <span
                    className="w-[30px] shrink-0 text-[10px] tracking-[0.1em]"
                    style={{ color: PHASE_COLOR[c.phase] }}
                  >
                    {PHASE_SHORT[c.phase]}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <span
                        className="truncate text-[13px]"
                        style={{
                          color: overhead ? "var(--alert)" : "var(--text)",
                        }}
                      >
                        {c.callsign}
                      </span>
                      {operator && (
                        <span className="truncate text-[11px] text-[var(--text-dim)]">
                          {operator}
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 flex items-center gap-2 text-[11px] text-[var(--text-faint)]">
                      <span className="truncate">
                        {e?.icaoType ?? e?.type ?? "type unknown"}
                      </span>
                      {route && <span className="truncate">{route}</span>}
                    </span>
                  </span>

                  <span className="shrink-0 text-right">
                    <span className="block text-[12px] text-[var(--text-dim)]">
                      {flightLevel(c.baroAltitudeM)}
                    </span>
                    <span
                      className="mt-0.5 block text-[11px]"
                      style={{
                        color: overhead
                          ? "var(--alert)"
                          : "var(--text-faint)",
                      }}
                    >
                      {c.distanceKm.toFixed(1)} km
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
