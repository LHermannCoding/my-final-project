const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:3000";

async function request(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, options);
  const text = await response.text();
  let json = null;

  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }

  return { status: response.status, headers: response.headers, text, json };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function run() {
  const results = [];

  const emptyDiscover = await request("/api/discover", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });
  assert(emptyDiscover.status === 200, "Empty discovery request should return 200.");
  assert(emptyDiscover.json?.track?.id, "Empty discovery response should include a track.");
  assert(emptyDiscover.json?.selection?.strategy === "exact", "Empty discovery should use exact strategy.");
  results.push({
    name: "empty-discovery",
    status: emptyDiscover.status,
    track: emptyDiscover.json.track.id,
    strategy: emptyDiscover.json.selection.strategy
  });

  const constrained = await request("/api/discover", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      genre: "shoegaze",
      trackPlayCount: { max: 5000 },
      artistListeners: {},
      bpm: { min: 90, max: 110 }
    })
  });
  assert(constrained.status === 200, "Constrained discovery request should return 200.");
  assert(
    constrained.json?.track?.genreHint?.toLowerCase().includes("shoegaze"),
    "Constrained discovery should preserve the requested genre space."
  );
  results.push({
    name: "constrained-discovery",
    status: constrained.status,
    track: constrained.json.track.id,
    strategy: constrained.json.selection.strategy
  });

  const heuristicGenre = await request("/api/discover", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      genre: "sad robot music",
      trackPlayCount: {},
      artistListeners: { max: 3000 },
      bpm: {}
    })
  });
  assert(heuristicGenre.status === 200, "Heuristic-genre discovery request should return 200.");
  assert(
    heuristicGenre.json?.diagnostics?.some((item) => item.includes("Mapped \"sad robot music\"")),
    "Heuristic genre mapping diagnostic should be present."
  );
  results.push({
    name: "heuristic-genre-discovery",
    status: heuristicGenre.status,
    track: heuristicGenre.json.track.id,
    strategy: heuristicGenre.json.selection.strategy
  });

  const spotifySession = await request("/api/spotify/session");
  assert(spotifySession.status === 200, "Spotify session should return 200.");
  assert(
    spotifySession.json?.connected === false,
    "Spotify session should report disconnected without credentials."
  );
  results.push({
    name: "spotify-session",
    status: spotifySession.status,
    connected: spotifySession.json.connected
  });

  const spotifyLogin = await request("/api/spotify/login");
  assert(spotifyLogin.status === 500, "Spotify login should fail gracefully without credentials.");
  results.push({
    name: "spotify-login-unconfigured",
    status: spotifyLogin.status,
    error: spotifyLogin.json?.error
  });

  const spotifyCallbackError = await request("/api/spotify/callback?error=access_denied", {
    redirect: "manual"
  });
  assert(
    spotifyCallbackError.status === 307,
    "Spotify callback error should redirect with a 307 response."
  );
  results.push({
    name: "spotify-callback-error",
    status: spotifyCallbackError.status,
    location: spotifyCallbackError.headers.get("location")
  });

  const spotifyCallbackInvalidState = await request(
    "/api/spotify/callback?code=fake&state=fake",
    { redirect: "manual" }
  );
  assert(
    spotifyCallbackInvalidState.status === 307,
    "Spotify callback invalid state should redirect with a 307 response."
  );
  results.push({
    name: "spotify-callback-invalid-state",
    status: spotifyCallbackInvalidState.status,
    location: spotifyCallbackInvalidState.headers.get("location")
  });

  console.log(JSON.stringify({ baseUrl: BASE_URL, results }, null, 2));
}

run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
