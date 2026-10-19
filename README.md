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
