import { db } from "./db.js";
import { config } from "./config.js";

export type TransitionKind = "fade" | "fade-black" | "slide" | "zoom";
export type OverlayMode = "off" | "occasional" | "always";
export type OverlayVerbosity = "qr-only" | "minimal" | "normal" | "verbose";
export type OverlayCorner = "tl" | "tr" | "bl" | "br";
export type LayoutKind = "single" | "split-v" | "split-h" | "diag";
export type CommentsMode = "off" | "immediate" | "replay" | "both";

export const ALL_TRANSITIONS: TransitionKind[] = ["fade", "fade-black", "slide", "zoom"];
export const ALL_OVERLAY_MODES: OverlayMode[] = ["off", "occasional", "always"];
export const ALL_OVERLAY_VERBOSITIES: OverlayVerbosity[] = ["qr-only", "minimal", "normal", "verbose"];
export const ALL_OVERLAY_CORNERS: OverlayCorner[] = ["tl", "tr", "bl", "br"];
export const ALL_LAYOUTS: LayoutKind[] = ["single", "split-v", "split-h", "diag"];
export const ALL_COMMENTS_MODES: CommentsMode[] = ["off", "immediate", "replay", "both"];

export type AppSettings = {
  slideDurationMs: number;
  fadeMs: number;
  enabledTransitions: TransitionKind[];
  overlayMode: OverlayMode;
  overlayIntervalMs: number;
  overlayDurationMs: number;
  overlayVerbosity: OverlayVerbosity;
  overlayOpacity: number;     // 0.3 - 1.0
  overlayScale: number;       // 0.6 - 1.6
  overlayCorner: OverlayCorner;
  wifiSsid: string | null;
  enabledLayouts: LayoutKind[];
  multiplexProbability: number; // 0 - 1; chance of using non-single layout when one is enabled
  reactionsEnabled: boolean;
  commentsMode: CommentsMode;
  musicEnabled: boolean;
  musicStation: string;         // free-form key validated by the client station registry
  musicVolume: number;          // 0 - 1
  imageCooldownMs: number;      // don't repeat an image within this window (0 = disabled)
  telegramEnabled: boolean;
  telegramBotToken: string;     // never returned to clients — server-side only
  telegramChatId: string;
  reactionConfettiEnabled: boolean;
  reactionConfettiThreshold: number;  // reactions in window
  reactionConfettiWindowMs: number;   // sliding window size
};

const getStmt = db.prepare<[string], { value: string }>(`SELECT value FROM settings WHERE key = ?`);
const setStmt = db.prepare(
  `INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
);
const clearStmt = db.prepare(`DELETE FROM settings`);

export function resetSettings(): AppSettings {
  clearStmt.run();
  return getSettings();
}

/** Strips secrets (Telegram bot token) for any payload that leaves the server.
 *  We replace the token with a presence-marker so the UI can show "configured"
 *  without exposing the value. */
export function getSettingsForClient(): AppSettings {
  const s = getSettings();
  return { ...s, telegramBotToken: s.telegramBotToken ? "•••••" : "" };
}

function readJson<T>(key: string, fallback: T): T {
  const row = getStmt.get(key);
  if (!row) return fallback;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  setStmt.run(key, JSON.stringify(value));
}

export function getSettings(): AppSettings {
  return {
    slideDurationMs: readJson("slideDurationMs", config.slide.durationSec * 1000),
    fadeMs: readJson("fadeMs", config.slide.fadeSec * 1000),
    enabledTransitions: sanitizeTransitions(readJson<TransitionKind[]>("enabledTransitions", ["fade"])),
    overlayMode: sanitizeEnum<OverlayMode>(
      readJson<OverlayMode>("overlayMode", "occasional"),
      ALL_OVERLAY_MODES,
      "occasional",
    ),
    overlayIntervalMs: readJson("overlayIntervalMs", config.overlay.intervalSec * 1000),
    overlayDurationMs: readJson("overlayDurationMs", config.overlay.durationSec * 1000),
    overlayVerbosity: sanitizeEnum<OverlayVerbosity>(
      readJson<OverlayVerbosity>("overlayVerbosity", "minimal"),
      ALL_OVERLAY_VERBOSITIES,
      "minimal",
    ),
    overlayOpacity: clampNum(readJson("overlayOpacity", 0.85), 0.3, 1.0),
    overlayScale: clampNum(readJson("overlayScale", 1.0), 0.6, 1.6),
    overlayCorner: sanitizeEnum<OverlayCorner>(
      readJson<OverlayCorner>("overlayCorner", "br"),
      ALL_OVERLAY_CORNERS,
      "br",
    ),
    wifiSsid: readJson<string | null>("wifiSsid", null),
    enabledLayouts: sanitizeLayouts(readJson<LayoutKind[]>("enabledLayouts", ["single"])),
    multiplexProbability: clampNum(readJson("multiplexProbability", 0.35), 0, 1),
    reactionsEnabled: !!readJson("reactionsEnabled", true),
    commentsMode: sanitizeEnum<CommentsMode>(
      readJson<CommentsMode>("commentsMode", "immediate"),
      ALL_COMMENTS_MODES,
      "immediate",
    ),
    musicEnabled: !!readJson("musicEnabled", true),
    musicStation: readJson<string>("musicStation", "groovesalad"),
    musicVolume: clampNum(readJson("musicVolume", 0.45), 0, 1),
    imageCooldownMs: clampNum(readJson("imageCooldownMs", 1_800_000), 0, 86_400_000), // default 30 min, max 24 h
    telegramEnabled: !!readJson("telegramEnabled", false),
    telegramBotToken: readJson<string>("telegramBotToken", ""),
    telegramChatId: readJson<string>("telegramChatId", ""),
    reactionConfettiEnabled: !!readJson("reactionConfettiEnabled", true),
    reactionConfettiThreshold: clampNum(readJson("reactionConfettiThreshold", 5), 2, 50),
    reactionConfettiWindowMs: clampNum(readJson("reactionConfettiWindowMs", 15_000), 3_000, 120_000),
  };
}

function clampNum(v: unknown, lo: number, hi: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(n, hi));
}

function sanitizeLayouts(input: unknown): LayoutKind[] {
  if (!Array.isArray(input)) return ["single"];
  const valid = input.filter((v): v is LayoutKind => ALL_LAYOUTS.includes(v as LayoutKind));
  return valid.length > 0 ? Array.from(new Set(valid)) : ["single"];
}

export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  if (patch.slideDurationMs !== undefined) {
    writeJson("slideDurationMs", clamp(patch.slideDurationMs, 3000, 120_000));
  }
  if (patch.fadeMs !== undefined) {
    writeJson("fadeMs", clamp(patch.fadeMs, 200, 6000));
  }
  if (patch.enabledTransitions !== undefined) {
    writeJson("enabledTransitions", sanitizeTransitions(patch.enabledTransitions));
  }
  if (patch.overlayMode !== undefined) {
    writeJson("overlayMode", sanitizeEnum(patch.overlayMode, ALL_OVERLAY_MODES, "occasional"));
  }
  if (patch.overlayIntervalMs !== undefined) {
    writeJson("overlayIntervalMs", clamp(patch.overlayIntervalMs, 15_000, 1_800_000));
  }
  if (patch.overlayDurationMs !== undefined) {
    writeJson("overlayDurationMs", clamp(patch.overlayDurationMs, 3000, 120_000));
  }
  if (patch.overlayVerbosity !== undefined) {
    writeJson(
      "overlayVerbosity",
      sanitizeEnum(patch.overlayVerbosity, ALL_OVERLAY_VERBOSITIES, "minimal"),
    );
  }
  if (patch.wifiSsid !== undefined) {
    const v = typeof patch.wifiSsid === "string" ? patch.wifiSsid.trim().slice(0, 64) : "";
    writeJson("wifiSsid", v || null);
  }
  if (patch.overlayOpacity !== undefined) {
    writeJson("overlayOpacity", clampNum(patch.overlayOpacity, 0.3, 1.0));
  }
  if (patch.overlayScale !== undefined) {
    writeJson("overlayScale", clampNum(patch.overlayScale, 0.6, 1.6));
  }
  if (patch.overlayCorner !== undefined) {
    writeJson("overlayCorner", sanitizeEnum(patch.overlayCorner, ALL_OVERLAY_CORNERS, "br"));
  }
  if (patch.enabledLayouts !== undefined) {
    writeJson("enabledLayouts", sanitizeLayouts(patch.enabledLayouts));
  }
  if (patch.multiplexProbability !== undefined) {
    writeJson("multiplexProbability", clampNum(patch.multiplexProbability, 0, 1));
  }
  if (patch.reactionsEnabled !== undefined) {
    writeJson("reactionsEnabled", !!patch.reactionsEnabled);
  }
  if (patch.commentsMode !== undefined) {
    writeJson("commentsMode", sanitizeEnum(patch.commentsMode, ALL_COMMENTS_MODES, "immediate"));
  }
  if (patch.musicEnabled !== undefined) {
    writeJson("musicEnabled", !!patch.musicEnabled);
  }
  if (patch.musicStation !== undefined && typeof patch.musicStation === "string") {
    writeJson("musicStation", patch.musicStation.trim().slice(0, 64));
  }
  if (patch.musicVolume !== undefined) {
    writeJson("musicVolume", clampNum(patch.musicVolume, 0, 1));
  }
  if (patch.imageCooldownMs !== undefined) {
    writeJson("imageCooldownMs", clampNum(patch.imageCooldownMs, 0, 86_400_000));
  }
  if (patch.telegramEnabled !== undefined) {
    writeJson("telegramEnabled", !!patch.telegramEnabled);
  }
  if (
    patch.telegramBotToken !== undefined &&
    typeof patch.telegramBotToken === "string" &&
    patch.telegramBotToken !== "•••••"  // sentinel = "no change"
  ) {
    writeJson("telegramBotToken", patch.telegramBotToken.trim().slice(0, 128));
  }
  if (patch.telegramChatId !== undefined && typeof patch.telegramChatId === "string") {
    writeJson("telegramChatId", patch.telegramChatId.trim().slice(0, 64));
  }
  if (patch.reactionConfettiEnabled !== undefined) {
    writeJson("reactionConfettiEnabled", !!patch.reactionConfettiEnabled);
  }
  if (patch.reactionConfettiThreshold !== undefined) {
    writeJson("reactionConfettiThreshold", clampNum(patch.reactionConfettiThreshold, 2, 50));
  }
  if (patch.reactionConfettiWindowMs !== undefined) {
    writeJson("reactionConfettiWindowMs", clampNum(patch.reactionConfettiWindowMs, 3_000, 120_000));
  }
  return getSettings();
}

function clamp(v: unknown, lo: number, hi: number): number {
  return Math.max(lo, Math.min(Number(v), hi));
}

function sanitizeEnum<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(v as T) ? (v as T) : fallback;
}

export function pickTransition(): TransitionKind {
  const enabled = getSettings().enabledTransitions;
  if (enabled.length === 0) return "fade";
  const i = Math.floor(Math.random() * enabled.length);
  return enabled[i]!;
}

export function pickLayout(): LayoutKind {
  const s = getSettings();
  const enabled = s.enabledLayouts;
  if (enabled.length === 0) return "single";
  if (enabled.length === 1) return enabled[0]!;
  // If 'single' is enabled along with multiplex kinds, use multiplexProbability
  // to decide whether to pick a multiplex layout at all.
  const multiplex = enabled.filter((l) => l !== "single");
  const hasSingle = enabled.includes("single");
  if (hasSingle && multiplex.length > 0) {
    if (Math.random() > s.multiplexProbability) return "single";
    return multiplex[Math.floor(Math.random() * multiplex.length)]!;
  }
  return enabled[Math.floor(Math.random() * enabled.length)]!;
}

export function postsNeededForLayout(layout: LayoutKind): number {
  switch (layout) {
    case "split-v":
    case "split-h":
    case "diag":
      return 2;
    default:
      return 1;
  }
}

function sanitizeTransitions(input: unknown): TransitionKind[] {
  if (!Array.isArray(input)) return ["fade"];
  const valid = input.filter((t): t is TransitionKind =>
    ALL_TRANSITIONS.includes(t as TransitionKind),
  );
  // Always include at least 'fade' as a safe default.
  return valid.length > 0 ? Array.from(new Set(valid)) : ["fade"];
}
