# Project Proposal: Static

## One-Line Description
A "true random" music discovery engine with dialable filters, wrapped in an immersive 2000s bedroom scene where songs play on a CRT TV.

## The Problem
Music discovery is broken. Spotify's shuffle isn't random — it favors songs you've already engaged with. Discovery playlists are algorithmically curated to keep you in a comfort zone. There's no way to say "give me something truly random with under 5,000 plays in a genre I've never heard of" and actually get surprised. For music nerds who want to go deep, the tools don't exist — you're stuck manually digging through blogs, subreddits, and curated playlists. Static gives you real control over randomness: dial in your constraints (or don't), hit discover, and hear something you've never heard before.

## Target User
Me — a music nerd who wants to discover genuinely niche and random music without algorithmic curation getting in the way. Built as a personal tool, demonstrated to others. At the Week 9 project fair, attendees watch the experience live.

## Core Features (v1)
1. **Dialable filters**: Optional inputs for genre, listen count range (lower/upper bound), artist listener count range, and BPM. All filters are optional — leave them all blank for pure randomness.
2. **AI genre fallback**: If the user types a genre that doesn't exist (e.g., "sad robot music"), a Claude Haiku call maps it to the closest real genre(s) in under 5 seconds.
3. **Multi-API discovery engine**: Stitches together Spotify (search/genre), Last.fm (play counts, artist listeners), and MusicBrainz (supplementary metadata) to find tracks matching the filters, then selects one at random.
4. **Full Spotify playback**: Songs stream in the browser via the Spotify Web Playback SDK. Includes play/pause, scrub through the track, skip to next, and go back to previous.
5. **Basic UI with settings and playback views**: A settings screen where you enter filters, and a playback screen showing album art, song title, artist name, play count, and release date. Navigation between the two views with filter inputs persisted.

## Tech Stack
- **Frontend**: Next.js (React-based, good ecosystem for a first web app, pairs naturally with Vercel deployment, and v0.dev can scaffold components fast)
- **Styling**: Tailwind CSS (utility-first, fast iteration, good for someone learning frontend — avoids fighting CSS architecture)
- **Database**: None for v1. If caching API results becomes necessary for performance, Supabase can be added later.
- **Auth**: None. This is a personal tool — Spotify OAuth connects directly to the app owner's account. No user management needed.
- **APIs**:
  - Spotify Web API — search by genre, track metadata, OAuth for playback
  - Spotify Web Playback SDK — full in-browser audio streaming
  - Last.fm API — global play counts, artist listener counts (filling the gap left by Spotify's removed popularity field)
  - MusicBrainz API — supplementary metadata, cross-referencing via ISRC
  - Claude API (Haiku) — genre fuzzy-matching fallback
- **Deployment**: Vercel (seamless Next.js hosting, fast deploys, good for iterative development)
- **MCP Servers**: Playwright MCP for browser-based testing of the interactive UI and playback experience

## Stretch Goals
- **Full 2000s bedroom scene**: An illustrated/CSS-crafted retro bedroom environment — posters on the wall, CDs on the shelf, the CRT TV as the focal point. Interactive elements (filters, buttons) blend into the scene as objects in the room.
- **CRT TV aesthetic**: Song playback displayed on a CRT monitor with scanlines, slight curvature, and a warm glow. Album art and song info rendered as if on an old screen.
- **Animated transitions**: When you hit "discover," a 2-second animation zooms from the bedroom settings view into the CRT TV. Returning to settings reverses the animation.
- **"Add to Liked Songs" button**: One-click save to Spotify library via the `PUT /me/library` endpoint.
- **BPM filtering**: BPM data is harder to source since Spotify deprecated audio features. Explore alternatives (community databases, Essentia audio analysis, or a curated BPM dataset) to make this filter functional.
- **Language filter**: Use MusicBrainz's `text-representation` field (ISO language codes) to filter by song language.
- **Listening history**: Track what you've discovered in a session so "go back" works across multiple songs, and optionally persist history across sessions.
- **Sound effects**: Retro UI sounds — a dial click when adjusting filters, static noise during the transition animation, a VHS-style "tracking" sound when skipping.

## Biggest Risk
**The frontend ambition vs. frontend experience gap.** The vision is a highly specific, immersive visual scene with animations and interactive elements blended into an illustrated environment — and this is a first web app. Claude Code and v0 will help, but custom visual scenes with CSS animations are where AI code generation is weakest. The mitigation is clear sequencing: build the discovery engine and basic UI first (Week 5), then layer in the aesthetic (Weeks 6-8). The product works without the bedroom scene; the bedroom scene doesn't work without the product.

Secondary risk: **multi-API data consistency.** A track found via Spotify search needs to be matched to Last.fm for play counts and potentially MusicBrainz for metadata. Matching across APIs (by ISRC, by artist+title string matching) is imperfect and will require handling mismatches gracefully.

## Week 5 Goal
A working discovery engine in the browser: enter optional filters (genre, listen count range, artist listener count), hit a button, and a random matching song plays via Spotify. Skip and back buttons work. Genre AI fallback works. The UI is functional and clean but not yet styled as the retro bedroom scene — that comes in Weeks 6-8. The core loop of "dial in constraints, discover something random, listen to it" is solid and satisfying.
