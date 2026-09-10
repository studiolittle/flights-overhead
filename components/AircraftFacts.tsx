"use client";

import { factsFor } from "@/lib/facts";

/** Just the leading 4-digit year, e.g. "1994 (A321neo: 2017)" -> "1994". */
function firstYear(service: string): string {
  return service.match(/\d{4}/)?.[0] ?? service;
}

function MetaBox({
  label,
  value,
  className = "",
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={`border border-line bg-surface-2 px-3 py-2 ${className}`}>
      <p className="text-[10.5px] tracking-[0.16em] text-ink-faint">{label}</p>
      <p className="mt-1 text-[13px] leading-snug text-ink">{value}</p>
    </div>
  );
}

export function AircraftFacts({
  icaoType,
}: {
  icaoType: string | null | undefined;
}) {
  const f = factsFor(icaoType);
  if (!f) return null;

  return (
    <div className="border-t border-line pt-4">
      <p className="text-[11.5px] tracking-[0.18em] text-ink-faint">
        ABOUT THIS AIRCRAFT
      </p>

      <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <MetaBox label="TYPE" value={f.category} />
        <MetaBox label="IN SERVICE" value={`Since ${firstYear(f.service)}`} />
        {f.operators && (
          <MetaBox
            label="AROUND OTTAWA"
            value={f.operators}
            className="col-span-2 sm:col-span-1"
          />
        )}
      </div>

      <h3 className="mt-4 text-[14px] font-medium tracking-[0.01em] text-ink">
        Interesting facts about this plane
      </h3>
      <div className="mt-2 flex flex-col gap-3 text-[14px] leading-relaxed text-ink">
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
