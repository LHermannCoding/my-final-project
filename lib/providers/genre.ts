export const KNOWN_GENRES = [
  "alt-country",
  "ambient",
  "bedroom pop",
  "dream pop",
  "drum and bass",
  "electronic",
  "indie rock",
  "indietronica",
  "jazz",
  "pop",
  "post-punk",
  "shoegaze",
  "slowcore",
  "soul",
  "synthpop"
];

const HEURISTIC_KEYWORDS: Array<{ match: RegExp; genre: string }> = [
  { match: /(robot|circuit|cyber|android|neon|synthetic|machine)/i, genre: "indietronica" },
  { match: /(sleep|dream|haze|fog|glow|soft)/i, genre: "dream pop" },
  { match: /(sad|slow|gray|lonely|quiet)/i, genre: "slowcore" },
  { match: /(bedroom|diary|lo-fi|lofi|home)/i, genre: "bedroom pop" },
  { match: /(air|drift|meditation|floating|still)/i, genre: "ambient" },
  { match: /(dance|club|pulse|sweat|night drive)/i, genre: "electronic" },
  { match: /(cowboy|porch|dust|prairie)/i, genre: "alt-country" }
];

type GenreResolution = {
  resolvedGenre?: string;
  diagnostics: string[];
};

function hasAnthropicConfig(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function resolveGenreInput(input: string): Promise<GenreResolution> {
  const genre = input.trim();
  if (!genre) {
    return { diagnostics: [] };
  }

  const exact = KNOWN_GENRES.find((value) => value.toLowerCase() === genre.toLowerCase());
  if (exact) {
    return { resolvedGenre: exact, diagnostics: [] };
  }

  const heuristic = HEURISTIC_KEYWORDS.find((item) => item.match.test(genre));
  if (heuristic) {
    return {
      resolvedGenre: heuristic.genre,
      diagnostics: [`Mapped "${genre}" to "${heuristic.genre}" using local genre heuristics.`]
    };
  }

  if (!hasAnthropicConfig()) {
    return {
      resolvedGenre: genre,
      diagnostics: ["Anthropic key missing, using raw genre input without fuzzy mapping."]
    };
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-3-haiku-20240307",
        max_tokens: 60,
        messages: [
          {
            role: "user",
            content:
              `Map this made-up music genre to a real searchable genre. ` +
              `Return only the closest genre phrase, nothing else: ${genre}`
          }
        ]
      })
    });

    if (!response.ok) {
      return {
        resolvedGenre: genre,
        diagnostics: [`Genre fallback failed with status ${response.status}.`]
      };
    }

    const data = (await response.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const mapped = data.content?.find((item) => item.type === "text")?.text?.trim();

    return {
      resolvedGenre: mapped || genre,
      diagnostics: mapped ? [`Mapped "${genre}" to "${mapped}".`] : []
    };
  } catch {
    return {
      resolvedGenre: genre,
      diagnostics: ["Genre fallback request failed, using raw genre input."]
    };
  }
}
