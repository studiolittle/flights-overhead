"use client";

import { factsFor } from "@/lib/facts";
import { FieldRow } from "./Explainer";

/** Just the leading 4-digit year, e.g. "1994 (A321neo: 2017)" -> "1994". */
function firstYear(service: string): string {
  return service.match(/\d{4}/)?.[0] ?? service;
}

/** A one-line, plain-language read on the aircraft class. */
function classBlurb(category: string): string {
  if (/narrowbody/i.test(category))
    return "One aisle down the middle. Narrowbodies fly most of the short and medium hops over Ottawa.";
  if (/widebody/i.test(category))
    return "Two aisles, closer to a small cinema inside. Widebodies are the long-haul ocean crossers.";
  if (/regional/i.test(category))
    return "A smaller jet for thinner routes, feeding passengers into a big hub like Toronto or Montréal.";
  if (/turboprop/i.test(category))
    return "Propellers spun by jet engines. Efficient and quick to turn around on short regional routes.";
  if (/business jet/i.test(category))
    return "A private jet, chartered or company-owned, flying on demand rather than a schedule.";
  if (/helicopter/i.test(category))
    return "Rotary-wing. Police, medical, and utility work rather than scheduled passenger flights.";
  if (/military/i.test(category))
    return "A military aircraft, usually transport or VIP work in and out of Ottawa.";
  if (/(trainer|\bGA\b|general aviation)/i.test(category))
    return "Light general-aviation aircraft, the kind most pilots learn to fly on.";
  return `${category}.`;
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

      <div className="mt-1">
        <FieldRow
          label="CLASS"
          value={f.category}
          blurb={classBlurb(f.category)}
          more={
            <>
              The big split is narrowbody versus widebody: one aisle or two.
              Narrowbodies (737, A320, A220) dominate North American skies;
              widebodies (777, 787, A330) are built for range and cross oceans.{" "}
              <strong>
                If you had to turn sideways to pass the drinks cart, you were on
                a narrowbody.
              </strong>
            </>
          }
        />

        <FieldRow
          label="ENTERED SERVICE"
          value={`Since ${firstYear(f.service)}`}
          blurb="The year this model first flew passengers — not the age of the specific plane overhead, which may be far newer."
          more={
            <>
              Aircraft designs stay in production for decades. The Boeing 737
              first carried passengers in 1968 and new ones still roll out of the
              factory. <strong>An old design does not mean an old plane</strong>{" "}
              &mdash; the one overhead might have left the line last year.
            </>
          }
        />

        {f.operators && (
          <FieldRow
            label="SEEN AT YOW"
            value={f.operators}
            blurb="The airlines that usually fly this type here. Type plus operator is most of a plane-spot from the ground."
            more={
              <>
                Once you know Air Canada flies A220s out of Ottawa, a white jet
                with a red tail and two engines on a Toronto heading is a good
                guess before you even open the app.
              </>
            }
          />
        )}
      </div>

      <h3 className="mt-5 text-[19px] font-semibold tracking-[0.01em] text-ink">
        Interesting facts about this plane
      </h3>
      <div className="mt-2.5 flex flex-col gap-3 text-[14px] leading-relaxed text-ink">
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
