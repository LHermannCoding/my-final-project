import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const nextBin = require.resolve("next/dist/bin/next");
const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const content = fs.readFileSync(filePath, "utf8");
  const result = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    result[key] = value;
  }

  return result;
}

function loadLocalConfig() {
  return {
    ...parseEnvFile(path.join(projectRoot, ".env")),
    ...parseEnvFile(path.join(projectRoot, ".env.local")),
    ...process.env
  };
}

function readUrl(value, label) {
  if (!value) {
    return null;
  }

  try {
    return new URL(value);
  } catch {
    console.error(`${label} is not a valid URL: ${value}`);
    process.exit(1);
  }
}

const env = loadLocalConfig();
const appUrl = readUrl(env.NEXT_PUBLIC_APP_URL, "NEXT_PUBLIC_APP_URL");
const redirectUrl = readUrl(env.SPOTIFY_REDIRECT_URI, "SPOTIFY_REDIRECT_URI");

if (appUrl && redirectUrl) {
  const expectedRedirectPath = "/api/spotify/callback";
  const originMismatch = appUrl.origin !== redirectUrl.origin;
  const pathMismatch = redirectUrl.pathname !== expectedRedirectPath;

  if (originMismatch || pathMismatch) {
    console.error(
      `Local Spotify OAuth config is inconsistent.\n` +
        `NEXT_PUBLIC_APP_URL=${appUrl.origin}\n` +
        `SPOTIFY_REDIRECT_URI=${redirectUrl.toString()}\n` +
        `Expected SPOTIFY_REDIRECT_URI=${appUrl.origin}${expectedRedirectPath}`
    );
    process.exit(1);
  }
}

const host = appUrl?.hostname ?? "127.0.0.1";
const port = appUrl?.port ? Number(appUrl.port) : 3000;

const child = spawn(process.execPath, [nextBin, "dev", "-H", host, "-p", String(port)], {
  cwd: projectRoot,
  stdio: "inherit",
  env: process.env
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
