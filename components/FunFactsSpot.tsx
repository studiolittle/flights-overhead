"use client";

import { useEffect, useId, useRef } from "react";
import { HandTap, Lightbulb, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import type { Contact } from "@/lib/types";
import { FlightBoard } from "./FlightBoard";
import { SectionHeader } from "./SectionHeader";

/** About 500 ft/min: below this a climb or descent is just levelling off. */
const STEEP_MS = 2.5;

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
 */
export function FunFactsSpot({
  selected,
  featured,
  onClear,
  state,
}: {
  /** The flight tapped on the radar. */
  selected: Contact | null;
  /** The nearest flight, whose fun facts show when nothing is tapped. */
  featured: Contact | null;
  onClear: () => void;
  /** Where the feed is: first load, unreachable, or running. */
  state: "loading" | "offline" | "ready";
}) {
  const headingId = useId();

  // Bring a newly tapped flight's card into view if the tap left it partly
  // off screen.
  const ref = useRef<HTMLElement>(null);
  const selectedId = selected?.id ?? null;
  useEffect(() => {
    const el = ref.current;
    if (!selectedId || !el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
  }, [selectedId]);

  const aircraft = selected ?? featured;
  const status = aircraft
    ? `${selected ? "Selected" : "Featured"} · ${phaseLabel(aircraft)}`
    : null;

  return (
    <section
      ref={ref}
      aria-labelledby={headingId}
      className="panel flex scroll-mt-4 flex-col"
    >
      <SectionHeader
        id={headingId}
        title="Aircraft spotlight"
        icon={<Lightbulb size={18} weight="bold" />}
        aside={status}
      />

      {aircraft ? (
        <FlightBoard variant="picked" slot={aircraft.phase === "departing" ? "departing" : "arriving"} contact={aircraft} onClear={selected ? onClear : undefined} emptyText="" />
      ) : (
        <p className="flex items-start gap-2.5 px-5 py-4 text-[length:var(--type-small)] leading-snug text-ink-dim">
          {state === "offline" ? (
            <WarningCircle size={20} weight="bold" className="mt-0.5 shrink-0 text-depart" />
          ) : (
            <HandTap size={20} weight="bold" className="mt-0.5 shrink-0 text-accent-ink" />
          )}
          {state === "loading"
            ? "Listening for aircraft…"
            : state === "offline"
              ? "No flight data yet. Once the feed is back, tap any plane for its flight and fun facts."
              : "Quiet sky. When a plane comes into range, its flight and fun facts appear here."}
        </p>
      )}
    </section>
  );
}
