import { getSettings } from "./settings.js";
import { scheduler, type DisplayPost } from "./scheduler.js";
import { db, type DbGroup } from "./db.js";
import { searchPosts } from "./e621.js";
import { insertComment } from "./comments.js";
import { broadcastReaction, broadcastComment } from "./sockets.js";

// ---------------------------------------------------------------------------
// Outbound announces: only happens when explicitly enabled. Default is OFF
// so the bot doesn't spam a chat every advance — it's a control surface.
// ---------------------------------------------------------------------------

let lastAnnounceAt = 0;
const ANNOUNCE_THROTTLE_MS = 8_000;
// Per-post milestone latch so a single image hitting the threshold only
// announces once even if more reactions roll in later.
const milestoneAnnounced = new Set<number>();

export function announceToTelegram(post: DisplayPost): void {
  const s = getSettings();
  if (!s.telegramEnabled || !s.telegramBotToken || !s.telegramChatId) return;
  if (s.telegramAnnounceMode !== "everyImage") return;
  void sendPhoto(post, "now playing");
}

export function maybeAnnounceMilestone(post: DisplayPost, likeCount: number): void {
  const s = getSettings();
  if (!s.telegramEnabled || !s.telegramBotToken || !s.telegramChatId) return;
  if (s.telegramAnnounceMode !== "onMilestone") return;
  if (likeCount < s.telegramMilestoneLikes) return;
  if (milestoneAnnounced.has(post.id)) return;
  milestoneAnnounced.add(post.id);
  // Cap the latch set to avoid unbounded growth.
  if (milestoneAnnounced.size > 500) {
    const oldest = milestoneAnnounced.values().next().value;
    if (oldest !== undefined) milestoneAnnounced.delete(oldest);
  }
  void sendPhoto(post, `🔥 hot — ${likeCount} likes`);
}

async function sendPhoto(post: DisplayPost, prefix: string): Promise<void> {
  const s = getSettings();
  const now = Date.now();
  if (now - lastAnnounceAt < ANNOUNCE_THROTTLE_MS) return;
  lastAnnounceAt = now;

  const source = `https://e621.net/posts/${post.id}`;
  const caption = [
    `<b>${escapeHtml(prefix)}</b>`,
    post.groupName ? `· ${escapeHtml(post.groupName)}` : null,
    post.artists.length > 0 ? `by ${escapeHtml(post.artists.slice(0, 3).join(", "))}` : null,
    post.contributorName ? `added by ${escapeHtml(post.contributorName)}` : null,
    `<a href="${source}">e621.net/posts/${post.id}</a>`,
  ].filter(Boolean).join("\n");

  try {
    await tg(s.telegramBotToken, "sendPhoto", {
      chat_id: s.telegramChatId,
      photo: post.remoteUrl,
      caption,
      parse_mode: "HTML",
    });
  } catch (err) {
    console.error("[telegram] sendPhoto:", (err as Error).message);
  }
}

// ---------------------------------------------------------------------------
// Inbound command poller — long-polls getUpdates and dispatches /commands
// from the configured chat only.
// ---------------------------------------------------------------------------

let loopRunning = false;
let lastUpdateId = 0;

export function syncTelegramPoller(): void {
  if (loopRunning) return; // settings change is picked up inside the loop
  loopRunning = true;
  void pollLoop();
}

async function pollLoop(): Promise<void> {
  while (true) {
    const s = getSettings();
    const active =
      s.telegramEnabled &&
      s.telegramCommandsEnabled &&
      s.telegramBotToken &&
      s.telegramChatId;
    if (!active) {
      await sleep(3000);
      continue;
    }
    try {
      const updates = await tg<TgUpdate[]>(s.telegramBotToken, "getUpdates", {
        offset: lastUpdateId + 1,
        timeout: 25,
        allowed_updates: ["message"],
      });
      for (const u of updates) {
        if (u.update_id > lastUpdateId) lastUpdateId = u.update_id;
        await handleUpdate(u).catch((err) => console.error("[telegram] handler:", err));
      }
    } catch (err) {
      // Network or auth blip — back off briefly so we don't hammer.
      console.error("[telegram] poll:", (err as Error).message);
      await sleep(5000);
    }
  }
}

async function handleUpdate(u: TgUpdate): Promise<void> {
  const msg = u.message;
  if (!msg?.text) return;
  const s = getSettings();
  // Chat-scoped: only honor commands from the configured chat.
  if (String(msg.chat.id) !== String(s.telegramChatId)) {
    await tgSendText(s.telegramBotToken, msg.chat.id,
      `this chat (id ${msg.chat.id}) isn't the configured one. set telegramChatId to ${msg.chat.id} in settings if you want commands here.`);
    return;
  }
  const text = msg.text.trim();
  if (!text.startsWith("/")) return;

  // /cmd@botname args -> strip the @botname suffix Telegram appends in groups
  const firstSpace = text.indexOf(" ");
  const head = (firstSpace === -1 ? text : text.slice(0, firstSpace)).replace(/@\w+$/, "");
  const args = firstSpace === -1 ? "" : text.slice(firstSpace + 1).trim();
  const user = msg.from?.first_name || msg.from?.username || "tg-user";
  const reply = (text: string) => tgSendText(s.telegramBotToken, msg.chat.id, text);

  try {
    await dispatch(head.toLowerCase(), args, user, reply, s.telegramBotToken, msg.chat.id);
  } catch (err) {
    await reply(`error: ${(err as Error).message}`);
  }
}

type ReplyFn = (text: string) => Promise<void>;

async function dispatch(
  cmd: string,
  args: string,
  user: string,
  reply: ReplyFn,
  token: string,
  chatId: number | string,
): Promise<void> {
  switch (cmd) {
    case "/start":
    case "/help":
      return reply(HELP_TEXT);

    case "/now": {
      const state = scheduler.state();
      const post = state.current;
      if (!post) return reply("nothing is playing right now");
      await tg(token, "sendPhoto", {
        chat_id: chatId,
        photo: post.remoteUrl,
        caption: nowCaption(post, state.paused),
        parse_mode: "HTML",
      });
      return;
    }

    case "/likes": {
      const post = scheduler.state().current;
      if (!post) return reply("nothing playing");
      const row = db.prepare<[number], { n: number }>(
        `SELECT COUNT(*) AS n FROM post_votes WHERE post_id = ? AND kind = 'up'`,
      ).get(post.id);
      return reply(`♥ ${row?.n ?? 0} likes on <a href="https://e621.net/posts/${post.id}">#${post.id}</a>`);
    }

    case "/skip":
      void scheduler.skipAhead();
      return reply("⏭ skipped");

    case "/pause":
      scheduler.pause();
      return reply("⏸ paused");

    case "/resume":
    case "/play":
      // bare /play is "resume"; /play <id> is play-a-group (handled below)
      if (cmd === "/play" && args) break;
      scheduler.resume();
      return reply("▶ resumed");

    case "/pop":
      scheduler.triggerOverlay();
      return reply("📺 LAN info shown on display");

    case "/groups": {
      const rows = db.prepare<[], DbGroup>(`SELECT * FROM groups ORDER BY id ASC`).all();
      if (rows.length === 0) return reply("no groups yet. use <code>/add Name | tag1 tag2 …</code>");
      const lines = rows.map((g) => {
        const on = g.enabled ? "🟢" : "⚪️";
        return `${on} <b>#${g.id}</b> ${escapeHtml(g.name)} — <code>${escapeHtml(g.tags)}</code>`;
      });
      return reply(lines.join("\n"));
    }

    case "/tags": {
      const id = Number(args.trim());
      if (!Number.isFinite(id)) return reply("usage: <code>/tags &lt;groupId&gt;</code>");
      const g = db.prepare<[number], DbGroup>(`SELECT * FROM groups WHERE id = ?`).get(id);
      if (!g) return reply(`no group #${id}`);
      return reply(`<b>${escapeHtml(g.name)}</b>\n<code>${escapeHtml(g.tags)}</code>\nlimit ${g.image_limit}`);
    }

    case "/enable":
    case "/disable": {
      const id = Number(args.trim());
      if (!Number.isFinite(id)) return reply(`usage: <code>${cmd} &lt;groupId&gt;</code>`);
      const enabled = cmd === "/enable" ? 1 : 0;
      const r = db.prepare(`UPDATE groups SET enabled = ? WHERE id = ?`).run(enabled, id);
      if (r.changes === 0) return reply(`no group #${id}`);
      scheduler.notifyGroupsChanged();
      return reply(`${cmd === "/enable" ? "🟢 enabled" : "⚪️ disabled"} #${id}`);
    }

    case "/remove": {
      const id = Number(args.trim());
      if (!Number.isFinite(id)) return reply("usage: <code>/remove &lt;groupId&gt;</code>");
      const r = db.prepare(`DELETE FROM groups WHERE id = ?`).run(id);
      if (r.changes === 0) return reply(`no group #${id}`);
      scheduler.notifyGroupsChanged();
      return reply(`🗑 removed #${id}`);
    }

    case "/play": {
      // /play <id> [now|next]
      const parts = args.split(/\s+/);
      const id = Number(parts[0]);
      if (!Number.isFinite(id)) return reply("usage: <code>/play &lt;groupId&gt; [now|next]</code>");
      const mode = parts[1] === "now" ? "now" : "next";
      const g = db.prepare<[number], DbGroup>(`SELECT * FROM groups WHERE id = ?`).get(id);
      if (!g) return reply(`no group #${id}`);
      const { posts } = await searchPosts(g.tags, 8);
      const post = posts[Math.floor(Math.random() * posts.length)];
      if (!post) return reply(`no posts for #${id} — check tags?`);
      if (mode === "now") scheduler.forcePlayNow(post, id);
      else scheduler.enqueuePlayNext(post, id);
      return reply(`${mode === "now" ? "▶" : "⏭"} <b>${escapeHtml(g.name)}</b>`);
    }

    case "/add": {
      // /add Name | tag1 tag2 …
      const sep = args.indexOf("|");
      if (sep === -1) return reply("usage: <code>/add &lt;name&gt; | &lt;tag1 tag2 …&gt;</code>");
      const name = args.slice(0, sep).trim().slice(0, 48);
      const tags = args.slice(sep + 1).trim();
      if (!name || !tags) return reply("name and tags both required");
      const r = db.prepare(
        `INSERT INTO groups (name, tags, image_limit, enabled, priority, created_by, created_at)
         VALUES (?, ?, 50, 1, 0, NULL, ?)`,
      ).run(name, tags, Date.now());
      const id = Number(r.lastInsertRowid);
      db.prepare(
        `INSERT INTO group_contributions (group_id, user_id, action, detail, at) VALUES (?, NULL, 'create', ?, ?)`,
      ).run(id, `tg:${user} tags=${tags}`, Date.now());
      scheduler.notifyGroupsChanged();
      return reply(`✅ added <b>${escapeHtml(name)}</b> as #${id}`);
    }

    case "/vote": {
      const kind = args.trim().toLowerCase() === "down" ? "down" : "up";
      const post = scheduler.state().current;
      if (!post) return reply("nothing playing");
      db.prepare(
        `INSERT OR IGNORE INTO post_votes (post_id, user_id, kind, at) VALUES (?, NULL, ?, ?)`,
      ).run(post.id, kind, Date.now());
      const tally = db.prepare<[number, string], { n: number }>(
        `SELECT COUNT(*) AS n FROM post_votes WHERE post_id = ? AND kind = ?`,
      ).get(post.id, kind);
      if (kind === "up" && getSettings().reactionsEnabled) {
        broadcastReaction({
          kind: "up",
          emoji: "👍",
          postId: post.id,
          userName: `tg:${user}`,
          total: Number(tally?.n ?? 0),
          at: Date.now(),
        });
      }
      return reply(`${kind === "up" ? "👍" : "👎"} recorded (${tally?.n ?? 0})`);
    }

    case "/react": {
      const emoji = args.trim();
      if (!emoji) return reply("usage: <code>/react &lt;emoji&gt;</code>");
      const post = scheduler.state().current;
      if (!post) return reply("nothing playing");
      if (getSettings().reactionsEnabled) {
        broadcastReaction({
          kind: "emoji",
          emoji: emoji.slice(0, 8),
          postId: post.id,
          userName: `tg:${user}`,
          total: null,
          at: Date.now(),
        });
      }
      return reply(`sent ${emoji.slice(0, 8)} to the display`);
    }

    case "/comment": {
      const text = args.trim();
      if (!text) return reply("usage: <code>/comment &lt;text&gt;</code>");
      const post = scheduler.state().current;
      if (!post) return reply("nothing playing");
      const mode = getSettings().commentsMode;
      if (mode === "off") return reply("comments are disabled in settings");
      const { id, at } = insertComment(post.id, null, `tg:${user}`, text.slice(0, 200));
      if (mode === "immediate" || mode === "both") {
        broadcastComment({
          id, postId: post.id, userName: `tg:${user}`, text: text.slice(0, 200), at, origin: "live",
        });
      }
      return reply(`💬 posted`);
    }

    case "/music": {
      const sub = args.trim().toLowerCase();
      const cur = getSettings();
      if (!sub) {
        const station = cur.musicStation;
        return reply(`music is ${cur.musicEnabled ? "▶ on" : "⏸ off"} — station <code>${station}</code> @ ${Math.round(cur.musicVolume * 100)}%`);
      }
      if (sub === "on" || sub === "off") {
        db.prepare(`INSERT INTO settings (key, value) VALUES ('musicEnabled', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
          .run(sub === "on" ? "true" : "false");
        return reply(`music ${sub}`);
      }
      // Anything else: treat as a station key.
      db.prepare(`INSERT INTO settings (key, value) VALUES ('musicStation', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
        .run(JSON.stringify(sub));
      // settings broadcast is wired via routes only; tickle the display by emitting state.
      scheduler.notifySettingsChanged();
      return reply(`🎵 station set to <code>${sub}</code> (use the SettingsCard list for valid keys)`);
    }

    default:
      return reply(`unknown command. try /help`);
  }
}

const HELP_TEXT = [
  "<b>smutstream control commands</b>",
  "",
  "<b>playback</b>",
  "/now — send the current image",
  "/skip — next image",
  "/pause /resume — toggle slideshow",
  "/pop — flash the LAN info overlay",
  "/likes — like-count for current image",
  "",
  "<b>groups</b>",
  "/groups — list",
  "/tags &lt;id&gt; — show a group's tags",
  "/add &lt;name&gt; | &lt;tag1 tag2 …&gt; — new group",
  "/play &lt;id&gt; [now|next] — queue a group",
  "/enable &lt;id&gt; /disable &lt;id&gt; /remove &lt;id&gt;",
  "",
  "<b>engagement</b>",
  "/vote up|down — vote on current",
  "/react &lt;emoji&gt; — float an emoji on display",
  "/comment &lt;text&gt; — speech bubble on display",
  "",
  "<b>music</b>",
  "/music — show state",
  "/music on|off",
  "/music &lt;stationKey&gt; — switch station",
].join("\n");

function nowCaption(post: DisplayPost, paused: boolean): string {
  const parts = [
    paused ? "<b>⏸ paused</b>" : "<b>now playing</b>",
    post.groupName ? `· ${escapeHtml(post.groupName)}` : null,
    post.artists.length > 0 ? `by ${escapeHtml(post.artists.slice(0, 3).join(", "))}` : null,
    post.contributorName ? `added by ${escapeHtml(post.contributorName)}` : null,
    `<a href="https://e621.net/posts/${post.id}">e621.net/posts/${post.id}</a>`,
  ].filter(Boolean);
  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// Telegram HTTP helpers
// ---------------------------------------------------------------------------

type TgUpdate = {
  update_id: number;
  message?: {
    chat: { id: number; type: string };
    from?: { id: number; first_name?: string; username?: string };
    text?: string;
  };
};

async function tg<T>(token: string, method: string, body: Record<string, unknown>): Promise<T> {
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = (await r.json()) as { ok: boolean; result?: T; description?: string };
  if (!j.ok) throw new Error(`telegram ${method}: ${j.description ?? r.status}`);
  return j.result as T;
}

async function tgSendText(token: string, chatId: number | string, text: string): Promise<void> {
  try {
    await tg(token, "sendMessage", {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    });
  } catch (err) {
    console.error("[telegram] sendMessage:", (err as Error).message);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"));
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
