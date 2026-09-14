# Flights Overhead

A live, airport-style view of the aircraft arriving at and departing from
Ottawa International Airport (YOW). It shows what is in the sky, what each
aircraft is, where it came from or is going, and which runway is likely in use.

## What it does

- **YOW radar.** A 50 km scope showing arrivals and departures around the
  airport. Aircraft move smoothly between live updates, and new contacts are
  revealed by the radar sweep. Tap a blip to inspect that flight.
- **Now Arriving / Now Departing.** Compact boards for the flights nearest the
  airport, with their airline, flight number, aircraft type, registration,
  route, altitude, speed, and distance.
- **Fun Facts.** Details about the selected or featured aircraft, including a
  photo when one is available and facts for aircraft commonly seen at YOW.
- **Airport conditions.** The latest CYOW METAR, inferred landing and takeoff
  runways, wind, visibility, altimeter, and local time.
- **Learning Centre.** Plain-language explanations of the aviation terms and
  live values shown throughout the app.
- **YOW traffic only.** Overflights and nearby traffic using other airports are
  filtered out. The airport and runway geometry live in `lib/config.ts`.

## How arriving vs departing is decided

A flight is *arriving* if its filed destination is CYOW and *departing* if its
origin is. With no reliable route, the app uses distance, altitude, heading,
and vertical speed to recognize aircraft descending toward YOW or climbing
away from it. A low aircraft moving near YOW is trusted over filed route data,
which can be stale. Level aircraft above roughly 23,000 ft are dropped before
any enrichment lookups.

## Which runway is in use

An arrival lined up on a runway's extended centreline, or a departure climbing
straight out along one, marks that runway as in use for 20 minutes. With no
recent sighting, the answer is the runway pointing most directly into the
METAR wind (14/32 and 07/25 only; 04/22 is a short GA strip). Under 4 kt the
wind does not decide, and the panel says so.

## Stack

Next.js (App Router) + TypeScript + Tailwind v4. Three server routes keep API
credentials off the client and cache aggressively:

| Route | Purpose |
| --- | --- |
| `/api/flights` | Live positions, plus range/bearing, airframe, route and phase |
| `/api/geocode` | Legacy postal code / place-name lookup; not used by the current UI |
| `/api/weather` | Latest CYOW METAR (wind, visibility, altimeter), cached 5 min |

### Data sources

- **[adsb.lol](https://adsb.lol/)** for live positions. Free, no key, queries by
  radius, and includes registration and ICAO type code inline.
- **[adsbdb](https://www.adsbdb.com/)** for the operator, full type name, photo
  and flight route. [hexdb](https://hexdb.io/) is the airframe fallback.
- **[Nominatim](https://nominatim.openstreetmap.org/)** and
  **[Zippopotam](https://zippopotam.us/)** support the legacy geocoding route.
- **[aviationweather.gov](https://aviationweather.gov/data/api/)** for the
  CYOW METAR. Runway thresholds come from
  [OurAirports](https://ourairports.com/).

Lookups are cached in memory (an aircraft's type never changes, a callsign's
route is stable for months), so steady-state polling costs almost no extra
requests.

**Why not OpenSky?** It was the original feed and works fine from a home
connection, but its network silently drops traffic from cloud IP ranges: every
request from Vercel fails with a TCP connect timeout, in US and EU regions
alike. adsb.lol works from anywhere and carries more per-aircraft detail.

## Local setup

```bash
git clone https://github.com/studiolittle/flights-overhead.git
cd flights-overhead
npm install
npm run dev
```

On Windows PowerShell, chain with `;` rather than `&&`.

Open <http://localhost:3000>. The radar is centred on YOW and needs no API keys
or local configuration.

Typography is [Space Grotesk](https://fonts.google.com/specimen/Space+Grotesk),
self-hosted via `next/font`, with tabular figures so the live readouts do not
jitter as they update.

## Configuration

There are no required environment variables or API keys. Every upstream data
source is free and open.

`NEXT_PUBLIC_POLL_INTERVAL_MS` can optionally increase the flight refresh
interval from its 10-second default. The radar range and airport are fixed at
50 km around YOW in the current interface.

## Deploy to Vercel

Import <https://github.com/studiolittle/flights-overhead> at
[vercel.com/new](https://vercel.com/new). Next.js is detected automatically and
the defaults are correct, including **Root Directory** `./` (this repo is the
project root). No environment variables are required. Every push to `main`
redeploys.

## Known limits

- Altitude is barometric (above sea level), not height above the ground.
- A route is only as good as the filed callsign. General aviation and private
  flights usually have none, and an airline callsign can carry a stale route
  from a different leg, so an aircraft below ~6,500 ft is classified from its
  climb or descent rather than its filed route.
- Aircraft slower than ~58 kt are filtered out, since ground vehicles and
  taxiing aircraft would otherwise appear to be flying over.
- The runway in use is inferred, not read from ATIS. Straight-in sightings are
  reliable; the wind fallback can pick 14/32 while the tower is using 07/25
  (or the reverse) when the wind sits between the two.
- METAR wind is in degrees true, while painted runway numbers are magnetic
  (about 13° apart in Ottawa). The runway geometry uses true headings, so the
  comparison is like for like.
- All motion respects `prefers-reduced-motion`.
