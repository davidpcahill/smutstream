import { getSettings } from "./settings.js";
import type { DisplayPost } from "./scheduler.js";

/**
 * Fire-and-forget Telegram "now-playing" announcer. When enabled + token + chat
 * are configured, posts the current image via sendPhoto with a caption.
 * Throttled so a rapid advance burst doesn't spam the chat.
 */
let lastSentAt = 0;
const THROTTLE_MS = 8_000;

export function announceToTelegram(post: DisplayPost): void {
  const s = getSettings();
  if (!s.telegramEnabled || !s.telegramBotToken || !s.telegramChatId) return;
  const now = Date.now();
  if (now - lastSentAt < THROTTLE_MS) return;
  lastSentAt = now;

  const source = `https://e621.net/posts/${post.id}`;
  const captionParts = [
    post.groupName ? `<b>${escapeHtml(post.groupName)}</b>` : null,
    post.artists.length > 0 ? `by ${escapeHtml(post.artists.slice(0, 3).join(", "))}` : null,
    post.contributorName ? `added by ${escapeHtml(post.contributorName)}` : null,
    `<a href="${source}">e621.net/posts/${post.id}</a>`,
  ].filter(Boolean);

  const url = `https://api.telegram.org/bot${encodeURIComponent(s.telegramBotToken)}/sendPhoto`;
  const body = JSON.stringify({
    chat_id: s.telegramChatId,
    photo: post.remoteUrl,
    caption: captionParts.join("\n"),
    parse_mode: "HTML",
  });

  void fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  }).catch((err) => {
    console.error("[telegram] sendPhoto failed:", (err as Error).message);
  });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;",
  );
}
