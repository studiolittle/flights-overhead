"use client";

import { useEffect, useId, useRef } from "react";
import { HandTap, Lightbulb, WarningCircle, X } from "@phosphor-icons/react/dist/ssr";
import type { Contact } from "@/lib/types";
import { FlightBoard } from "./FlightBoard";
import { SectionHeader } from "./SectionHeader";

/** About 500 ft/min: below this a climb or descent is just levelling off. */
const STEEP_MS = 2.5;

/** Below Tailwind's `lg`, where the spotlight docks as a sheet under the radar. */
const PHONE_QUERY = "(max-width: 1023.98px)";

/**
 * The phase the feed assigns can disagree with what the aircraft is doing
 * right now: a plane "arriving" that is climbing, say. Say "Nearby" then,
 * rather than contradict the live numbers beside it.
 */
function phaseLabel(c: Contact): string {
  const vs = c.verticalRateMs ?? 0;
  if (c.phase === "arriving") return vs > STEEP_MS ? "Nearby" : "Arriving";
  if (c.phase === "departing") return vs < -STEEP_MS ? "Nearby" : "Departing";
  return "Nearby";
}

/**
 * The Aircraft spotlight: the full card for the flight you tapped on the
 * radar, otherwise the nearest flight's fun facts, otherwise an honest note
 * about why there is nothing to show.
 *
 * On a phone a tapped flight docks as a sheet along the bottom of the screen
 * and the radar scrolls to the top, so the plane and its story are on screen
 * together.
 */
export function FunFactsSpot({
  radarId,
  selected,
  featured,
  onClear,
  state,
}: {
  /** The radar's element id: on a phone it scrolls up above the sheet. */
  radarId: string;
  /** The flight tapped on the radar. */
  selected: Contact | null;
  /** The nearest flight, whose fun facts show when nothing is tapped. */
  featured: Contact | null;
  onClear: () => void;
  /** Where the feed is: first load, unreachable, or running. */
  state: "loading" | "offline" | "ready";
}) {
  const headingId = useId();

  const ref = useRef<HTMLElement>(null);
  const selectedId = selected?.id ?? null;
  useEffect(() => {
    const el = ref.current;
    if (!selectedId || !el) return;
    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "auto"
      : "smooth";
    if (window.matchMedia(PHONE_QUERY).matches) {
      // The sheet holds the story; keep the radar in view above it.
      el.scrollTop = 0;
      document.getElementById(radarId)?.scrollIntoView({ block: "start", behavior });
    } else {
      el.scrollIntoView({ block: "nearest", behavior });
    }
  }, [selectedId, radarId]);

  // Escape puts the flight back, wherever focus is.
  useEffect(() => {
    if (!selectedId) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") onClear();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selectedId, onClear]);

  const aircraft = selected ?? featured;
  const status = aircraft ? (
    <>
      {/* The phone sheet is narrow: the phase alone keeps the header on one line. */}
      <span className="max-lg:hidden">{selected ? "Selected" : "Featured"} · </span>
      {phaseLabel(aircraft)}
    </>
  ) : null;

  return (
    <section
      ref={ref}
      aria-labelledby={headingId}
      className={`panel flex scroll-mt-4 flex-col ${selected ? "spot-sheet" : ""}`}
    >
      <SectionHeader
        id={headingId}
        title="Aircraft spotlight"
        icon={<Lightbulb size={18} weight="bold" />}
        aside={
          selected ? (
            <span className="flex items-center gap-2">
              <span>{status}</span>
              <button
                type="button"
                onClick={onClear}
                aria-label="Close this flight"
                className="chip -my-2 grid size-11 place-items-center p-0"
              >
                <X size={16} weight="bold" />
              </button>
            </span>
          ) : (
            status
          )
        }
      />

      {aircraft ? (
        <FlightBoard contact={aircraft} />
      ) : (
        <p className="flex items-start gap-2.5 px-5 py-4 text-[length:var(--type-small)] leading-snug text-ink-dim">
          {state === "offline" ? (
            <WarningCircle size={20} weight="bold" className="mt-0.5 shrink-0 text-alert" />
          ) : (
            <HandTap size={20} weight="bold" className="mt-0.5 shrink-0 text-accent-ink" />
          )}
          {state === "loading"
            ? "Listening for aircraft…"
            : state === "offline"
              ? "No flight data yet. Once the feed is back, tap any plane for its flight and fun facts."
              : "When a plane comes into range, its flight and fun facts appear here."}
        </p>
      )}
    </section>
  );
}
