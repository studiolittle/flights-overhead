"use client";

import { Lightbulb } from "@phosphor-icons/react/dist/ssr";
import { factsFor, firstYear } from "@/lib/facts";

/**
 * Fun facts about the aircraft type: the part of the card people come for,
 * so it is never folded away, even on the compact boards.
 */
export function AircraftFacts({
  icaoType,
}: {
  icaoType: string | null | undefined;
}) {
  const f = factsFor(icaoType);
  if (!f) return null;

  const meta = [
    f.category,
    `In service since ${firstYear(f.service)}`,
    f.operators ? `Seen at YOW: ${f.operators}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="border-t border-line pt-3.5">
      <p className="flex items-center gap-2 text-[11.5px] tracking-[0.2em] text-accent-ink">
        <Lightbulb size={14} weight="bold" className="shrink-0" />
        FUN FACTS · {f.name.toUpperCase()}
      </p>
      <div className="mt-2.5 flex flex-col gap-2.5 text-[14px] leading-relaxed text-ink">
        <p>{f.fact1}</p>
        {f.fact2 && <p>{f.fact2}</p>}
      </div>
      {f.note && (
        <p className="mt-2.5 border-l-2 border-accent pl-3 text-[12.5px] leading-relaxed text-ink-dim">
          {f.note}
        </p>
      )}
      <p className="mt-2.5 text-[12px] leading-snug text-ink-faint">{meta}</p>
    </div>
  );
}
