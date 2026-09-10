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
- **Real flight paths.** Click any flight to load its recorded track and see
  where it actually came from, drawn origin-to-here and clipped onto the radar.
- **Postal code field.** Type `M5V 3L9`, `90210`, `SW1A 1AA` or a place name.
  Saved locally, so it sticks.
- **Range presets** of 5 / 10 / 25 / 50 km.
- **Radar scope** for spatial context: click a blip to pin that flight.

## How arriving vs departing is decided

Route data is authoritative. If the flight's **destination** airport is within
70 km of your station it is *arriving*; if the **origin** is, it is *departing*;
if neither is, it is a *passing overflight*. When no route has been filed the
app falls back to the vertical profile (low and descending vs low and climbing).

## Stack

Next.js (App Router) + TypeScript + Tailwind v4. Three server routes keep API
credentials off the client and cache aggressively:

| Route | Purpose |
| --- | --- |
| `/api/flights` | OpenSky state vectors, plus range/bearing, airframe, route and phase |
| `/api/track` | OpenSky recorded track for one aircraft, on demand only |
| `/api/geocode` | Postal code / place name to coordinates |

### Data sources

- **[OpenSky Network](https://opensky-network.org/)** for live positions and
  recorded tracks.
- **[adsbdb](https://www.adsbdb.com/)** for aircraft type, registration, owner,
  photo and flight route. OpenSky's own aircraft-metadata endpoint returns
  `410 Gone`, so this is what makes "what type is it, where is it going"
  possible. [hexdb](https://hexdb.io/) is the fallback for airframe data.
- **[Nominatim](https://nominatim.openstreetmap.org/)** for postal codes, with
  [Zippopotam](https://zippopotam.us/) as a CA/US fallback.

Lookups are cached in memory (an aircraft's type never changes, a callsign's
route is stable for months), so steady-state polling costs almost no extra
requests.

## Local setup

```bash
cd flights-overhead
npm install
npm run dev
```

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
| `NEXT_PUBLIC_POLL_INTERVAL_MS` | `25000` | Refresh interval, min 15000. |
| `OPENSKY_CLIENT_ID` / `OPENSKY_CLIENT_SECRET` | _(none)_ | See below. |

### OpenSky credentials

Anonymous access works but is limited to a few hundred requests per day per IP,
so you will see `FEED STALE` before long. To get a proper quota:

1. Create a free account at <https://opensky-network.org/>.
2. Account → **API clients** → create a client.
3. Set `OPENSKY_CLIENT_ID` and `OPENSKY_CLIENT_SECRET`.

The server exchanges these for a short-lived OAuth2 token, cached in memory.
Basic auth with username and password is no longer supported by OpenSky.

## Deploy to Vercel

1. Push to a Git repo, or run `vercel` from inside `flights-overhead/`.
2. Set the **Root Directory** to `flights-overhead` if the repo contains other
   projects.
3. Add the environment variables above.
4. Deploy.

Notifications need HTTPS, which Vercel provides. Grant permission with the
**ALERTS** toggle; browsers only allow that request from a real click.

## Known limits

- Altitude is barometric (above sea level), not height above your roof.
- A route is only as good as the filed callsign. General aviation and private
  flights usually have none, so they fall back to the vertical profile.
- Aircraft slower than ~58 kt are filtered out: OpenSky's `on_ground` flag is
  unreliable and taxiing aircraft would otherwise appear to be flying over.
- The passed-overhead log lives in your browser only, and is capped at 40
  entries.
- All motion respects `prefers-reduced-motion`.
