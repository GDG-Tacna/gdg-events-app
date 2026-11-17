# DevFest Space Arcade · Odisea de Código

Event companion web app for DevFest Tacna 2026: a mobile-first PWA where attendees ("cadets") check in with QR codes, complete missions, earn XP and G-Credits, climb a leaderboard and play small arcade mini-games. Staff and organizers run the event from an admin panel and a stage screen.

Next.js (TypeScript strict) · Firebase (Firestore + Auth) · Tailwind + shadcn/ui · Vitest + Playwright.

## Where things are written down

| Read | For |
| --- | --- |
| `docs/ROADMAP.md` | The product and its phases |
| `docs/architecture.md` | Layers, folder rules and the decisions log |
| `docs/DESIGN-SYSTEM.md` | Tokens, components and voice |
| `docs/progress.md` | What is built and what is not yet verified |
| `docs/deploy.md` | Deployment and the load test |
| `CONTRIBUTING.md` | How we work as a team |

## Run it locally

Requirements: Node 22 (`.nvmrc`), and for the emulators Java and the Firebase CLI.

```bash
npm ci
cp .env.example .env.local   # then fill it in, see below
npm run dev                  # http://localhost:3000
```

### Use the emulators, not the event's Firebase project

The real project holds the event's data. Develop against the emulators (or a separate development project):

1. In `.env.local` set `NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true`, `FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099` and `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080` (they are in `.env.example`).
2. Start them: `npx firebase-tools emulators:start` (ports are in `firebase.json`).
3. Generate your own `QR_SIGNING_SECRET` (the command is in `.env.example`).

Never put the event project's service account key on a personal machine unless you are the one deploying. Scripts under `scripts/` that write data (`talks:seed`, `talks:missions`, `load:*`) run against whatever project your `.env.local` points to.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run typecheck` | `next typegen` and `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Unit tests (Vitest) |
| `npm run e2e` | End-to-end tests (Playwright) |
| `npm run build:check` | Production build in its own folder, safe while `npm run dev` runs |

The same typecheck, lint and tests run on every pull request (`.github/workflows/ci.yml`).
