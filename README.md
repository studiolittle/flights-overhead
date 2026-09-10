# Flights Overhead

An airport-style arrivals board for your own house. It tells you which aircraft
is passing over, whether it is **landing** or **taking off**, what type it is,
and where it came from or is going, so you do not have to open Flightradar
every time you hear one.

## What it does

- **NOW ARRIVING / NOW DEPARTING** banner for the aircraft that matters right
  now, with the airline, flight number, aircraft type,
  registration, a photo of the actual airframe, and the route.
- **Passed overhead log** of everything that has flown over, kept in your
  browser.
- **YOW airport panel.** Live wind from the latest METAR, which runway
  aircraft are landing on and taking off from, and a N/E/S/W scope of the
  airport with the runways, the approach and climb-out paths, and every
  arrival and departure as a dot.
- **Radar scope**, centred on YOW, showing every arrival and departure as a
  dot. Range presets of 5 / 10 / 25 / 50 km around the airport. Click a blip
  to pin that flight.
- **Home field.** Type `M5V 3L9`, `90210`, `SW1A 1AA` or a place name. It does
  not move the radar — it marks where you are on it, and it is what the
  "passing overhead" alert is measured from. Saved locally, so it sticks.
- **YOW traffic only.** Just the flights landing at or taking off from
  Ottawa; overflights are left out. The airport and its runways are
  `HOME_AIRPORT` in `lib/config.ts`.

## How arriving vs departing is decided

A flight is *arriving* if its filed destination is CYOW and *departing* if its
origin is. With no route filed, it counts if it is within 25 km of YOW, below
~13,000 ft, and descending toward it or climbing away from it. A low aircraft
climbing or descending near YOW is trusted over its filed route, which can be
stale. Level aircraft above ~23,000 ft are dropped before any lookups.

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
| `/api/geocode` | Postal code / place name to coordinates |
| `/api/weather` | Latest CYOW METAR (wind, visibility, altimeter), cached 5 min |
| `/api/presence` | "Users online" count: each browser checks in every 30 s with a random id, held in Vercel's Runtime Cache |

### Data sources

- **[adsb.lol](https://adsb.lol/)** for live positions. Free, no key, queries by
  radius, and includes registration and ICAO type code inline.
- **[adsbdb](https://www.adsbdb.com/)** for the operator, full type name, photo
  and flight route. [hexdb](https://hexdb.io/) is the airframe fallback.
- **[Nominatim](https://nominatim.openstreetmap.org/)** for postal codes, with
  [Zippopotam](https://zippopotam.us/) as a CA/US fallback.
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

Open http://localhost:3000. The radar is centred on YOW; with no home location
set it starts on the airport itself, which you can change to any postal code or
place name. No configuration needed to try it.

Typography is [Space Grotesk](https://fonts.google.com/specimen/Space+Grotesk),
self-hosted via `next/font`, with tabular figures so the live readouts do not
jitter as they update.

## Configuration

All optional, all in `.env.local` (see `.env.example`):

| Variable | Default | Notes |
| --- | --- | --- |
| `HOME_LAT` / `HOME_LON` | YOW | Your home before a postal code is set; see `lib/config.ts`. Does not move the radar. |
| `RADAR_RANGE_KM` | `50` | Default radar range, km around YOW. |
| `OVERHEAD_RADIUS_KM` | `2.5` | How close to home counts as "overhead". |
| `NEXT_PUBLIC_POLL_INTERVAL_MS` | `40000` | Refresh interval, min 15000. |

There are no API keys. Every upstream this uses is free and open.

## Deploy to Vercel

Import <https://github.com/studiolittle/flights-overhead> at
[vercel.com/new](https://vercel.com/new). Next.js is detected automatically and
the defaults are correct, including **Root Directory** `./` (this repo is the
project root). No environment variables are required. Every push to `main`
redeploys.

## Known limits

- Altitude is barometric (above sea level), not height above your roof.
- A route is only as good as the filed callsign. General aviation and private
  flights usually have none, and an airline callsign can carry a stale route
  from a different leg, so an aircraft below ~6,500 ft is classified from its
  climb or descent rather than its filed route.
- Aircraft slower than ~58 kt are filtered out, since ground vehicles and
  taxiing aircraft would otherwise appear to be flying over.
- The passed-overhead log lives in your browser only, and is capped at 40
  entries.
- The runway in use is inferred, not read from ATIS. Straight-in sightings are
  reliable; the wind fallback can pick 14/32 while the tower is using 07/25
  (or the reverse) when the wind sits between the two.
- METAR wind is in degrees true, while painted runway numbers are magnetic
  (about 13° apart in Ottawa). The runway geometry uses true headings, so the
  comparison is like for like.
- All motion respects `prefers-reduced-motion`.
