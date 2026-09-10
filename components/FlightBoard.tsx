"use client";

import { useEffect, useRef, useState } from "react";
import {
  AirplaneLanding,
  AirplaneTakeoff,
  AirplaneInFlight,
  ArrowRight,
  BeerStein,
  X,
} from "@phosphor-icons/react/dist/ssr";
import { PHASE_LABEL } from "@/lib/classify";
import { decodeCallsign, categoryLabel, squawkInfo } from "@/lib/aircraft";
import type { Contact, FlightPhase } from "@/lib/types";
import { AircraftFacts } from "./AircraftFacts";
import { IdentityCodes, RouteNote } from "./CardExplainers";
import { LiveNumbers } from "./LiveNumbers";

const PHASE_COLOR: Record<FlightPhase, string> = {
  arriving: "var(--color-accent-ink)",
  departing: "var(--color-depart)",
  overflight: "var(--color-ink-dim)",
  unknown: "var(--color-ink-dim)",
};

/**
 * Arrivals and departures are the board's headline event, so they get a solid
 * banner, and the whole card takes on a tint of the same colour.
 */
const PHASE_BANNER: Partial<Record<FlightPhase, { bg: string; fg: string }>> = {
  arriving: { bg: "var(--color-accent)", fg: "var(--color-on-accent)" },
  departing: { bg: "var(--color-depart)", fg: "var(--color-on-depart)" },
};

/** Takes its colour from the surrounding text. */
function PhaseIcon({ phase, size }: { phase: FlightPhase; size: number }) {
  const props = { size, weight: "bold" as const };
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

/**
 * Time the board spends fading out the old content before the new content
 * swaps in. Must match the `.board-swap` transition duration in
 * globals.css.
 */
const BOARD_SWAP_MS = 200;

export function FlightBoard({
  contact,
  overhead,
  pinned,
  onClear,
  emptyTitle,
  emptyText,
}: {
  contact: Contact | null;
  overhead: boolean;
  pinned: boolean;
  onClear: () => void;
  emptyTitle: string;
  emptyText: string;
}) {
  // What is actually on screen right now. It lags `contact` by one swap
  // cycle when the flight identity changes, so the old content stays put
  // for the leave animation instead of vanishing the instant a new flight
  // takes over the board.
  const [shown, setShown] = useState(contact);
  const [shownOverhead, setShownOverhead] = useState(overhead);
  const [shownPinned, setShownPinned] = useState(pinned);
  const [phase, setPhase] = useState<"idle" | "leaving" | "entering">("idle");
  /** The flight id currently on screen — only this identity change animates. */
  const shownId = useRef<string | null>(contact?.id ?? null);

  useEffect(() => {
    const nextId = contact?.id ?? null;
    if (nextId === shownId.current) {
      // Same flight (or still empty): just refresh the live numbers.
      setShown(contact);
      setShownOverhead(overhead);
      setShownPinned(pinned);
      return;
    }
    // A different flight (or the empty state) is taking over the board:
    // fade the current content out, then swap and fade the new content in.
    setPhase("leaving");
    const timer = setTimeout(() => {
      shownId.current = nextId;
      setShown(contact);
      setShownOverhead(overhead);
      setShownPinned(pinned);
      setPhase("entering");
      // Paint the entering (offset, transparent) state once before flipping
      // to idle, so the browser has something to transition away from.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setPhase("idle"));
      });
    }, BOARD_SWAP_MS);
    return () => clearTimeout(timer);
  }, [contact, overhead, pinned]);

  const swapClass =
    phase === "leaving" ? "board-leave" : phase === "entering" ? "board-enter" : "";

  if (!shown) {
    return (
      <div
        className={`panel board-swap ${swapClass} flex min-h-[260px] flex-col items-center justify-center gap-3 p-6`}
      >
        <BeerStein size={26} weight="bold" className="text-accent-ink" />
        <p className="text-[15px] tracking-[0.2em] text-ink-dim">{emptyTitle}</p>
        <p className="max-w-[38ch] text-center text-[13.5px] leading-relaxed text-ink-faint">
          {emptyText}
        </p>
      </div>
    );
  }

  const e = shown.enrichment;
  const cs = decodeCallsign(shown.callsign);
  const color = PHASE_COLOR[shown.phase];
  const squawk = squawkInfo(shown.squawk);
  const category = categoryLabel(shown.category);

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

  const banner = PHASE_BANNER[shown.phase];

  return (
    <div
      className={`panel board-swap ${swapClass} flex flex-col`}
      style={
        banner
          ? {
              borderColor: banner.bg,
              background: `color-mix(in srgb, ${banner.bg} 7%, var(--color-surface))`,
            }
          : undefined
      }
    >
      {/* Phase header: a solid banner for arrivals and departures, a
          coloured rule for anything else. */}
      <div
        className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-5 ${
          banner ? "py-4" : "border-b border-line py-3"
        }`}
        style={
          banner
            ? { background: banner.bg, color: banner.fg }
            : { borderLeft: `4px solid ${color}`, color }
        }
      >
        <span className={shownOverhead ? "pulse-soft" : undefined}>
          <PhaseIcon phase={shown.phase} size={banner ? 30 : 22} />
        </span>
        <span
          className={`whitespace-nowrap leading-none ${
            banner
              ? "text-[22px] font-semibold tracking-[0.2em] md:text-[26px]"
              : "text-[15px] tracking-[0.28em]"
          }`}
        >
          {PHASE_LABEL[shown.phase]}
        </span>

        {shownOverhead && (
          <span
            className={`whitespace-nowrap px-2 py-0.5 text-[11.5px] tracking-[0.2em] ${
              banner ? "font-semibold" : "border border-alert text-alert"
            }`}
            // Inverted on the banner: red on gold is too low-contrast.
            style={
              banner ? { background: banner.fg, color: banner.bg } : undefined
            }
          >
            OVERHEAD NOW
          </span>
        )}
        {squawk?.emergency && (
          <span className="whitespace-nowrap border border-alert bg-alert px-2 py-0.5 text-[11.5px] tracking-[0.2em] text-canvas">
            {squawk.label.toUpperCase()}
          </span>
        )}

        <span className="ml-auto flex items-center gap-3">
          <span
            className={`text-[11.5px] tracking-[0.2em] ${
              banner ? "opacity-70" : "text-ink-faint"
            }`}
          >
            {shownPinned ? "PINNED" : "AUTO"}
          </span>
          {shownPinned && (
            <button
              type="button"
              onClick={onClear}
              className="chip flex items-center gap-1.5"
              style={
                banner
                  ? { borderColor: banner.fg, color: banner.fg }
                  : undefined
              }
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
          </div>
          {e?.photoThumbUrl && (
            <AircraftPhoto
              src={e.photoThumbUrl}
              alt={`${typeLine || "Aircraft"} in flight`}
            />
          )}
        </div>

        {/* What every code on the identity line means */}
        <IdentityCodes contact={shown} />

        {/* Route */}
        {e?.origin || e?.destination ? (
          <div className="border-y border-line py-4">
            <div className="flex items-center gap-4">
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
            {e?.staleRoute && (
              <p className="mt-2.5 text-[12.5px] leading-snug text-ink-faint">
                The route on file for this flight number ({e.staleRoute}) is
                out of date, so only the Ottawa end is shown.
              </p>
            )}
          </div>
        ) : (
          <p className="border-y border-line py-4 text-[13.5px] text-ink-faint">
            No route filed for this callsign.
          </p>
        )}

        <RouteNote />

        {/* Live numbers, each with a plain-language explainer */}
        <LiveNumbers contact={shown} tone={color} overhead={shownOverhead} />

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
