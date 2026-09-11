"use client";

import { GraduationCap } from "@phosphor-icons/react/dist/ssr";
import { categoryLabel, decodeCallsign, flightTitle } from "@/lib/aircraft";
import { factsFor, firstYear } from "@/lib/facts";
import { compass16, flightLevel, msToFpm, msToKt } from "@/lib/format";
import type { Contact } from "@/lib/types";
import { FieldRow, GlossarySection } from "./Explainer";

/** Tag values read off one flight; null wherever the feed has nothing. */
function flightTags(c: Contact | null) {
  if (!c) return {};
  const e = c.enrichment;
  const f = factsFor(e?.icaoType);
  const cs = c.callsign.trim().toUpperCase();
  const kt = msToKt(c.velocityMs);
  const fpm = msToFpm(c.verticalRateMs);
  const vs = c.verticalRateMs;
  const from = e?.origin?.iata ?? e?.origin?.icao;
  const to = e?.destination?.iata ?? e?.destination?.icao;
  return {
    flightNumber: decodeCallsign(c.callsign).flightNumber ? flightTitle(c) : null,
    callsign: cs && cs !== "UNKNOWN" ? cs : null,
    registration: e?.registration,
    transponder: c.icao24.toUpperCase(),
    weight: categoryLabel(c.category),
    route: from || to ? `${from ?? "???"} → ${to ?? "???"}` : null,
    altitude: c.baroAltitudeM != null ? flightLevel(c.baroAltitudeM) : null,
    speed: kt != null ? `${Math.round(kt)} kt` : null,
    vertical:
      vs == null || fpm == null
        ? null
        : Math.abs(vs) <= 0.5
          ? "level"
          : `${vs > 0 ? "climbing" : "descending"} ${Math.abs(Math.round(fpm)).toLocaleString()} fpm`,
    distance: `${c.distanceKm.toFixed(1)} km ${compass16(c.bearingDeg)}`,
    aircraftClass: f?.category,
    service: f ? `Since ${firstYear(f.service)}` : null,
    seenAt: f?.operators || null,
  };
}

/** A tag: the flight's own value when there is one, the stock example otherwise. */
function tag(live: string | null | undefined, stock: string) {
  return live ? { example: live, live: true } : { example: stock, live: false };
}

/**
 * A plain-language glossary for everything on the board, written for someone
 * who has never thought about aviation. The text is static on purpose: it
 * explains the terms, not a particular flight. Only the tags on the flight
 * terms follow the flight on the board, falling back to stock examples from
 * real YOW traffic.
 */
export function LearningCentre({ flight }: { flight: Contact | null }) {
  const t = flightTags(flight);
  return (
    <section className="panel flex flex-col">
      <div className="flex items-center gap-2.5 border-b border-line px-5 py-3">
        <GraduationCap size={18} weight="bold" className="text-accent-ink" />
        <span className="text-[15px] tracking-[0.28em] text-ink">
          LEARNING CENTRE
        </span>
      </div>

      <p className="px-5 pt-4 text-[13.5px] leading-relaxed text-ink-dim">
        New to planes? Every number and code on the board, in plain language.
        Open a topic to start.
      </p>
      {flight && (
        <p className="px-5 pt-2 text-[12.5px] leading-snug text-ink-faint">
          Highlighted tags are from{" "}
          <span className="text-accent-ink">{flightTitle(flight)}</span>, on
          the board now.
        </p>
      )}

      <div className="px-5 pb-1 pt-2">
        <GlossarySection
          title="NAMES & CODES"
          summary="How a flight, and the plane flying it, are identified"
        >
          <FieldRow
            label="FLIGHT NUMBER"
            {...tag(t.flightNumber, "Air Canada 461")}
            blurb="The name of the trip, not the plane. Like a bus route: same number, same journey, different bus each day."
            more={
              <>
                Airlines give every scheduled trip a number and reuse it daily.{" "}
                <strong>Air Canada 461</strong> is the same Ottawa to Toronto run
                whether the plane is brand new or fifteen years old. Lower numbers
                tend to mark longer or more prestigious routes, which is why
                transatlantic flights are often two digits.
              </>
            }
          />
          <FieldRow
            label="CALLSIGN"
            {...tag(t.callsign, "ACA461")}
            blurb="The same flight in the shorthand air traffic control uses. ACA is Air Canada's three-letter code."
            more={
              <>
                Controllers need something short and unmistakable over a crackly
                radio, so every airline gets a three-letter code: ACA is Air
                Canada, WJA is WestJet, JZA is Jazz. Out loud the pilot still says{" "}
                <strong>&ldquo;Air Canada four sixty-one&rdquo;</strong>, because
                letters get lost in static and words don&rsquo;t.
              </>
            }
          />
          <FieldRow
            label="REGISTRATION"
            {...tag(t.registration, "C-GJYI")}
            blurb="The plane's licence plate. Painted near the tail, and it belongs to that one aircraft for its whole life."
            more={
              <>
                Flight numbers change, planes don&rsquo;t. This code stays with
                the airframe from the factory to the scrapyard, which is how
                spotters follow one aircraft for decades.{" "}
                <strong>Every Canadian registration starts with C.</strong>{" "}
                American ones start with N, British ones with G.
              </>
            }
          />
          <FieldRow
            label="TRANSPONDER"
            {...tag(t.transponder, "C05EE5")}
            blurb="The plane's permanent ID, broadcast about once a second. It's how this app knows which dot is which."
            more={
              <>
                Every aircraft carries a box that announces its identity roughly
                once per second, and this code is the unique fingerprint in that
                signal. Anyone with a cheap antenna can pick it up, which is why
                flight tracking is a backyard hobby.{" "}
                <strong>No radar dish required.</strong>
              </>
            }
          />
          <FieldRow
            label="WEIGHT CLASS"
            {...tag(t.weight, "Large (75,000-300,000 lb)")}
            blurb="Roughly how heavy the plane is. A Large jet weighs about as much as 15 to 60 pickup trucks."
            more={
              <>
                Weight isn&rsquo;t trivia, it&rsquo;s spacing. Big aircraft leave
                invisible horizontal whirlwinds spinning off their wingtips,
                called <strong>wake turbulence</strong>, that can roll a smaller
                plane flying through them. So controllers leave bigger gaps
                behind heavier aircraft.
              </>
            }
          />
        </GlossarySection>

        <GlossarySection
          title="THE ROUTE"
          summary="Where it came from and where it's going"
        >
          <FieldRow
            label="AIRPORT CODES"
            {...tag(t.route, "YOW → YYZ")}
            blurb="Three-letter nicknames for airports. YOW is Ottawa, YYZ is Toronto Pearson."
            more={
              <>
                Almost every Canadian airport code starts with Y, a leftover from
                old radio and weather-station codes. The rest is often inherited
                from a nearby railway or radio station:{" "}
                <strong>YYZ came from the Malton train station</strong>, which is
                why a Rush song is named after it. The four-letter form, CYOW, is
                the international version pilots file.
              </>
            }
          />
        </GlossarySection>

        <GlossarySection
          title="THE LIVE NUMBERS"
          summary="Altitude, speed, climb rate and distance"
        >
          <FieldRow
            label="ALTITUDE"
            {...tag(t.altitude, "7,400 ft")}
            blurb="How high it is, in feet. 7,400 ft is about four CN Towers stacked on top of each other."
            more={
              <>
                Below 18,000 ft in Canada, height is shown in plain feet. Above
                that, every crew sets their altimeter to one shared standard and
                calls height a <strong>flight level</strong>, in hundreds of feet:
                FL350 is 35,000 ft. That&rsquo;s a typical cruise, where the air is
                thin enough to save fuel and about &minus;55&nbsp;&deg;C.
              </>
            }
          />
          <FieldRow
            label="GROUND SPEED"
            {...tag(t.speed, "238 kt")}
            blurb="How fast it's moving, in knots. 238 kt is about 440 km/h, or four times highway speed on the 417."
            more={
              <>
                A knot is one nautical mile per hour, and a nautical mile is one
                minute of latitude on the globe, which keeps navigation maths
                tidy. Sailors used it first; pilots inherited it. This is speed{" "}
                <strong>over the ground</strong>, not through the air, so a strong
                tailwind can make a plane look faster than it&rsquo;s flying.
              </>
            }
          />
          <FieldRow
            label="CLIMBING / DESCENDING"
            {...tag(t.vertical, "3,000 fpm")}
            blurb="How fast it's going up or down, in feet per minute. At 3,000 fpm it would pass the top of the CN Tower in about 36 seconds."
            more={
              <>
                The fastest climbs come right after takeoff, when a plane wants
                up and out of the busy airspace near the airport. A steady sink
                of 500 to 800 fpm is a normal approach to land.{" "}
                <strong>
                  A steep descent far from any airport would be unusual.
                </strong>
              </>
            }
          />
          <FieldRow
            label="DISTANCE"
            {...tag(t.distance, "18.0 km WNW")}
            blurb="How far it is from the airport, and which way to look. WNW is west, nudged toward north."
            more={
              <>
                Distance and direction are measured from the middle of Ottawa
                airport. Sound covers about a kilometre every
                three seconds, so a plane 18 km out is heard{" "}
                <strong>about a minute after you see it</strong>, and the noise
                comes from where it was, not where it is.
              </>
            }
          />
        </GlossarySection>

        <GlossarySection
          title="THE AIRCRAFT"
          summary="Sizes, shapes and how old a design is"
        >
          <FieldRow
            label="CLASS"
            {...tag(t.aircraftClass, "Narrowbody Jet")}
            blurb="One aisle down the middle. A widebody has two aisles and feels like a small cinema inside."
            more={
              <>
                Narrowbodies (737, A320, A220) do the short and medium hops and
                make up most of what passes over Ottawa. Widebodies (777, 787,
                A330) are the long-haul ocean crossers. Regional jets and
                turboprops are the smaller cousins on thinner routes.{" "}
                <strong>
                  If you had to walk sideways past the drinks cart, you were on a
                  narrowbody.
                </strong>
              </>
            }
          />
          <FieldRow
            label="ENTERED SERVICE"
            {...tag(t.service, "Since 2016")}
            blurb="The year the model started carrying passengers. Not the age of the plane overhead, which could be much newer."
            more={
              <>
                Aircraft designs stay in production for decades. The Boeing 737
                first flew passengers in 1968 and new ones still roll out of the
                factory. <strong>An old design doesn&rsquo;t mean an old plane.</strong>{" "}
                The one overhead might have left the factory last year.
              </>
            }
          />
          <FieldRow
            label="SEEN AT YOW"
            {...tag(t.seenAt, "Air Canada")}
            blurb="The airlines you'd normally see flying this type at Ottawa. Handy for spotting one from the ground."
            more={
              <>
                Type plus operator is most of what you need to identify a plane by
                eye. Once you know Air Canada flies A220s out of Ottawa, a small
                twin-engine jet with the maple leaf on its tail, heading for
                Toronto, is a good guess before you even open the app.
              </>
            }
          />
        </GlossarySection>

        <GlossarySection
          title="RUNWAYS & WEATHER"
          summary="Why runways have numbers, and how the wind picks one"
          defaultOpen
        >
          <FieldRow
            label="RUNWAY NUMBERS"
            example="RWY 32"
            blurb="Runways are named for the compass direction they point, last digit dropped. Runway 32 points at 320°, roughly northwest."
            more={
              <>
                The same strip of pavement is <strong>Runway 14</strong> from the
                other end, because 140° is the opposite direction. Which end is in
                use depends on the wind, so a wind shift can turn the whole
                airport around.
              </>
            }
          />
          <FieldRow
            label="WIND"
            example="300° at 14 kt, gusts 23"
            blurb="Wind is named for where it comes from, not where it's going. 300° means it blows out of the northwest."
            more={
              <>
                This one blows from the northwest at about 26 km/h, with gusts to
                43. Planes take off and land <strong>into</strong> the wind,
                because air flowing over the wings gives them lift at a lower
                ground speed. A free head start at both ends.
              </>
            }
          />
          <FieldRow
            label="HEAD & CROSSWIND"
            example="14 kt headwind, 2 kt crosswind"
            blurb="The wind split two ways: headwind blowing down the runway (helpful) and crosswind blowing across it (awkward)."
            more={
              <>
                A headwind pushes against the nose, so the plane can fly slower
                over the ground and still stay up, using less runway. A crosswind
                shoves it sideways while landing.{" "}
                <strong>That&rsquo;s why planes sometimes look crooked on approach</strong>,
                straightening out just before touchdown.
              </>
            }
          />
          <FieldRow
            label="VISIBILITY"
            example="15 SM"
            blurb="How far you can see, in statute miles: ordinary land miles. 15 SM is about 24 km."
            more={
              <>
                15 miles is a clear day, enough to see the Gatineau Hills from the
                airport. Aviation uses land miles for visibility but nautical
                miles for distance and speed, which confuses everyone at first.
                Below about 3 SM, arrivals rely on instruments.
              </>
            }
          />
          <FieldRow
            label="PRESSURE"
            example="1009 hPa"
            blurb="The weight of the air right now. Pilots dial it into their altimeter so everyone nearby agrees on what 7,400 ft means."
            more={
              <>
                An altimeter is really a barometer. Set the wrong pressure and
                every altitude it shows is off by the same amount, which matters
                most near the ground. The raw report gives it in inches of
                mercury (<strong>A2979</strong> is 29.79 inches); this app shows
                hectopascals.
              </>
            }
          />
          <FieldRow
            label="FLIGHT CATEGORY"
            example="VFR"
            blurb="Visual Flight Rules: clear enough to fly by looking out the window. IFR means flying on instruments alone."
            more={
              <>
                The scale runs VFR, MVFR (marginal), IFR, then LIFR (low IFR) as
                the cloud drops and the visibility closes in. In IFR there&rsquo;s
                nothing to see but grey, so pilots follow their instruments and
                radio guidance all the way down to the runway.
              </>
            }
          />
          <FieldRow
            label="CLOUD LAYERS"
            example="SCT056 BKN200"
            blurb="Scattered cloud at 5,600 ft, broken cloud at 20,000. Scattered means patchy blue sky; broken means mostly covered."
            more={
              <>
                The code is coverage, then height in hundreds of feet. From least
                to most: FEW, SCT (scattered), BKN (broken) and OVC (overcast). A
                plane at 7,400 ft would be climbing through that first layer
                right about now.
              </>
            }
          />
          <FieldRow
            label="DENSITY ALTITUDE"
            example="DENSITY ALT 1300FT"
            blurb="How high the air feels to a plane. Hot air is thinner, so wings and engines behave as if the airport were higher up."
            more={
              <>
                Ottawa&rsquo;s airport sits 374 ft above sea level, but on a warm
                day it performs like 1,300 ft. Thinner air means longer takeoff
                runs and slower climbs, which is why hot summer afternoons are
                hardest on heavy planes.
              </>
            }
          />
          <FieldRow
            label="RAW METAR"
            example="30014G23KT 15SM"
            blurb="The raw weather report, in the compressed code pilots read at a glance. The Airport Conditions section is this line, decoded."
            more={
              <>
                <strong>30014G23KT</strong> is wind from 300° at 14 knots gusting
                23. <strong>15SM</strong> is visibility, <strong>SCT056</strong>{" "}
                is the cloud and <strong>A2979</strong> is the pressure. A new
                report comes out about once an hour.
              </>
            }
          />
        </GlossarySection>

        <GlossarySection
          title="WHERE THE DATA COMES FROM"
          summary="Who is actually tracking these planes"
        >
          <FieldRow
            label="LIVE FEED"
            example="ADSB.LOL"
            blurb="A volunteer network of hobbyists with antennas on their roofs, pooling what they hear. Nobody is being paid."
            more={
              <>
                Each receiver picks up the transponder broadcasts of planes
                nearby and shares them with a free community feed. Routes,
                registrations and photos come from adsbdb, another community
                database.{" "}
                <strong>
                  Every dot on this page exists because someone put an antenna on
                  their roof.
                </strong>
              </>
            }
          />
        </GlossarySection>
      </div>
    </section>
  );
}
