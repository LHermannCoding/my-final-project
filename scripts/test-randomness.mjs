const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const SAMPLES = Number(process.env.SAMPLES ?? "80");

async function discover(payload) {
  const response = await fetch(`${BASE_URL}/api/discover`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Discovery request failed with status ${response.status}.`);
  }

  return response.json();
}

function summarizeCounts(items) {
  return Object.entries(items)
    .sort((left, right) => right[1] - left[1])
    .map(([key, count]) => ({ key, count }));
}

async function sampleScenario(name, payload) {
  const trackCounts = {};
  const strategyCounts = {};

  for (let index = 0; index < SAMPLES; index += 1) {
    const result = await discover(payload);
    trackCounts[result.track.id] = (trackCounts[result.track.id] ?? 0) + 1;
    strategyCounts[result.selection.strategy] = (strategyCounts[result.selection.strategy] ?? 0) + 1;
  }

  return {
    name,
    uniqueTracks: Object.keys(trackCounts).length,
    tracks: summarizeCounts(trackCounts),
    strategies: summarizeCounts(strategyCounts)
  };
}

async function run() {
  const scenarios = await Promise.all([
    sampleScenario("pure-random", {}),
    sampleScenario("tight-shoegaze", {
      genre: "shoegaze",
      trackPlayCount: { max: 5000 },
      artistListeners: {},
      bpm: { min: 90, max: 110 }
    }),
    sampleScenario("invented-vibe", {
      genre: "sad robot music",
      trackPlayCount: {},
      artistListeners: { max: 3000 },
      bpm: {}
    }),
    sampleScenario("impossible-filter", {
      genre: "post-punk",
      trackPlayCount: { max: 1200 },
      artistListeners: { max: 700 },
      bpm: { min: 60, max: 80 }
    })
  ]);

  console.log(
    JSON.stringify(
      {
        baseUrl: BASE_URL,
        samples: SAMPLES,
        scenarios
      },
      null,
      2
    )
  );
}

run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
