"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  DiscoveryFilters,
  DiscoveryResponse,
  DiscoveryStatusResponse,
  TrackCandidate
} from "@/lib/types";
import { formatNumber, formatReleaseDate } from "@/lib/utils";

const EMPTY_FILTERS: DiscoveryFilters = {
  genre: "",
  trackPlayCount: {},
  artistListeners: {},
  bpm: {},
  strictness: "balanced"
};

const FILTER_PRESETS: Array<{
  label: string;
  description: string;
  filters: DiscoveryFilters;
}> = [
  {
    label: "Night Rain",
    description: "Soft, low-key, late-night cuts.",
    filters: {
      genre: "dream pop",
      trackPlayCount: { max: 6000 },
      artistListeners: { max: 5000 },
      bpm: { min: 70, max: 110 },
      strictness: "balanced"
    }
  },
  {
    label: "Robot Sad",
    description: "Synthetic and slightly broken.",
    filters: {
      genre: "sad robot music",
      trackPlayCount: { max: 7000 },
      artistListeners: { max: 4000 },
      bpm: { min: 90, max: 130 },
      strictness: "balanced"
    }
  },
  {
    label: "Deep Niche",
    description: "Low plays, low listeners, no mercy.",
    filters: {
      genre: "",
      trackPlayCount: { max: 2500 },
      artistListeners: { max: 1500 },
      bpm: {},
      strictness: "exact"
    }
  },
  {
    label: "Free Drift",
    description: "Open the whole room back up.",
    filters: EMPTY_FILTERS
  }
];

type SpotifySessionPayload = {
  configured: boolean;
  connected: boolean;
  accessToken: string | null;
  expiresAt: number | null;
};

type PlayerDeviceReadyPayload = {
  device_id: string;
};

declare global {
  interface Window {
    Spotify?: {
      Player: new (config: {
        name: string;
        getOAuthToken: (callback: (token: string) => void) => void;
        volume?: number;
      }) => {
        addListener: (name: string, callback: (...args: unknown[]) => void) => void;
        connect: () => Promise<boolean>;
        disconnect: () => void;
      };
    };
    onSpotifyWebPlaybackSDKReady?: () => void;
  }
}

function NumericInput({
  label,
  value,
  onChange
}: {
  label: string;
  value?: number;
  onChange: (value?: number) => void;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-xs uppercase tracking-[0.3em] text-stone-300/80">{label}</span>
      <input
        className="rounded-2xl border border-stone-400/15 bg-black/20 px-4 py-3 text-sm text-stone-100 outline-none transition focus:border-amber-300/40 focus:bg-black/30"
        inputMode="numeric"
        value={value ?? ""}
        onChange={(event) => {
          const next = event.target.value.trim();
          onChange(next === "" ? undefined : Number(next));
        }}
      />
    </label>
  );
}

function WallClock({ time }: { time: Date }) {
  const seconds = time.getSeconds();
  const minutes = time.getMinutes() + seconds / 60;
  const hours = (time.getHours() % 12) + minutes / 60;

  return (
    <div className="absolute right-10 top-10 hidden h-24 w-24 rounded-full border border-stone-100/15 bg-[radial-gradient(circle_at_40%_35%,rgba(255,248,238,0.16),rgba(43,26,18,0.92))] shadow-[0_10px_30px_rgba(0,0,0,0.38)] lg:block">
      <div className="absolute inset-3 rounded-full border border-stone-100/10" />
      <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-stone-100/80" />
      <div
        className="absolute left-1/2 top-1/2 h-7 w-[2px] origin-bottom -translate-x-1/2 -translate-y-full rounded-full bg-stone-100/75"
        style={{ transform: `translateX(-50%) translateY(-100%) rotate(${hours * 30}deg)` }}
      />
      <div
        className="absolute left-1/2 top-1/2 h-9 w-[2px] origin-bottom -translate-x-1/2 -translate-y-full rounded-full bg-stone-100/70"
        style={{ transform: `translateX(-50%) translateY(-100%) rotate(${minutes * 6}deg)` }}
      />
      <div
        className="absolute left-1/2 top-1/2 h-10 w-px origin-bottom -translate-x-1/2 -translate-y-full rounded-full bg-rose-300/85"
        style={{ transform: `translateX(-50%) translateY(-100%) rotate(${seconds * 6}deg)` }}
      />
      <div className="absolute inset-x-0 top-2 text-center text-[8px] uppercase tracking-[0.28em] text-stone-300/55">
        2004
      </div>
    </div>
  );
}

function StrictnessButton({
  active,
  label,
  onClick
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-[11px] uppercase tracking-[0.24em] transition ${
        active
          ? "bg-amber-200 text-stone-900"
          : "border border-stone-400/15 bg-black/20 text-stone-200 hover:bg-black/35"
      }`}
    >
      {label}
    </button>
  );
}

export function StaticApp() {
  const [filters, setFilters] = useState<DiscoveryFilters>(EMPTY_FILTERS);
  const [activeFilters, setActiveFilters] = useState<DiscoveryFilters | null>(null);
  const [currentTrack, setCurrentTrack] = useState<TrackCandidate | null>(null);
  const [history, setHistory] = useState<TrackCandidate[]>([]);
  const [status, setStatus] = useState("Set a mood and pull a track.");
  const [isLoading, setIsLoading] = useState(false);
  const [queueStatus, setQueueStatus] = useState<DiscoveryStatusResponse["queue"] | null>(null);
  const [resolvedGenre, setResolvedGenre] = useState<string | undefined>(undefined);
  const [spotifySession, setSpotifySession] = useState<SpotifySessionPayload | null>(null);
  const [spotifyPlayerReady, setSpotifyPlayerReady] = useState(false);
  const [spotifyDeviceId, setSpotifyDeviceId] = useState<string | null>(null);
  const [view, setView] = useState<"settings" | "player">("settings");
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [ambientEnabled, setAmbientEnabled] = useState(true);
  const [clockTime, setClockTime] = useState(() => new Date());
  const audioRef = useRef<HTMLAudioElement>(null);
  const previewPlaybackRequestRef = useRef(0);
  const ambientEnabledRef = useRef(ambientEnabled);
  const stormContextRef = useRef<AudioContext | null>(null);
  const stormMasterGainRef = useRef<GainNode | null>(null);
  const stormThunderIntervalRef = useRef<number | null>(null);
  const activeFiltersKey = useMemo(
    () => (activeFilters ? JSON.stringify(activeFilters) : null),
    [activeFilters]
  );
  const spotifyLoginHref = useMemo(() => {
    const configuredAppUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
    if (!configuredAppUrl) {
      return "/api/spotify/login";
    }

    try {
      return new URL("/api/spotify/login", configuredAppUrl).toString();
    } catch {
      return "/api/spotify/login";
    }
  }, []);

  useEffect(() => {
    fetch("/api/spotify/session", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload: SpotifySessionPayload) => setSpotifySession(payload))
      .catch(() =>
        setSpotifySession({
          configured: false,
          connected: false,
          accessToken: null,
          expiresAt: null
        })
      );
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setClockTime(new Date());
    }, 1000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    ambientEnabledRef.current = ambientEnabled;
  }, [ambientEnabled]);

  useEffect(() => {
    if (!spotifySession?.accessToken) {
      return;
    }

    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[src="https://sdk.scdn.co/spotify-player.js"]'
    );

    const setupPlayer = () => {
      if (!window.Spotify) {
        return;
      }

      const player = new window.Spotify.Player({
        name: "Static Bedroom Player",
        getOAuthToken: (callback) => callback(spotifySession.accessToken!),
        volume: 0.7
      });

      player.addListener("ready", (payload: unknown) => {
        const readyPayload = payload as PlayerDeviceReadyPayload;
        setSpotifyPlayerReady(true);
        setSpotifyDeviceId(readyPayload.device_id);
      });

      player.addListener("initialization_error", () => {
        setPlaybackError("Spotify playback SDK failed to initialize.");
      });

      player.connect().catch(() => {
        setPlaybackError("Spotify player failed to connect.");
      });
    };

    window.onSpotifyWebPlaybackSDKReady = setupPlayer;

    if (existingScript) {
      setupPlayer();
      return;
    }

    const script = document.createElement("script");
    script.src = "https://sdk.scdn.co/spotify-player.js";
    script.async = true;
    document.body.appendChild(script);
  }, [spotifySession?.accessToken]);

  useEffect(() => {
    function startStormLoop() {
      if (stormContextRef.current) {
        if (stormContextRef.current.state === "suspended") {
          void stormContextRef.current.resume();
        }
        return;
      }

      const AudioContextClass = window.AudioContext;
      if (!AudioContextClass) {
        return;
      }

      const context = new AudioContextClass();
      const masterGain = context.createGain();
      masterGain.gain.value = 0;
      masterGain.connect(context.destination);

      const noiseBuffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let index = 0; index < data.length; index += 1) {
        data[index] = Math.random() * 2 - 1;
      }

      const rainSource = context.createBufferSource();
      rainSource.buffer = noiseBuffer;
      rainSource.loop = true;
      const rainFilter = context.createBiquadFilter();
      rainFilter.type = "bandpass";
      rainFilter.frequency.value = 2800;
      rainFilter.Q.value = 0.7;
      const rainGain = context.createGain();
      rainGain.gain.value = 0.026;
      rainSource.connect(rainFilter);
      rainFilter.connect(rainGain);
      rainGain.connect(masterGain);
      rainSource.start();

      const windSource = context.createBufferSource();
      windSource.buffer = noiseBuffer;
      windSource.loop = true;
      const windFilter = context.createBiquadFilter();
      windFilter.type = "lowpass";
      windFilter.frequency.value = 240;
      const windGain = context.createGain();
      windGain.gain.value = 0.018;
      const windLfo = context.createOscillator();
      windLfo.type = "sine";
      windLfo.frequency.value = 0.07;
      const windLfoGain = context.createGain();
      windLfoGain.gain.value = 110;
      windLfo.connect(windLfoGain);
      windLfoGain.connect(windFilter.frequency);
      windSource.connect(windFilter);
      windFilter.connect(windGain);
      windGain.connect(masterGain);
      windSource.start();
      windLfo.start();

      const thunderInterval = window.setInterval(() => {
        if (!stormContextRef.current || !stormMasterGainRef.current || !ambientEnabledRef.current) {
          return;
        }

        if (Math.random() > 0.22) {
          return;
        }

        const thunderSource = context.createBufferSource();
        thunderSource.buffer = noiseBuffer;
        const thunderFilter = context.createBiquadFilter();
        thunderFilter.type = "lowpass";
        thunderFilter.frequency.value = 140;
        const thunderGain = context.createGain();
        const now = context.currentTime;
        thunderGain.gain.setValueAtTime(0.0001, now);
        thunderGain.gain.exponentialRampToValueAtTime(0.05, now + 0.12);
        thunderGain.gain.exponentialRampToValueAtTime(0.0001, now + 3.2);
        thunderSource.connect(thunderFilter);
        thunderFilter.connect(thunderGain);
        thunderGain.connect(masterGain);
        thunderSource.start(now);
        thunderSource.stop(now + 3.3);
      }, 7500);

      stormContextRef.current = context;
      stormMasterGainRef.current = masterGain;
      stormThunderIntervalRef.current = thunderInterval;
    }

    function primeAudio() {
      startStormLoop();
    }

    window.addEventListener("pointerdown", primeAudio, { once: true });
    window.addEventListener("keydown", primeAudio, { once: true });

    return () => {
      window.removeEventListener("pointerdown", primeAudio);
      window.removeEventListener("keydown", primeAudio);
      if (stormThunderIntervalRef.current) {
        window.clearInterval(stormThunderIntervalRef.current);
      }
      if (stormContextRef.current) {
        void stormContextRef.current.close();
      }
    };
  }, []);

  useEffect(() => {
    const gainNode = stormMasterGainRef.current;
    const context = stormContextRef.current;
    if (!gainNode || !context) {
      return;
    }

    const target = ambientEnabled && view === "settings" ? 0.22 : 0.001;
    gainNode.gain.cancelScheduledValues(context.currentTime);
    gainNode.gain.linearRampToValueAtTime(target, context.currentTime + 0.8);
  }, [ambientEnabled, view]);

  const stats = useMemo(
    () => [
      { label: "Track Plays", value: formatNumber(currentTrack?.playCount) },
      { label: "Artist Listeners", value: formatNumber(currentTrack?.artistListeners) },
      { label: "Release", value: formatReleaseDate(currentTrack?.releaseDate) },
      { label: "Tempo", value: currentTrack?.bpm ? `${currentTrack.bpm} BPM` : "Unknown" }
    ],
    [currentTrack]
  );

  useEffect(() => {
    if (!activeFilters) {
      return;
    }

    let cancelled = false;

    async function pollQueue() {
      try {
        const response = await fetch("/api/discover/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify(activeFilters)
        });

        const payload = (await response.json()) as DiscoveryStatusResponse | { error?: string };
        if (cancelled) {
          return;
        }

        if (!response.ok || !("queue" in payload)) {
          throw new Error(
            ("error" in payload && payload.error) || "Queue status request failed."
          );
        }

        setQueueStatus(payload.queue);
        setResolvedGenre(payload.resolvedGenre);

        if (!payload.configured) {
          setStatus("Live providers are missing. Add Spotify and Last.fm credentials.");
          return;
        }

        if (!isLoading && payload.queue.queueSize === 0 && payload.queue.isFilling) {
          setStatus(
            payload.resolvedGenre
              ? `Buffering exact ${payload.resolvedGenre} finds...`
              : "Buffering exact random finds..."
          );
        }
      } catch (error) {
        if (!cancelled) {
          setQueueStatus(null);
          setStatus(error instanceof Error ? error.message : "Queue status request failed.");
        }
      }
    }

    void pollQueue();
    const interval = window.setInterval(() => {
      void pollQueue();
    }, 6000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [activeFilters, activeFiltersKey, isLoading]);

  async function playPreview(track: TrackCandidate) {
    const audio = audioRef.current;
    if (!audio || !track.previewUrl) {
      return false;
    }

    const requestId = previewPlaybackRequestRef.current + 1;
    previewPlaybackRequestRef.current = requestId;

    try {
      audio.pause();

      if (audio.src !== track.previewUrl) {
        audio.src = track.previewUrl;
        audio.load();
      } else {
        audio.currentTime = 0;
      }

      await audio.play();

      if (previewPlaybackRequestRef.current !== requestId) {
        audio.pause();
        return false;
      }

      return true;
    } catch (error) {
      if (previewPlaybackRequestRef.current !== requestId) {
        return false;
      }

      if (error instanceof DOMException && error.name === "AbortError") {
        return false;
      }

      setPlaybackError("Browser autoplay was blocked. Press play on the preview deck.");
      return false;
    }
  }

  async function togglePreviewPlayback() {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    if (!audio.paused) {
      previewPlaybackRequestRef.current += 1;
      audio.pause();
      return;
    }

    if (!currentTrack?.previewUrl) {
      return;
    }

    await playPreview(currentTrack);
  }

  async function trySpotifyPlayback(track: TrackCandidate) {
    if (!spotifySession?.connected || !spotifyPlayerReady || !spotifyDeviceId || !track.spotifyUri) {
      return false;
    }

    try {
      const transferResponse = await fetch("/api/spotify/player/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: spotifyDeviceId })
      });
      if (!transferResponse.ok) {
        throw new Error("Transfer failed");
      }

      const playResponse = await fetch("/api/spotify/player/play", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: spotifyDeviceId, spotifyUri: track.spotifyUri })
      });
      if (!playResponse.ok) {
        throw new Error("Play failed");
      }

      return true;
    } catch {
      setPlaybackError("Spotify playback failed. Falling back to preview audio when available.");
      return false;
    }
  }

  function explainPlaybackUnavailable(track: TrackCandidate) {
    if (track.previewUrl) {
      return;
    }

    if (!spotifySession?.connected) {
      setPlaybackError(
        "This track has no Spotify preview. Connect Spotify playback to hear full tracks."
      );
      return;
    }

    if (!spotifyPlayerReady || !spotifyDeviceId) {
      setPlaybackError(
        "Spotify is connected, but the Web Playback device is not ready yet. Wait a moment and try again."
      );
      return;
    }

    setPlaybackError(
      "This track has no preview, and Spotify playback did not start. Spotify Premium playback may be required."
    );
  }

  async function pullQueuedTrack(nextFilters: DiscoveryFilters, actionLabel: string) {
    setIsLoading(true);
    setIsTransitioning(true);
    setActiveFilters(nextFilters);
    setStatus(
      nextFilters.genre
        ? `Waiting for an exact ${nextFilters.genre} match...`
        : "Waiting for the random queue to land on a match..."
    );
    setPlaybackError(null);

    try {
      const response = await fetch("/api/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify(nextFilters)
      });

      const payload = (await response.json()) as DiscoveryResponse | { error?: string };

      if (!response.ok) {
        throw new Error(("error" in payload && payload.error) || `${actionLabel} failed.`);
      }

      if (!("track" in payload)) {
        throw new Error(`${actionLabel} failed.`);
      }

      setCurrentTrack(payload.track);
      setQueueStatus(payload.queue);
      setResolvedGenre(payload.resolvedGenre);
      setStatus(
        `Live match found${payload.resolvedGenre ? ` via ${payload.resolvedGenre}` : ""}. ` +
          `${payload.queue.queueSize} waiting in the buffer.`
      );
      setHistory((previous) => [payload.track, ...previous.filter((item) => item.id !== payload.track.id)]);
      setView("player");

      const playedViaSpotify = await trySpotifyPlayback(payload.track);

      if (!playedViaSpotify && payload.track.previewUrl) {
        await playPreview(payload.track);
      } else if (playedViaSpotify && audioRef.current) {
        previewPlaybackRequestRef.current += 1;
        audioRef.current.pause();
      } else if (!playedViaSpotify) {
        explainPlaybackUnavailable(payload.track);
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : `${actionLabel} failed.`);
    } finally {
      setIsLoading(false);
      window.setTimeout(() => setIsTransitioning(false), 700);
    }
  }

  async function discover() {
    await pullQueuedTrack(filters, "Discovery");
  }

  function stepHistory(direction: "back" | "next") {
    if (direction === "back" && history.length === 0) {
      return;
    }

    if (direction === "back" && history.length > 1) {
      const previousTrack = history[1];
      setCurrentTrack(previousTrack);
      setView("player");
      void playPreview(previousTrack);
      return;
    }

    void pullQueuedTrack(activeFilters ?? filters, "Queue fetch");
  }

  function hardReset() {
    setFilters(EMPTY_FILTERS);
    setActiveFilters(null);
    setCurrentTrack(null);
    setHistory([]);
    setQueueStatus(null);
    setResolvedGenre(undefined);
    setStatus("Set a mood and pull a track.");
    setPlaybackError(null);
    setView("settings");
    previewPlaybackRequestRef.current += 1;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute("src");
      audioRef.current.load();
    }

  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-noise wall-grid px-4 py-6 text-stone-50 md:px-8">
      <div className="absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-amber-300/10 to-transparent blur-3xl" />
      <div className="absolute left-[8%] top-[18%] h-44 w-44 rounded-full bg-rose-500/10 blur-3xl" />
      <div className="absolute right-[10%] top-[8%] h-56 w-56 rounded-full bg-cyan-300/10 blur-3xl" />
      <div className="mx-auto grid min-h-[calc(100vh-3rem)] max-w-7xl gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <section
          className={`scene-card relative overflow-hidden rounded-[2rem] border border-stone-400/15 bg-[linear-gradient(180deg,rgba(62,37,27,0.9),rgba(22,13,10,0.96))] p-5 shadow-2xl shadow-black/30 transition md:p-8 ${
            view === "player" ? "hidden lg:block" : "block"
          }`}
        >
          <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/25 to-transparent" />
          <div className="absolute left-0 top-0 h-full w-8 bg-gradient-to-r from-white/5 to-transparent" />
          <div className="absolute right-6 top-6 h-28 w-28 rounded-full bg-amber-300/20 blur-2xl" />
          <div className="absolute right-8 top-24 hidden h-32 w-24 rounded-lg border border-stone-200/10 bg-[linear-gradient(180deg,rgba(255,125,95,0.3),rgba(20,12,10,0.1))] shadow-2xl lg:block" />
          <div className="absolute right-24 top-40 hidden h-32 w-24 -rotate-6 rounded-lg border border-stone-200/10 bg-[linear-gradient(180deg,rgba(117,245,210,0.22),rgba(20,12,10,0.1))] shadow-2xl lg:block" />
          <div className="relative flex h-full flex-col justify-between gap-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.35em] text-amber-200/80">Audio Obscura</p>
                <h1 className="mt-3 max-w-lg font-display text-4xl leading-none text-amber-50 md:text-6xl">
                  Audio Obscura
                </h1>
              </div>
              <button
                type="button"
                onClick={() => setView(view === "settings" ? "player" : "settings")}
                className="rounded-full border border-stone-400/20 bg-black/20 px-4 py-2 text-xs uppercase tracking-[0.25em] text-stone-200 transition hover:bg-black/35"
              >
                {view === "settings" ? "TV View" : "Filters"}
              </button>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <label className="md:col-span-2">
                <span className="mb-2 block text-xs uppercase tracking-[0.3em] text-stone-300/80">
                  Genre or invented vibe
                </span>
                <input
                  className="w-full rounded-2xl border border-stone-400/15 bg-black/20 px-4 py-3 text-sm text-stone-100 outline-none transition focus:border-amber-300/40 focus:bg-black/30"
                  placeholder="sad robot music"
                  value={filters.genre}
                  onChange={(event) =>
                    setFilters((previous) => ({ ...previous, genre: event.target.value }))
                  }
                />
              </label>

              <NumericInput
                label="Track Plays Min"
                value={filters.trackPlayCount.min}
                onChange={(value) =>
                  setFilters((previous) => ({
                    ...previous,
                    trackPlayCount: { ...previous.trackPlayCount, min: value }
                  }))
                }
              />
              <NumericInput
                label="Track Plays Max"
                value={filters.trackPlayCount.max}
                onChange={(value) =>
                  setFilters((previous) => ({
                    ...previous,
                    trackPlayCount: { ...previous.trackPlayCount, max: value }
                  }))
                }
              />
              <NumericInput
                label="Artist Listeners Min"
                value={filters.artistListeners.min}
                onChange={(value) =>
                  setFilters((previous) => ({
                    ...previous,
                    artistListeners: { ...previous.artistListeners, min: value }
                  }))
                }
              />
              <NumericInput
                label="Artist Listeners Max"
                value={filters.artistListeners.max}
                onChange={(value) =>
                  setFilters((previous) => ({
                    ...previous,
                    artistListeners: { ...previous.artistListeners, max: value }
                  }))
                }
              />
              <NumericInput
                label="BPM Min"
                value={filters.bpm.min}
                onChange={(value) =>
                  setFilters((previous) => ({
                    ...previous,
                    bpm: { ...previous.bpm, min: value }
                  }))
                }
              />
              <NumericInput
                label="BPM Max"
                value={filters.bpm.max}
                onChange={(value) =>
                  setFilters((previous) => ({
                    ...previous,
                    bpm: { ...previous.bpm, max: value }
                  }))
                }
              />
            </div>

            <div className="grid gap-3 rounded-[1.5rem] border border-stone-400/15 bg-black/20 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.3em] text-stone-400">
                    Queue Engine
                  </p>
                  <p className="mt-1 text-sm text-stone-200/75">
                    The backend now waits for exact live matches and keeps a slow background buffer warm.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <StrictnessButton
                    label="Exact Live"
                    active
                    onClick={() =>
                      setFilters((previous) => ({ ...previous, strictness: "exact" }))
                    }
                  />
                </div>
              </div>
            </div>

            <div className="grid gap-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] uppercase tracking-[0.3em] text-stone-400">
                  Quick Scenes
                </p>
                <button
                  type="button"
                  onClick={hardReset}
                  className="text-[11px] uppercase tracking-[0.24em] text-stone-300/70 transition hover:text-stone-100"
                >
                  Hard Reset
                </button>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {FILTER_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => setFilters(preset.filters)}
                    className="rounded-[1.35rem] border border-stone-400/15 bg-black/20 p-4 text-left transition hover:bg-black/30"
                  >
                    <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-100">
                      {preset.label}
                    </p>
                    <p className="mt-2 text-sm text-stone-300/75">{preset.description}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
              <div>
                <p className="text-sm text-amber-100/85">{status}</p>
                <p className="mt-2 text-xs uppercase tracking-[0.24em] text-stone-400">
                  {queueStatus
                    ? `Queue ${queueStatus.queueSize}/${queueStatus.targetSize}${
                        queueStatus.isFilling ? "  .  warming" : ""
                      }${resolvedGenre ? `  .  ${resolvedGenre}` : ""}`
                    : "Queue idle"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void discover()}
                disabled={isLoading}
                className={`rounded-full px-8 py-4 font-semibold uppercase tracking-[0.25em] text-stone-900 transition disabled:cursor-wait disabled:opacity-70 ${
                  isLoading
                    ? "bg-amber-50 shadow-[0_0_40px_rgba(255,223,169,0.45)]"
                    : "bg-amber-200 hover:bg-amber-100"
                }`}
              >
                {isLoading ? "Searching" : "Discover"}
              </button>
            </div>

          </div>
        </section>

        <section
          className={`scene-card relative min-h-[720px] items-center justify-center overflow-hidden rounded-[2.5rem] border border-stone-400/15 bg-[radial-gradient(circle_at_top,rgba(255,193,121,0.24),transparent_25%),linear-gradient(180deg,#21120b,#110b0d)] p-4 shadow-glow ${
            view === "settings" ? "hidden lg:flex" : "flex"
          }`}
        >
          <WallClock time={clockTime} />
          <div className="rain-flash absolute inset-0 pointer-events-none" />
          <div className="absolute inset-x-0 bottom-0 h-40 bg-[linear-gradient(180deg,transparent,rgba(19,10,8,0.9)),linear-gradient(90deg,#2c170f,#4a2819,#2c170f)]" />
          <div className="absolute left-10 top-8 hidden h-52 w-44 rounded-[1.9rem] border border-cyan-200/15 bg-[linear-gradient(180deg,rgba(91,140,158,0.28),rgba(10,20,27,0.22))] shadow-[0_0_60px_rgba(74,130,160,0.08)] lg:block" />
          <div className="rain-window absolute left-[3.6rem] top-[3.3rem] hidden h-40 w-32 overflow-hidden rounded-[1.2rem] border border-cyan-100/10 bg-[radial-gradient(circle_at_top,rgba(218,244,255,0.22),transparent_60%),linear-gradient(180deg,rgba(23,34,48,0.7),rgba(8,11,18,0.65))] lg:block">
            <div className="window-rain-layer" />
            <div className="window-rain-layer window-rain-layer-delayed" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_15%,rgba(255,255,255,0.08),transparent_35%)]" />
            <div className="absolute bottom-4 left-6 h-16 w-20 rounded-t-full bg-black/35 blur-md" />
            <div className="absolute bottom-0 left-0 right-0 h-12 bg-[linear-gradient(180deg,transparent,rgba(2,4,8,0.82))]" />
          </div>
          <div className="absolute left-10 top-8 hidden h-52 w-44 rounded-[1.9rem] border border-stone-100/5 shadow-[inset_0_0_0_6px_rgba(44,25,18,0.55)] lg:block" />
          <div className="absolute right-10 top-24 hidden h-32 w-24 -rotate-6 rounded-md border border-stone-300/18 bg-[linear-gradient(180deg,rgba(178,67,102,0.34),rgba(43,18,18,0.18))] shadow-xl lg:block">
            <div className="absolute inset-3 border border-stone-100/10" />
            <div className="absolute bottom-3 left-3 text-[9px] uppercase tracking-[0.25em] text-stone-100/70">AIM</div>
          </div>
          <div className="absolute right-24 top-40 hidden h-36 w-24 rotate-6 rounded-md border border-stone-300/18 bg-[linear-gradient(180deg,rgba(77,136,199,0.32),rgba(18,23,43,0.15))] shadow-xl lg:block">
            <div className="absolute inset-3 border border-stone-100/10" />
            <div className="absolute bottom-3 left-3 text-[9px] uppercase tracking-[0.25em] text-stone-100/70">PS2</div>
          </div>
          <div className="room-idle absolute right-14 top-[17.5rem] hidden h-20 w-32 rounded-2xl border border-stone-200/12 bg-[linear-gradient(180deg,rgba(26,28,37,0.82),rgba(13,13,18,0.92))] shadow-xl lg:block">
            <div className="absolute left-3 top-3 text-[9px] uppercase tracking-[0.28em] text-emerald-200/80">Away Msg</div>
            <div className="absolute left-3 top-8 right-3 text-[10px] leading-4 text-stone-200/70">
              studying, raining, pretending winamp is sentient
              <span className="cursor-blink ml-1 inline-block text-emerald-200/70">|</span>
            </div>
          </div>
          <div className="absolute bottom-16 left-16 hidden h-28 w-56 rounded-[1.4rem] border border-stone-200/10 bg-[linear-gradient(180deg,rgba(93,58,40,0.6),rgba(37,20,14,0.95))] shadow-2xl lg:block" />
          <div className="absolute bottom-[7.6rem] left-[4.4rem] hidden h-3 w-52 rounded-full bg-black/25 lg:block" />
          <div className="absolute bottom-[8.8rem] left-[4.8rem] hidden gap-2 lg:flex">
            <span className="h-14 w-8 rounded-sm bg-emerald-200/15" />
            <span className="h-14 w-8 rounded-sm bg-rose-200/15" />
            <span className="h-14 w-8 rounded-sm bg-amber-200/15" />
            <span className="h-14 w-8 rounded-sm bg-cyan-200/15" />
            <span className="h-14 w-8 rounded-sm bg-stone-200/15" />
            <span className="h-14 w-8 rounded-sm bg-violet-200/15" />
          </div>
          <div className="lamp-pulse absolute bottom-12 left-6 h-32 w-20 rounded-t-full bg-gradient-to-b from-amber-200/90 to-amber-500/10 blur-md" />
          <div className="absolute bottom-8 left-10 h-48 w-8 rounded-full bg-amber-950/70" />
          <div className="room-idle absolute bottom-14 right-8 hidden h-44 w-64 rounded-t-[2rem] rounded-b-[1rem] border border-stone-200/10 bg-[linear-gradient(180deg,rgba(64,42,57,0.62),rgba(25,17,26,0.95))] shadow-2xl lg:block">
            <div className="absolute inset-x-4 top-5 h-12 rounded-full bg-black/15 blur-lg" />
            <div className="absolute left-0 right-0 top-8 h-24 bg-[linear-gradient(180deg,rgba(241,165,175,0.08),rgba(26,13,18,0.0))]" />
            <div className="absolute bottom-4 left-6 right-6 h-10 rounded-full border border-stone-100/8 bg-stone-100/5" />
          </div>
          <div className="absolute bottom-[13.4rem] right-10 hidden h-10 w-20 rounded-[1rem] border border-stone-200/10 bg-[linear-gradient(180deg,rgba(27,30,42,0.9),rgba(14,15,20,0.9))] lg:block">
            <div className="absolute left-3 top-2 text-[8px] uppercase tracking-[0.32em] text-cyan-200/80">DS Lite</div>
          </div>
          <div className="absolute bottom-[12.8rem] right-24 hidden h-8 w-16 rounded-md border border-stone-200/10 bg-stone-100/10 lg:block" />
          <div className="absolute bottom-[15rem] right-36 hidden h-14 w-14 rounded-[0.85rem] border border-stone-200/10 bg-[linear-gradient(180deg,rgba(237,237,242,0.75),rgba(120,124,144,0.62))] shadow-lg lg:block">
            <div className="absolute left-2 top-2 text-[8px] uppercase tracking-[0.28em] text-stone-900/70">mp3</div>
          </div>
          <button
            type="button"
            onClick={() => setAmbientEnabled((value) => !value)}
            className="absolute bottom-7 left-1/2 z-10 hidden -translate-x-1/2 rounded-full border border-stone-200/15 bg-black/30 px-4 py-2 text-[11px] uppercase tracking-[0.24em] text-stone-100/80 transition hover:bg-black/45 lg:block"
          >
            {ambientEnabled ? "Storm Loop On" : "Storm Loop Off"}
          </button>

          <div
            className={`float-slow relative w-full max-w-xl rounded-[2.5rem] bg-[#2a211f] p-5 shadow-[0_30px_60px_rgba(0,0,0,0.45)] transition duration-500 md:p-7 ${
              isTransitioning ? "scale-[1.02] rotate-[0.4deg]" : ""
            }`}
          >
            <div className="rounded-[2rem] bg-[#0a1110] p-4 md:p-5">
              <div
                className={`crt crt-flicker signal-sweep relative overflow-hidden rounded-[1.5rem] border border-emerald-200/10 bg-[radial-gradient(circle_at_top,rgba(126,245,214,0.18),transparent_35%),linear-gradient(180deg,#10201d,#050807)] p-4 transition duration-500 ${
                  isTransitioning ? "scale-[1.01] shadow-[0_0_55px_rgba(126,245,214,0.16)]" : ""
                }`}
              >
                {isTransitioning ? <div className="static-flash" /> : null}
                <div className="flex items-center justify-between gap-3 pb-4 text-[11px] uppercase tracking-[0.35em] text-emerald-100/65">
                  <span>CRT Playback</span>
                  <span className="flex items-center gap-2">
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${
                        isLoading || queueStatus?.isFilling
                          ? "animate-pulse bg-amber-300 shadow-[0_0_16px_rgba(252,211,77,0.75)]"
                          : "bg-emerald-300 shadow-[0_0_16px_rgba(110,231,183,0.55)]"
                      }`}
                    />
                    {isLoading ? "Waiting On Queue" : queueStatus?.isFilling ? "Buffering" : "Live Signal"}
                  </span>
                </div>

                {currentTrack ? (
                  <div className="grid gap-4 md:grid-cols-[1fr_1.1fr]">
                    <div className="relative aspect-square overflow-hidden rounded-[1.25rem] border border-emerald-200/10 bg-emerald-100/5">
                      {currentTrack.albumArtUrl ? (
                        <Image
                          src={currentTrack.albumArtUrl}
                          alt={currentTrack.album}
                          fill
                          className="object-cover opacity-90 transition duration-700 hover:scale-105"
                        />
                      ) : null}
                    </div>

                    <div className="flex flex-col justify-between gap-4">
                      <div>
                        <p className="text-xs uppercase tracking-[0.25em] text-emerald-100/60">
                          Now Tuning
                        </p>
                        <h2 className="mt-2 font-display text-3xl leading-tight text-emerald-50">
                          {currentTrack.title}
                        </h2>
                        <p className="mt-2 text-sm text-emerald-100/75">{currentTrack.artist}</p>
                        <p className="text-sm text-emerald-100/55">{currentTrack.album}</p>
                        {currentTrack.genreHint ? (
                          <p className="mt-4 inline-flex w-fit rounded-full border border-emerald-200/15 px-3 py-1 text-xs uppercase tracking-[0.2em] text-emerald-100/70">
                            {currentTrack.genreHint}
                          </p>
                        ) : null}
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-xs text-emerald-50/80">
                        {stats.map((stat) => (
                          <div key={stat.label} className="rounded-2xl border border-emerald-100/10 bg-emerald-100/5 p-3">
                            <p className="uppercase tracking-[0.2em] text-emerald-100/45">{stat.label}</p>
                            <p className="mt-2 text-sm">{stat.value}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex min-h-80 flex-col items-center justify-center rounded-[1.4rem] border border-dashed border-emerald-100/15 bg-emerald-100/5 px-8 text-center">
                    <p className="font-display text-3xl text-emerald-50">No signal yet</p>
                    <p className="mt-3 max-w-sm text-sm text-emerald-100/65">
                      Hit discover and the backend will wait for an exact live match, then keep the queue warm behind the scenes.
                    </p>
                  </div>
                )}
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
                <div className="rounded-[1.5rem] border border-stone-300/10 bg-black/30 p-4">
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => stepHistory("back")}
                      className="dial h-14 w-14 rounded-full text-lg text-amber-50 transition hover:scale-105"
                    >
                      ⏮
                    </button>
                    <button
                      type="button"
                      onClick={() => void togglePreviewPlayback()}
                      className="dial h-14 w-14 rounded-full text-lg text-amber-50 transition hover:scale-105"
                    >
                      ⏯
                    </button>
                    <button
                      type="button"
                      onClick={() => stepHistory("next")}
                      className="dial h-14 w-14 rounded-full text-lg text-amber-50 transition hover:scale-105"
                    >
                      ⏭
                    </button>
                  </div>

                  <audio ref={audioRef} controls className="mt-4 w-full opacity-80" />

                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-stone-300/75">
                    <span className="rounded-full border border-stone-400/15 px-3 py-1">
                      Queue {queueStatus ? `${queueStatus.queueSize}/${queueStatus.targetSize}` : "idle"}
                    </span>
                    <span className="rounded-full border border-stone-400/15 px-3 py-1">
                      Spotify {spotifySession?.connected ? "connected" : "not connected"}
                    </span>
                    <span className="rounded-full border border-stone-400/15 px-3 py-1">
                      SDK {spotifyPlayerReady ? "ready" : "idle"}
                    </span>
                    <span className="rounded-full border border-stone-400/15 px-3 py-1">
                      Device {spotifyDeviceId ? "captured" : "none"}
                    </span>
                    <span className="rounded-full border border-stone-400/15 px-3 py-1">
                      Preview {currentTrack?.previewUrl ? "available" : "missing"}
                    </span>
                    <span className="rounded-full border border-stone-400/15 px-3 py-1">
                      Engine {queueStatus?.isFilling || isLoading ? "warming" : "ready"}
                    </span>
                  </div>

                  {!spotifySession?.connected ? (
                    <p className="mt-3 text-xs text-amber-200/85">
                      Song playback on the web page only works when Spotify is connected.
                    </p>
                  ) : null}

                  {playbackError ? <p className="mt-3 text-xs text-rose-300">{playbackError}</p> : null}
                </div>

                <div className="grid gap-3">
                  {spotifySession?.configured && !spotifySession?.connected ? (
                    <a
                      href={spotifyLoginHref}
                      className="rounded-full border border-emerald-200/20 bg-emerald-300/10 px-5 py-3 text-center text-xs font-semibold uppercase tracking-[0.25em] text-emerald-100 transition hover:bg-emerald-300/20"
                    >
                      Connect Spotify
                    </a>
                  ) : spotifySession?.connected ? (
                    <div className="rounded-[1.4rem] border border-emerald-200/18 bg-emerald-300/10 px-4 py-3 text-center text-[11px] uppercase tracking-[0.22em] text-emerald-100/85">
                      Spotify Connected
                    </div>
                  ) : (
                    <div className="rounded-[1.4rem] border border-stone-300/12 bg-black/25 px-4 py-3 text-center text-[11px] uppercase tracking-[0.22em] text-stone-300/70">
                      Live Queue Only
                    </div>
                  )}
                  {currentTrack?.externalUrl ? (
                    <a
                      href={currentTrack.externalUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-full border border-stone-300/15 bg-black/25 px-5 py-3 text-center text-xs font-semibold uppercase tracking-[0.25em] text-stone-100 transition hover:bg-black/40"
                    >
                      Open Track
                    </a>
                  ) : null}
                </div>
              </div>

            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
