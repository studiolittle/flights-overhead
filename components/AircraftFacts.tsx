"use client";

import { factsFor } from "@/lib/facts";

/** Strip a trailing parenthetical, e.g. "1994 (A321neo: 2017)" -> "1994". */
function shortYear(service: string): string {
  return service.replace(/\s*\(.*\)\s*$/, "").trim();
}

export function AircraftFacts({
  icaoType,
}: {
  icaoType: string | null | undefined;
}) {
  const f = factsFor(icaoType);
  if (!f) return null;

  const meta = [
    `${f.manufacturer} ${f.name}`,
    f.category,
    f.service ? `in service since ${shortYear(f.service)}` : null,
  ]
    .filter(Boolean)
    .join("  ·  ");

  return (
    <div className="border-t border-line pt-4">
      <p className="text-[11.5px] tracking-[0.18em] text-ink-faint">
        PLANE FACTS
      </p>
      <p className="mt-1.5 text-[13.5px] text-ink-dim">{meta}</p>
      {f.operators && (
        <p className="mt-0.5 text-[12.5px] text-ink-faint">
          Around Ottawa: {f.operators}
        </p>
      )}

      <div className="mt-3.5 flex flex-col gap-3 text-[14px] leading-relaxed text-ink">
        <p>{f.fact1}</p>
        {f.fact2 && <p>{f.fact2}</p>}
      </div>

      {f.note && (
        <p className="mt-3.5 border-l-2 border-line-strong pl-3 text-[12.5px] leading-relaxed text-ink-dim">
          {f.note}
        </p>
      )}
    </div>
  );
}
