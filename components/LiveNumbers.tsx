"use client";

import { compass16, flightLevel, metersToFt, msToFpm, msToKt } from "@/lib/format";
import type { Contact } from "@/lib/types";
import { ExplainerSection, FieldRow } from "./Explainer";

/** knots -> km/h */
const KT_TO_KMH = 1.852;
/** Height of the CN Tower, feet — the yardstick for a climb rate. */
const CN_TOWER_FT = 1815;
/** Speed of sound at ground level, metres per second. */
const SOUND_MS = 343;

const COMPASS_WORDS: Record<string, string> = {
  N: "north",
  NNE: "north-northeast",
  NE: "northeast",
  ENE: "east-northeast",
  E: "east",
  ESE: "east-southeast",
  SE: "southeast",
  SSE: "south-southeast",
  S: "south",
  SSW: "south-southwest",
  SW: "southwest",
  WSW: "west-southwest",
  W: "west",
  WNW: "west-northwest",
  NW: "northwest",
  NNW: "north-northwest",
};

function round100(n: number): number {
  return Math.round(n / 100) * 100;
}

export function LiveNumbers({
  contact,
  tone,
  overhead,
}: {
  contact: Contact;
  tone: string;
  overhead: boolean;
}) {
  const ft = metersToFt(contact.baroAltitudeM);
  const kt = msToKt(contact.velocityMs);
  const kmh = kt == null ? null : kt * KT_TO_KMH;
  const fpm = msToFpm(contact.verticalRateMs);
  const vs = contact.verticalRateMs ?? 0;
  const climbing = vs > 0.5;
  const descending = vs < -0.5;
  const absFpm = fpm == null ? null : Math.abs(Math.round(fpm));

  const km = contact.distanceKm;
  const dirAbbr = compass16(contact.bearingDeg);
  const dirWord = COMPASS_WORDS[dirAbbr] ?? dirAbbr;
  const soundS = Math.round((km * 1000) / SOUND_MS);

  return (
    <ExplainerSection title="THE LIVE NUMBERS">
      <FieldRow
        label="ALTITUDE"
        value={flightLevel(contact.baroAltitudeM)}
        blurb={
          ft == null ? (
            "This aircraft is not reporting its height right now."
          ) : (
            <>
              {round100(ft).toLocaleString()} ft above sea level. A cruising
              airliner sits near 35,000 ft, so lower means closer to an airport
              &mdash; taking off, landing, or holding.
            </>
          )
        }
        more={
          <>
            Height is read in hundreds of feet. Below 18,000 ft in Canada it is
            just an altitude; above that, every crew resets their altimeter to
            one shared setting and calls it a <strong>flight level</strong>, so{" "}
            <strong>FL350</strong> is 35,000 ft. Up at cruise the air is thin
            enough to save fuel and about &minus;55&nbsp;&deg;C.
          </>
        }
      />

      <FieldRow
        label="GROUND SPEED"
        value={kt == null ? "--" : `${Math.round(kt)} kt`}
        blurb={
          kmh == null ? (
            "No speed is coming through for this aircraft."
          ) : (
            <>
              About {Math.round(kmh).toLocaleString()} km/h &mdash; roughly{" "}
              {(kmh / 100).toFixed(1)}&times; the 100 km/h limit on Highway 417.
              A knot is the sea-and-sky version of km/h.
            </>
          )
        }
        more={
          <>
            One knot is one nautical mile per hour, and a nautical mile is one
            minute of latitude on the globe, which keeps navigation tidy. Sailors
            used it first; pilots inherited it. This is speed{" "}
            <strong>over the ground</strong>, not through the air, so a strong
            tailwind can make a plane look faster than it is really flying.
          </>
        }
      />

      <FieldRow
        label={climbing ? "CLIMBING" : descending ? "DESCENDING" : "VERTICAL"}
        value={absFpm == null ? "--" : `${absFpm.toLocaleString()} fpm`}
        tone={climbing || descending ? tone : undefined}
        blurb={
          absFpm == null ? (
            "Climb and descent rate is not being reported."
          ) : climbing ? (
            <>
              Gaining about {absFpm.toLocaleString()} feet a minute &mdash; it
              would pass the top of the CN Tower (1,815 ft) in about{" "}
              {Math.max(1, Math.round((CN_TOWER_FT / absFpm) * 60))} seconds.
            </>
          ) : descending ? (
            <>
              Losing about {absFpm.toLocaleString()} feet a minute on its way
              down toward the ground.
            </>
          ) : (
            "Holding a steady height, climbing or sinking less than 100 feet a minute."
          )
        }
        more={
          <>
            &ldquo;fpm&rdquo; is feet per minute. The steepest climbs come just
            after take-off, when a plane wants out of the busy air near the
            airport. A gentle sink of 500&ndash;800 fpm is a normal approach.{" "}
            <strong>A big negative number far from any airport is unusual.</strong>
          </>
        }
      />

      <FieldRow
        label="DISTANCE"
        value={`${km.toFixed(1)} km ${dirAbbr}`}
        tone={overhead ? "var(--color-alert)" : undefined}
        blurb={
          overhead ? (
            <>
              Just about straight up. The engine noise you hear is coming from
              where it was a few seconds ago, not where it is now.
            </>
          ) : (
            <>
              {km.toFixed(1)} km away, off to the {dirWord}. Sound is slow: you
              would hear it about {soundS.toLocaleString()} second
              {soundS === 1 ? "" : "s"} after it passed overhead.
            </>
          )
        }
        more={
          <>
            The compass point is measured from your saved spot, not from the
            airport. Sound covers about one kilometre every three seconds, so
            anything more than a few kilometres out is always seen well before it
            is heard.
          </>
        }
      />
    </ExplainerSection>
  );
}
