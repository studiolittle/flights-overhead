# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Curious non-experts near Ottawa, on a phone (often outdoors, looking up) or a desktop, asking "what's that plane overhead?". Aviation spotters are a secondary audience.

## Product Purpose
Flights Overhead shows live air traffic within 50 km of Ottawa (YOW) and turns a blip into a story: who is flying it, where it is going, which runway is probably in use, and fun facts about the aircraft type. Success is a curious person identifying a plane and learning something in seconds.

## Positioning
A calm, local view of one airport, not a global tracker. It infers runway use in plain English ("in from the WSW") and pairs every aircraft with fun facts and a Learning centre, which FlightRadar24-style apps do not do.

## Capabilities and Constraints
- Live feed from adsb.lol (free; attribution must stay visible). No paid data sources.
- Radar with sweep, arrivals/departures list, aircraft spotlight, airport conditions (METAR, runway inference), Learning centre, viewer count.
- Dark theme only: the page is the night sky.
- Next.js, Tailwind, deployed on Vercel.
- The feed is often empty off-peak; empty states are a first-class case.

## Brand Commitments
Warm, plain-language voice ("licence plate", "like a bus route"). Keep the existing Learning centre copy; its structure may change.

## Product Principles
- Plain language before jargon; define terms where they appear.
- Calm and local over dense and global.
- Never state something false: say when data is stale, missing or inferred.
- The tapped plane's story is the payoff; keep it next to the tap.

## Accessibility & Inclusion
Readable outdoors on a phone; keyboard and screen-reader operable; respects reduced motion.
