# Flights Overhead

An airport-style arrivals board for your own house. It tells you which aircraft
is passing over, whether it is **landing** or **taking off**, what type it is,
and where it came from or is going, so you do not have to open Flightradar
every time you hear one.

## What it does

- **NOW ARRIVING / NOW DEPARTING / PASSING OVER** banner for the aircraft that
  matters right now, with the airline, flight number, aircraft type,
  registration, a photo of the actual airframe, and the route.
- **Desktop notifications** when something enters your overhead radius, so you
  can leave the tab in the background.
- **Passed overhead log** of everything that has flown over, kept in your
  browser.
- **Route map.** A great-circle line showing the leg already flown from the
  origin airport and the leg remaining to the destination, with your station
  marked on it.
- **Postal code field.** Type `M5V 3L9`, `90210`, `SW1A 1AA` or a place name.
  Saved locally, so it sticks.
- **Range presets** of 5 / 10 / 25 / 50 km.
- **Traffic filter.** Defaults to **YOW ONLY**: just the flights landing at or
  taking off from Ottawa. **ALL** brings back overflights and everything else
  in range. The airport is `HOME_AIRPORT` in `lib/config.ts`.
- **Radar scope** for spatial context: click a blip to pin that flight.

## How arriving vs departing is decided

Route data is authoritative. If the flight's **destination** airport is within
70 km of your station it is *arriving*; if the **origin** is, it is *departing*;
if neither is, it is a *passing overflight*. When no route has been filed the
app falls back to the vertical profile (low and descending vs low and climbing).

In **YOW ONLY** mode the test is narrower: the filed origin or destination must
be CYOW. With no route filed, an aircraft counts if it is within 25 km of YOW,
below ~13,000 ft, and descending toward it or climbing away from it. Level
aircraft above ~23,000 ft are dropped before any lookups.

## Stack

Next.js (App Router) + TypeScript + Tailwind v4. Three server routes keep API
credentials off the client and cache aggressively:

| Route | Purpose |
| --- | --- |
| `/api/flights` | Live positions, plus range/bearing, airframe, route and phase |
| `/api/geocode` | Postal code / place name to coordinates |

### Data sources

- **[adsb.lol](https://adsb.lol/)** for live positions. Free, no key, queries by
  radius, and includes registration and ICAO type code inline.
- **[adsbdb](https://www.adsbdb.com/)** for the operator, full type name, photo
  and flight route. [hexdb](https://hexdb.io/) is the airframe fallback.
- **[Nominatim](https://nominatim.openstreetmap.org/)** for postal codes, with
  [Zippopotam](https://zippopotam.us/) as a CA/US fallback.

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

Open http://localhost:3000. It starts on **K2G 6P3 (Nepean, Ontario)**; type a
different postal code to move the station. No configuration needed to try it.

Typography is [Space Grotesk](https://fonts.google.com/specimen/Space+Grotesk),
self-hosted via `next/font`, with tabular figures so the live readouts do not
jitter as they update.

## Configuration

All optional, all in `.env.local` (see `.env.example`):

| Variable | Default | Notes |
| --- | --- | --- |
| `HOME_LAT` / `HOME_LON` | K2G 6P3, Nepean ON | Fallback before a postal code is set; see `lib/config.ts`. |
| `RADAR_RANGE_KM` | `10` | Default range. |
| `OVERHEAD_RADIUS_KM` | `2.5` | What counts as "overhead". |
| `NEXT_PUBLIC_POLL_INTERVAL_MS` | `40000` | Refresh interval, min 15000. |

There are no API keys. Every upstream this uses is free and open.

## Deploy to Vercel

Import <https://github.com/studiolittle/flights-overhead> at
[vercel.com/new](https://vercel.com/new). Next.js is detected automatically and
the defaults are correct, including **Root Directory** `./` (this repo is the
project root). No environment variables are required. Every push to `main`
redeploys.

Notifications need HTTPS, which Vercel provides. Grant permission with the
**ALERTS** toggle; browsers only allow that request from a real click.

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
- All motion respects `prefers-reduced-motion`.
