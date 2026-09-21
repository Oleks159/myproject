# Token Poker Farm – React/TypeScript export

This folder is a standalone React/TypeScript export of the existing Token Poker Farm app. The current assets, CSS, API, account state, poker engine and visual HTML templates are included unchanged to prevent design drift.

## Structure

- `src/pages/HomePage.tsx` – approved Progress screen used as Home
- `src/pages/PlayPage.tsx` – table selection and playable poker table
- `src/pages/RewardsPage.tsx` – rewards/missions destination
- `src/pages/FriendsPage.tsx` – friends and referrals
- `src/components/BottomNavigation.tsx` – bottom navigation shell
- `src/runtime/` – TypeScript port of the complete approved controller, poker-table renderer and reward animation runtime
- `public/legacy/` – frozen regression fixtures used by the original behavioral tests
- `public/assets/` – all production artwork and fonts
- `public/styles/` – the approved CSS, copied without redesign
- `server.mjs`, `domain.mjs`, `bot-engine.mjs`, `bot_engine/` – complete backend and poker engine

## Install and run

```bash
pnpm install
pnpm dev
```

The React development server opens on `http://127.0.0.1:5173/#home`; API requests are proxied to the included backend on port `8790`.

## Production build

```bash
pnpm build
pnpm start
```

The production server serves both the built React app and the API on `http://127.0.0.1:8790/#home`.

Node.js 24 or newer is required because the backend uses `node:sqlite`.

The equivalent `npm install`, `npm run dev`, `npm run build`, `npm start` and `npm test` commands also work when npm is your preferred package manager.
