# Vercel Deployment

This project can be deployed publicly in a mock-only mode without Spotify, Last.fm, or Anthropic keys.

## First public deploy

Use these environment variables in Vercel:

```bash
DISCOVERY_MODE=mock
NEXT_PUBLIC_APP_URL=https://YOUR-PROJECT.vercel.app
```

Do not add Spotify, Last.fm, or Anthropic secrets for the first public deploy.

## Vercel setup

1. Push this project to GitHub.
2. Import the repo into Vercel.
3. If the repo contains multiple folders, set the Root Directory to `my-final-project`.
4. Add the two environment variables above.
5. Deploy.

## Expected public behavior

- Discovery runs entirely on the mock dataset.
- Preview audio still works.
- The room ambience and scene animations still work.
- Spotify login is intentionally hidden from the main playback actions when Spotify is not configured.

## Later live-mode upgrade

When you want real Spotify/live APIs, add:

```bash
DISCOVERY_MODE=auto
SPOTIFY_CLIENT_ID=...
SPOTIFY_CLIENT_SECRET=...
SPOTIFY_REDIRECT_URI=https://YOUR-PROJECT.vercel.app/api/spotify/callback
LASTFM_API_KEY=...
ANTHROPIC_API_KEY=...
```

Then register the same callback URL in your Spotify app settings.
