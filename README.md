# Poker Blind Timer

SvelteKit + Svelte 5 poker tournament blind timer.

## Features

- Start / pause / reset
- Editable blind levels
- Editable level duration
- Automatic level advancement
- Automatic game rotation every 2 blind levels
- NLH → PLO5 → Pineapple → PLO4 → Crazy Pineapple → repeat
- Manual previous/next level controls
- Optional level-change sound
- Keyboard shortcuts
- Responsive layout for desktop, tablet and phone

## Run locally

```bash
npm install
npm run dev
```

Then open the local URL printed by Vite.

## Build

```bash
npm run check
npm run build
npm run preview
```

The dependency ranges are intentionally kept on current major versions so `npm install` resolves current compatible Svelte/SvelteKit releases.

## Venue-specific tournaments

- `/` opens the venue selector.
- `/<venueid>` opens that venue's tournament admin.
- `/<venueid>/display` opens the read-only TV display.
- Tournament data is stored independently in `.data/venues/<venueid>.json`.

The development server is already configured to listen on the local network. Run:

```bash
npm run dev
```

Use the Mac's LAN IP address (for example, `http://192.168.1.20:5173`) on a phone or other device on the same Wi-Fi. The Mac's firewall must allow incoming connections on port 5173.

## Chromecast receiver setup

1. Register a **Custom Receiver** in the Google Cast SDK Developer Console.
2. Host `static/cast-receiver/receiver.html` at a publicly reachable HTTPS URL and use that URL as the receiver application URL.
3. Copy the receiver application ID into `.env`:

```bash
VITE_CAST_RECEIVER_APP_ID=YOUR_GOOGLE_CAST_RECEIVER_APP_ID
```

4. Restart the Vite development server after changing `.env`.

The receiver must be reachable by the Chromecast over HTTPS. A local `localhost` URL is not reachable from a Chromecast; for local testing, use a secure public tunnel or a deployed HTTPS environment. The admin page and TV display should use the same app origin so the receiver can read the venue's public display data.


## Server-authoritative tournament state

- The Node server owns the canonical timer, player state, blind structure, tournament settings and lifecycle events.
- Tournament mutations use explicit POST actions and are serialized per venue before being written to the venue JSON file.
- The admin page, public display and Chromecast receiver subscribe to `/api/tournament/<venueid>/events` using Server-Sent Events. They reload the authoritative state when a change is published.
- Clients retain a 15-second refresh fallback so they can recover if an event connection is interrupted. The display and receiver animate the countdown locally from the server's timer timestamps.
- The event hub is in-process. Run one persistent Node server for this JSON-backed architecture; separate Node instances do not share event notifications.
- Keep the Mac awake and the Node server running while tournaments are in progress. The JSON files remain the durable source of truth.

## Persistence

The current venue store writes JSON files under `.data/venues`, suitable for a single persistent Node server during local development. Before deploying to serverless or multi-instance hosting, replace this file store with a shared persistent database.
