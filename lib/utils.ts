import { DiscoveryFilters, RangeValue } from "@/lib/types";

export function clampRange(range: RangeValue): RangeValue {
  const min =
    typeof range.min === "number" && Number.isFinite(range.min) ? range.min : undefined;
  const max =
    typeof range.max === "number" && Number.isFinite(range.max) ? range.max : undefined;

  if (typeof min === "number" && typeof max === "number" && min > max) {
    return { min: max, max: min };
  }

  return { min, max };
}

export function inRange(value: number | undefined, range: RangeValue): boolean {
  if (typeof value !== "number") {
    return false;
  }

  if (typeof range.min === "number" && value < range.min) {
    return false;
  }

  if (typeof range.max === "number" && value > range.max) {
    return false;
  }

  return true;
}

export function sanitizeFilters(input: Partial<DiscoveryFilters>): DiscoveryFilters {
  return {
    genre: (input.genre ?? "").trim(),
    trackPlayCount: clampRange(input.trackPlayCount ?? {}),
    artistListeners: clampRange(input.artistListeners ?? {}),
    bpm: clampRange(input.bpm ?? {}),
    strictness:
      input.strictness === "exact" ||
      input.strictness === "balanced" ||
      input.strictness === "adventurous"
        ? input.strictness
        : "balanced"
  };
}

export function parseNumber(value: FormDataEntryValue | null): number | undefined {
  if (typeof value !== "string" || value.trim() === "") {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function formatNumber(value?: number): string {
  if (typeof value !== "number") {
    return "Unknown";
  }

  return new Intl.NumberFormat("en-US").format(Math.round(value));
}

export function formatReleaseDate(value?: string): string {
  if (!value) {
    return "Unknown release";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(date);
}
