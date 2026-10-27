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

## Production server

The project uses `@sveltejs/adapter-node`. Build the standalone Node server and start it with:

```bash
npm run build
node build
```

The server listens on port `3000` by default. Set `PORT` to change it, for example `PORT=5173 node build`. Point the Cloudflare Tunnel at the production server's port, not the Vite development server. Keep the Node process running while tournaments are active.

Requires Node.js 22.12.0 or later. The app uses Node's built-in SQLite module, so no native SQLite package installation is required.

The dependency ranges are intentionally kept on current major versions so `npm install` resolves current compatible Svelte/SvelteKit releases.

## Venue-specific tournaments

- `/` opens the venue selector.
- `/<venueid>` opens that venue's tournament admin.
- `/<venueid>/display` opens the read-only TV display.
- Tournament data is stored in `.data/poker.sqlite`, with one row per venue.

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
- Tournament mutations use explicit POST actions and are serialized per venue before being committed to the SQLite database. Background blind-level push notifications also read their live tournament state from SQLite; push subscriptions and delivery cursors remain under `.data/push/`.
- The admin page, public display and Chromecast receiver subscribe to `/api/tournament/<venueid>/events` using Server-Sent Events. They reload the authoritative state when a change is published.
- Clients retain a 15-second refresh fallback so they can recover if an event connection is interrupted. The display and receiver animate the countdown locally from the server's timer timestamps.
- The event hub is in-process. Run one persistent Node server for this architecture; separate Node instances do not share event notifications.
- Keep the Mac awake and the Node server running while tournaments are in progress. SQLite is the durable source of truth; imported JSON files are retained as backups.

## SQLite persistence and JSON migration

- The first server start imports valid `.data/venues/<venueid>.json` files into `.data/poker.sqlite` in a single SQLite transaction.
- Import is idempotent. Existing SQLite rows are never overwritten by legacy JSON files, and the original JSON files are retained as backups.
- SQLite uses WAL journaling and full synchronous writes. The database and its journal files are ignored by Git.
- Back up the entire `.data/` directory, especially `.data/poker.sqlite`, before moving or reinstalling the app.
- The app still expects one persistent Node process because live Server-Sent Event notifications are held in-process. SQLite provides durable transactional storage, but does not make the current SSE event hub multi-instance aware.
