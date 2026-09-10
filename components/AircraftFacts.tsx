"use client";

import { factsFor } from "@/lib/facts";

/** Just the leading 4-digit year, e.g. "1994 (A321neo: 2017)" -> "1994". */
function firstYear(service: string): string {
  return service.match(/\d{4}/)?.[0] ?? service;
}

/**
 * Fun facts about the aircraft type. Always shown in full: learning is the
 * point of the app, so this is never folded away.
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
    <div className="border-t border-line pt-4">
      <p className="text-[11.5px] tracking-[0.18em] text-ink-faint">
        FUN FACTS · <span className="text-ink-dim">{f.name.toUpperCase()}</span>
      </p>
      <p className="mt-1.5 text-[12.5px] leading-snug text-ink-faint">{meta}</p>
      <div className="mt-3 flex flex-col gap-2.5 text-[14px] leading-relaxed text-ink">
        <p>{f.fact1}</p>
        {f.fact2 && <p>{f.fact2}</p>}
      </div>
      {f.note && (
        <p className="mt-3 border-l-2 border-line-strong pl-3 text-[12.5px] leading-relaxed text-ink-dim">
          {f.note}
        </p>
      )}
    </div>
  );
}
