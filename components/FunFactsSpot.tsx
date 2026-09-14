"use client";

import { useEffect, useId, useRef } from "react";
import { HandTap, Lightbulb } from "@phosphor-icons/react/dist/ssr";
import { flightTitle } from "@/lib/aircraft";
import { factsFor } from "@/lib/facts";
import type { Contact } from "@/lib/types";
import { AircraftFacts } from "./AircraftFacts";
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

  const featuredFacts = factsFor(featured?.enrichment?.icaoType);
  const showFeatured = !selected && featured && featuredFacts;

  const status = selected
    ? "SELECTED"
    : showFeatured
      ? featured.phase === "departing"
        ? "NEAREST DEPARTURE"
        : "NEAREST ARRIVAL"
      : null;

  return (
    <section
      ref={ref}
      aria-labelledby={headingId}
      className="panel flex scroll-mt-4 flex-col"
    >
      <SectionHeader
        id={headingId}
        title="FUN FACTS"
        icon={<Lightbulb size={18} weight="bold" />}
        aside={status}
      />

      {selected ? (
        <FlightBoard
          variant="picked"
          slot={selected.phase === "departing" ? "departing" : "arriving"}
          contact={selected}
          overhead={selected.overhead ?? false}
          onClear={onClear}
          emptyText=""
        />
      ) : showFeatured ? (
        <div className="px-5 py-4">
          <h3 className="text-[17px] leading-snug text-ink">
            {flightTitle(featured)}
          </h3>
          <div className="mt-3">
            <AircraftFacts icaoType={featured.enrichment?.icaoType} />
          </div>
          <p className="mt-3 flex items-center gap-2 text-[12.5px] leading-snug text-ink-faint">
            <HandTap size={16} weight="bold" className="shrink-0 text-accent-ink" />
            Tap any plane on the radar for its flight and fun facts.
          </p>
        </div>
      ) : (
        <p className="flex items-center gap-2.5 px-5 py-4 text-[13.5px] leading-snug text-ink-dim">
          <HandTap size={20} weight="bold" className="shrink-0 text-accent-ink" />
          Tap any plane on the radar for its flight and fun facts.
        </p>
      )}
    </section>
  );
}
