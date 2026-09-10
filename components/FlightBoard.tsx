"use client";

import { useState } from "react";
import {
  AirplaneLanding,
  AirplaneTakeoff,
  AirplaneInFlight,
  ArrowRight,
  X,
} from "@phosphor-icons/react/dist/ssr";
import { PHASE_LABEL } from "@/lib/classify";
import { decodeCallsign, categoryLabel, squawkInfo } from "@/lib/aircraft";
import { compass16, flightLevel, msToFpm, msToKt } from "@/lib/format";
import type { Contact, FlightPhase } from "@/lib/types";
import { AircraftFacts } from "./AircraftFacts";

const PHASE_COLOR: Record<FlightPhase, string> = {
  arriving: "var(--color-accent-ink)",
  departing: "var(--color-depart)",
  overflight: "var(--color-ink-dim)",
  unknown: "var(--color-ink-dim)",
};

function PhaseIcon({ phase, color }: { phase: FlightPhase; color: string }) {
  const props = { size: 22, weight: "bold" as const, style: { color } };
  if (phase === "arriving") return <AirplaneLanding {...props} />;
  if (phase === "departing") return <AirplaneTakeoff {...props} />;
  return <AirplaneInFlight {...props} />;
}

function AircraftPhoto({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
      className="h-[76px] w-[124px] border border-line object-cover"
    />
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11.5px] tracking-[0.18em] text-ink-faint">
        {label}
      </span>
      <span
        className="text-[17px] leading-none"
        style={{ color: tone ?? "var(--color-ink)" }}
      >
        {value}
      </span>
    </div>
  );
}

export function FlightBoard({
  contact,
  overhead,
  pinned,
  onClear,
}: {
  contact: Contact | null;
  overhead: boolean;
  pinned: boolean;
  onClear: () => void;
}) {
  if (!contact) {
    return (
      <div className="panel flex min-h-[260px] flex-col items-center justify-center gap-3 p-6">
        <AirplaneInFlight
          size={26}
          weight="bold"
          className="text-ink-faint"
        />
        <p className="text-[15px] tracking-[0.2em] text-ink-dim">NOTHING IN RANGE</p>
        <p className="max-w-[38ch] text-center text-[13.5px] leading-relaxed text-ink-faint">
          When an aircraft comes within range it appears here with its type and
          route. Widen the range if your area is quiet.
        </p>
      </div>
    );
  }

  const e = contact.enrichment;
  const cs = decodeCallsign(contact.callsign);
  const color = PHASE_COLOR[contact.phase];
  const kt = msToKt(contact.velocityMs);
  const fpm = msToFpm(contact.verticalRateMs);
  const vs = contact.verticalRateMs ?? 0;
  const vsArrow = vs > 0.5 ? "climb" : vs < -0.5 ? "descend" : "level";
  const squawk = squawkInfo(contact.squawk);
  const category = categoryLabel(contact.category);

  // The curated designator table wins: adsbdb occasionally maps a prefix to a
  // different carrier that shares it (ROU comes back as a Chilean airline).
  const operator = cs.operator ?? e?.airlineName ?? e?.owner ?? null;
  const title =
    operator && cs.flightNumber ? `${operator} ${cs.flightNumber}` : cs.label;

  const typeLine = [
    e?.manufacturer && e?.type
      ? `${e.manufacturer} ${e.type}`
      : (e?.type ?? e?.icaoType ?? category),
    e?.registration,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="panel flex flex-col">
      {/* Phase header */}
      <div
        className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-5 py-3"
        style={{ borderLeft: `4px solid ${color}` }}
      >
        <span className={overhead ? "pulse-soft" : undefined}>
          <PhaseIcon phase={contact.phase} color={color} />
        </span>
        <span
          className="whitespace-nowrap text-[15px] tracking-[0.28em]"
          style={{ color }}
        >
          {PHASE_LABEL[contact.phase]}
        </span>

        {overhead && (
          <span className="whitespace-nowrap border border-alert px-2 py-0.5 text-[11.5px] tracking-[0.2em] text-alert">
            OVERHEAD NOW
          </span>
        )}
        {squawk?.emergency && (
          <span className="whitespace-nowrap border border-alert bg-alert px-2 py-0.5 text-[11.5px] tracking-[0.2em] text-canvas">
            {squawk.label.toUpperCase()}
          </span>
        )}

        <span className="ml-auto flex items-center gap-3">
          <span className="text-[11.5px] tracking-[0.2em] text-ink-faint">
            {pinned ? "PINNED" : "AUTO"}
          </span>
          {pinned && (
            <button
              type="button"
              onClick={onClear}
              className="chip flex items-center gap-1.5"
            >
              <X size={11} weight="bold" />
              CLEAR
            </button>
          )}
        </span>
      </div>

      <div className="flex flex-col gap-5 p-5">
        {/* Identity */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-[26px] leading-[1.12] text-pretty break-words text-ink md:text-[34px]">
              {title}
            </h2>
            <p className="mt-1.5 text-[13.5px] text-ink-dim">
              {typeLine || "Aircraft type unavailable"}
            </p>
            <p className="mt-1 text-[12.5px] text-ink-faint">
              {[contact.callsign, contact.icao24.toUpperCase(), category]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          {e?.photoThumbUrl && (
            <AircraftPhoto
              src={e.photoThumbUrl}
              alt={`${typeLine || "Aircraft"} in flight`}
            />
          )}
        </div>

        {/* Route */}
        {e?.origin || e?.destination ? (
          <div className="flex items-center gap-4 border-y border-line py-4">
            <Endpoint
              code={e?.origin?.iata ?? e?.origin?.icao}
              city={e?.origin?.municipality ?? e?.origin?.name}
            />
            <ArrowRight
              size={20}
              weight="bold"
              className="shrink-0 text-ink-faint"
            />
            <Endpoint
              code={e?.destination?.iata ?? e?.destination?.icao}
              city={e?.destination?.municipality ?? e?.destination?.name}
            />
          </div>
        ) : (
          <p className="border-y border-line py-4 text-[13.5px] text-ink-faint">
            No route filed for this callsign.
          </p>
        )}

        {/* Live numbers */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
          <Stat label="ALTITUDE" value={flightLevel(contact.baroAltitudeM)} />
          <Stat
            label="GROUND SPEED"
            value={kt != null ? `${Math.round(kt)} kt` : "--"}
          />
          <Stat
            label={
              vsArrow === "descend"
                ? "DESCENDING"
                : vsArrow === "climb"
                  ? "CLIMBING"
                  : "VERTICAL"
            }
            value={fpm != null ? `${Math.abs(Math.round(fpm))} fpm` : "--"}
            tone={vsArrow === "level" ? undefined : color}
          />
          <Stat
            label="DISTANCE"
            value={`${contact.distanceKm.toFixed(1)} km ${compass16(contact.bearingDeg)}`}
            tone={overhead ? "var(--color-alert)" : undefined}
          />
        </div>

        {/* Fun facts about this aircraft type */}
        <AircraftFacts icaoType={e?.icaoType} />
      </div>
    </div>
  );
}

function Endpoint({
  code,
  city,
}: {
  code: string | null | undefined;
  city: string | null | undefined;
}) {
  return (
    <div className="min-w-0 flex-1">
      <p className="text-[23px] leading-none text-ink">{code ?? "???"}</p>
      <p className="mt-1.5 truncate text-[12.5px] text-ink-dim">
        {city ?? "Unknown"}
      </p>
    </div>
  );
}
