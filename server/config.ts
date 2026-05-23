import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function num(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw === "") return fallback;
  const v = Number(raw);
  return Number.isFinite(v) ? v : fallback;
}

function str(key: string, fallback = ""): string {
  return process.env[key] ?? fallback;
}

function list(key: string): string[] {
  return str(key)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

const portDefault = num("PORT", 3000);
export const config = {
  root: ROOT,
  port: portDefault,
  publicPort: num("PUBLIC_PORT", portDefault),
  bindHost: str("BIND_HOST", "0.0.0.0"),
  e621: {
    username: str("E621_USERNAME"),
    apiKey: str("E621_API_KEY"),
    userAgent: `smutstream/0.1 (by ${str("E621_USERNAME", "anonymous")} on e621)`,
  },
  safetyBlacklist: list("SAFETY_BLACKLIST"),
  slide: {
    durationSec: num("SLIDE_DURATION_SECONDS", 60),
    fadeSec: num("SLIDE_FADE_SECONDS", 2),
  },
  overlay: {
    intervalSec: num("OVERLAY_INTERVAL_SECONDS", 360),
    durationSec: num("OVERLAY_DURATION_SECONDS", 45),
  },
  cache: {
    dir: path.resolve(ROOT, str("CACHE_DIR", "./cache")),
    ttlHours: num("CACHE_TTL_HOURS", 12),
  },
  dataDir: path.resolve(ROOT, "./data"),
  webDistDir: path.resolve(ROOT, "./dist/web"),
};

export type AppConfig = typeof config;
