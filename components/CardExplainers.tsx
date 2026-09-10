"use client";

import { categoryLabel, decodeCallsign } from "@/lib/aircraft";
import type { Contact } from "@/lib/types";
import { ExplainerSection, FieldRow } from "./Explainer";

/**
 * "Names & codes": the strings that identify the flight and the airframe,
 * each explained. Only rows the feed actually has data for are shown.
 */
export function IdentityCodes({ contact }: { contact: Contact }) {
  const e = contact.enrichment;
  const cs = decodeCallsign(contact.callsign);
  const prefix = contact.callsign.match(/^([A-Z]{3})\d/)?.[1] ?? null;
  const hasCallsign =
    !cs.isRegistration &&
    Boolean(contact.callsign) &&
    contact.callsign !== "UNKNOWN";
  const weightClass = categoryLabel(contact.category);

  return (
    <ExplainerSection title="NAMES & CODES">
      {cs.flightNumber && (
        <FieldRow
          label="FLIGHT NUMBER"
          value={cs.label}
          blurb="The name of the trip, not the plane — an airline reuses it every day, like a bus route."
          more={
            <>
              A flight number is a specific scheduled run; the aircraft assigned
              to it changes from day to day. Lower numbers tend to mark an
              airline&rsquo;s longer or more prestigious routes, which is why
              transatlantic flights are often just two digits.
            </>
          }
        />
      )}

      {hasCallsign && (
        <FieldRow
          label="CALLSIGN"
          value={contact.callsign}
          blurb={
            prefix && cs.operator
              ? `The flight in air-traffic-control shorthand — "${prefix}" is the code for ${cs.operator}.`
              : "What air traffic control types and logs for this flight."
          }
          more={
            <>
              Controllers need something short and unmistakable over a scratchy
              radio, so each airline gets a three-letter code &mdash; ACA for Air
              Canada, WJA for WestJet, JZA for Jazz. Out loud the pilot still says
              the airline&rsquo;s name and the number in full, because single
              letters get lost in static and <strong>words don&rsquo;t</strong>.
            </>
          }
        />
      )}

      {e?.registration && (
        <FieldRow
          label="REGISTRATION"
          value={e.registration}
          blurb="The airframe's tail number — its licence plate for life. Canadian ones start with C."
          more={
            <>
              Flight numbers change, planes don&rsquo;t. This code is painted
              near the tail and stays with the aircraft from the factory to the
              scrapyard, so spotters can follow one specific jet for decades.{" "}
              <strong>C is Canada, N the United States, G the UK.</strong>
            </>
          }
        />
      )}

      <FieldRow
        label="TRANSPONDER"
        value={contact.icao24.toUpperCase()}
        blurb="A one-of-a-kind ID the plane broadcasts about once a second. It's how this app keeps the dots apart."
        more={
          <>
            It is a 24-bit address, written in hexadecimal, baked into the
            aircraft&rsquo;s transponder and handed out by its home country.
            Anyone with a cheap antenna can pick up the broadcast, which is the
            whole reason backyard flight tracking exists &mdash;{" "}
            <strong>no radar dish required.</strong>
          </>
        }
      />

      {weightClass && (
        <FieldRow
          label="WEIGHT CLASS"
          value={weightClass}
          blurb="Roughly how heavy it is. Heavier aircraft get more space behind them on approach."
          more={
            <>
              A big aircraft sheds invisible horizontal whirlwinds off its
              wingtips &mdash; <strong>wake turbulence</strong> &mdash; that can
              roll a smaller plane flying through them, so controllers leave a
              bigger gap behind heavier traffic. This is the coarse bucket the
              aircraft broadcasts, not its exact weight today.
            </>
          }
        />
      )}
    </ExplainerSection>
  );
}

/** "The route": what airport codes are and why Canadian ones are so strange. */
export function RouteNote() {
  return (
    <ExplainerSection title="THE ROUTE">
      <FieldRow
        label="AIRPORT CODES"
        blurb="Three-letter tags for airports. YOW is Ottawa, YYZ is Toronto Pearson, YUL is Montréal."
        more={
          <>
            Almost every Canadian airport code starts with Y, left over from old
            telegraph practice where Y flagged an attached weather station. The
            rest is often inherited from a nearby railway or radio beacon &mdash;{" "}
            <strong>YYZ came from the Malton train station</strong>, which is why
            the Rush song is named that. The four-letter version (CYOW) is the
            international ICAO form pilots file.
          </>
        }
      />
    </ExplainerSection>
  );
}
