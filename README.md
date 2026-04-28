# Static

First iteration of the `Static` project from `PROJECT_PROPOSAL.md`.

## What is implemented

- Next.js + TypeScript + Tailwind app scaffold
- Discovery API route with `mock`, `live`, and `auto` modes
- Filterable discovery UI with persisted local session state
- Playback screen with CRT-inspired presentation
- Session history and preview-audio controls
- Spotify OAuth + Web Playback SDK scaffolding
- Last.fm enrichment and Anthropic genre-fallback hooks

## Local setup

1. Install dependencies:

```bash
npm install
```

2. Copy the environment template:

```bash
cp .env.example .env.local
```

3. Run the app:

```bash
npm run dev
```

## Environment notes

- `DISCOVERY_MODE=mock` forces the demo dataset and preview audio.
- `DISCOVERY_MODE=auto` uses live providers when Spotify app credentials and Last.fm are configured; otherwise it falls back to mock mode.
- Spotify playback requires a connected Spotify account, valid OAuth redirect URI, and a browser that can initialize the Web Playback SDK.

## Public mock deploy

For the first public Vercel deploy, use mock mode only:

```bash
DISCOVERY_MODE=mock
NEXT_PUBLIC_APP_URL=https://YOUR-PROJECT.vercel.app
```

See [DEPLOYMENT.md](/Users/lukehermann/design-build-ship/projects/my-final-project/DEPLOYMENT.md:1) for the exact Vercel steps.

## First-iteration tradeoffs

- The discovery engine is real-API-ready, but mock mode remains the reliable default for development and demos before keys are configured.
- Spotify search plus Last.fm enrichment is implemented as the main live path; MusicBrainz and stronger cross-provider reconciliation are left for the next iteration.
- The UI already leans into the bedroom/CRT direction, but it stops short of the full illustrated room and animated camera transitions described as later stretch work.
