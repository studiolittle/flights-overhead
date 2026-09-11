# Release notes

What's new on [Flights Overhead](https://flights-overhead.vercel.app), newest first.

## v0.6.2 · September 11, 2026

- A faint gold beam now sweeps slowly around the radar, so you can tell it's
  searching. It stays behind the planes, so they're still easy to tap, and
  it's switched off if your device is set to reduce motion.

## v0.6.1 · September 11, 2026

- The radar always shows 50 km around YOW, the whole approach. The 25/50 km
  zoom buttons are gone.

## v0.6.0 · September 11, 2026

### Every section has a name

- The page is now clearly labelled sections: **YOW Radar**, **Airport
  Conditions**, **Now Arriving**, **Now Departing**, **Fun Facts** and the
  **Learning Centre**.
- On desktop: the radar, airport conditions and Learning Centre on the left;
  Now Arriving, Now Departing and Fun Facts on the right.
- On phones: the radar first, then Fun Facts, Airport Conditions, Now
  Arriving, Now Departing and the Learning Centre.

### Fun Facts, front and centre

- The new **Fun Facts** section always shows something: the nearest flight's
  fun facts, or the full story of any plane you tap on the radar, with its
  photo and route. Close it with ✕ to go back to the nearest flight.

### Simpler arrivals and departures

- **Now Arriving** and **Now Departing** are small, text-only cards that
  always show the flights nearest the airport, whatever you tap.
- The YOW Traffic list is gone; tap a plane on the radar instead.

## v0.5.0 · September 11, 2026

### Faster updates

- Flights now refresh every 10 seconds instead of every 40, so turns,
  climbs and descents show up sooner and new arrivals appear quicker.
- Refreshing pauses while the tab is in the background and catches up the
  moment you come back.
- Every visitor shares the same few-seconds-old snapshot, so the site stays
  light on the free flight-data feed however many people are watching.

### Helicopters

- Helicopters on the radar now look like helicopters, with a spinning main
  rotor, instead of planes. Think Ornge air ambulances heading for the
  hospital helipad.

### Also

- The browser tab icon is now an airplane.
- "It's 5 o'clock somewhere" is gone from the local time.

## v0.4.0 · September 11, 2026

### A tidier airport panel

- The wind, weather, local time and the raw weather report (METAR) move up
  into one compact list under the radar, right beside the runways in use.
- Everything in it is small and left-aligned, with a label for each row.
- The big wind and weather block at the bottom of the panel is gone.
- The radar's colour key and the "Tap any plane" hint are left-aligned too.

## v0.3.0 · September 11, 2026

### Tap a plane, see its story

- Tap any plane on the radar to see its flight: the airline, the aircraft,
  a photo, where it's coming from or going, and its fun facts.
- On phones the card opens right under the radar. On desktop it takes over
  the Now Arriving or Now Departing card beside the radar, marked
  **Selected**.
- **Clear**, or tapping the plane again, goes back to the flights nearest
  the airport.
- Each flight shows up once, never twice, on both phones and desktop.
- Planes on the radar are easier to hit with a finger.

### The airport comes first

- The YOW Airport panel now leads the page: the radar, the runways in use in
  one line ("Landing RWY 32, in from the SE"), the local time, then the wind
  and the latest weather report.
- **Radar zoom:** switch between 25 km and 50 km. Your choice is remembered.
  Runways are drawn larger than life so they stay readable when zoomed out.
- The dashed approach and climb-out lines are gone from the radar.
- Now Arriving and Now Departing are compact cards in the right-hand column.
  Fun facts lead each card; altitude, speed and distance shrink to one line.
- The Learning Centre sits under the airport. Its text stays put, but the
  tags on flight terms show the flight on the board right now, highlighted
  in gold.
- On phones the welcome note moves to the bottom, so the radar is the first
  thing you see.
- **Removed:** the home postal code and range settings. Distances are now
  measured from YOW, and flights are tracked out to 50 km.

### Also

- Dark mode is now the default. The light theme is still one tap away.
- Added Google Analytics to count visitors.

## v0.2.0 · September 10, 2026

### Learn as you watch

- **Learning Centre:** a plain-language guide to everything on the board,
  from flight numbers and callsigns to runways, wind and weather codes.
- Every field on the flight card has a short explainer and a "Learn more".
- Aircraft fun facts are refreshed from the spreadsheet: 92 aircraft types.
  Fun facts are always shown, never hidden behind a tap.

### Built around YOW

- Arrivals and departures lead the page, one flight each.
- The radar and airport panel centre on Ottawa airport, and the board shows
  only YOW arrivals and departures.
- By default the app watches YOW with a 50 km range.

### Look and feel

- A fresh design with light and dark themes and a theme switch.
- The flight card fades smoothly from one flight to the next.
- A welcome note from Jesse, a beer-stein icon, a local-time clock and a
  reminder that it's 5 o'clock somewhere.
- Status details moved to the footer; desktop notifications removed.

## v0.1.0 · September 9, 2026

- **First release:** a live board of the aircraft passing overhead, with
  what each plane is and where it came from.
- Switched live flight data to the adsb.lol community feed so the site works
  once deployed, refreshing every 40 seconds.
