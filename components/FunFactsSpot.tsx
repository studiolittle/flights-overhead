"use client";

import { useEffect, useId, useRef } from "react";
import { HandTap, Lightbulb } from "@phosphor-icons/react/dist/ssr";
import type { Contact } from "@/lib/types";
import { FlightBoard } from "./FlightBoard";
import { SectionHeader } from "./SectionHeader";

/**
 * The Fun Facts section: the full card for the flight you tapped on the
 * radar, otherwise the nearest flight's fun facts, otherwise a hint to tap
 * a plane.
 */
export function FunFactsSpot({
  selected,
  featured,
  onClear,
}: {
  /** The flight tapped on the radar. */
  selected: Contact | null;
  /** The nearest flight, whose fun facts show when nothing is tapped. */
  featured: Contact | null;
  onClear: () => void;
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
    ? `${selected ? "Selected" : "Featured"} · ${aircraft.phase === "departing" ? "Departing" : aircraft.phase === "arriving" ? "Arriving" : "Nearby"}`
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
        <FlightBoard variant="picked" slot={aircraft.phase === "departing" ? "departing" : "arriving"} contact={aircraft} overhead={aircraft.overhead ?? false} onClear={selected ? onClear : undefined} emptyText="" />
      ) : (
        <p className="flex items-center gap-2.5 px-5 py-4 text-[length:var(--type-0)] leading-snug text-ink-dim">
          <HandTap size={20} weight="bold" className="shrink-0 text-accent-ink" />
          Tap any plane on the radar for its flight and fun facts.
        </p>
      )}
    </section>
  );
}
