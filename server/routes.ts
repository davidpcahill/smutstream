import { Router } from "express";
import QRCode from "qrcode";
// @ts-expect-error -- @types/archiver doesn't yet describe v8's named class exports
import { ZipArchive } from "archiver";
import { ensureCached } from "./cache.js";
import { db, type DbGroup, type DbContribution } from "./db.js";
import { insertComment, recentCommentsFor } from "./comments.js";
import {
  blockPost,
  unblockPost,
  blockArtist,
  unblockArtist,
  listBlockedPosts,
  listBlockedArtists,
} from "./blocklist.js";
import { searchPosts, autocompleteTag, getPost, type E621Post } from "./e621.js";
import { setName } from "./identity.js";
import { getLanInfo, getSsid } from "./lan.js";
import { scheduler } from "./scheduler.js";
import { broadcastSettings, broadcastReaction, broadcastComment } from "./sockets.js";
import { config } from "./config.js";
import { getSettings, getSettingsForClient, updateSettings, resetSettings, ALL_TRANSITIONS } from "./settings.js";

export const router = Router();

const listGroupsStmt = db.prepare<[], DbGroup>(`SELECT * FROM groups ORDER BY id DESC`);
const findGroupStmt = db.prepare<[number], DbGroup>(`SELECT * FROM groups WHERE id = ?`);
const insertGroupStmt = db.prepare(
  `INSERT INTO groups (name, tags, image_limit, enabled, priority, created_by, created_at)
   VALUES (?, ?, ?, 1, 0, ?, ?)`,
);
const updateGroupStmt = db.prepare(
  `UPDATE groups SET name = ?, tags = ?, image_limit = ?, enabled = ?, priority = ? WHERE id = ?`,
);
const deleteGroupStmt = db.prepare(`DELETE FROM groups WHERE id = ?`);
const insertContribStmt = db.prepare(
  `INSERT INTO group_contributions (group_id, user_id, action, detail, at) VALUES (?, ?, ?, ?, ?)`,
);
const listContribStmt = db.prepare<[number], DbContribution & { user_name: string | null }>(`
  SELECT c.*, u.name AS user_name
  FROM group_contributions c
  LEFT JOIN users u ON u.id = c.user_id
  WHERE c.group_id = ?
  ORDER BY c.at ASC
`);
const insertVoteStmt = db.prepare(
  `INSERT OR IGNORE INTO post_votes (post_id, user_id, kind, at) VALUES (?, ?, ?, ?)`,
);
const tallyVotesStmt = db.prepare<[number], { kind: string; n: number }>(
  `SELECT kind, COUNT(*) AS n FROM post_votes WHERE post_id = ? GROUP BY kind`,
);

router.get("/api/me", (req, res) => {
  res.json({ id: req.user!.id, name: req.user!.name });
});

router.post("/api/me", (req, res) => {
  const { name } = req.body as { name?: string };
  if (typeof name !== "string" || !name.trim()) {
    res.status(400).json({ error: "name required" });
    return;
  }
  setName(req.user!.id, name);
  res.json({ ok: true, name: name.trim().slice(0, 32) });
});

router.get("/api/server-info", async (_req, res) => {
  const lan = getLanInfo();
  const url = lan.primaryIp ? `http://${lan.primaryIp}:${config.publicPort}` : null;
  const [qr, detectedSsid] = await Promise.all([
    url ? QRCode.toDataURL(url, { margin: 0, scale: 6 }) : Promise.resolve(null),
    getSsid(),
  ]);
  const ssid = getSettings().wifiSsid ?? detectedSsid;
  res.json({ ...lan, url, qr, ssid, port: config.publicPort });
});

router.get("/api/search", async (req, res) => {
  const tags = String(req.query.tags ?? "");
  const limit = Math.min(Math.max(Number(req.query.limit ?? 24), 1), 320);
  try {
    const result = await searchPosts(tags, limit);
    res.json({
      posts: result.posts.map(serializePostPreview),
      approxTotal: result.approxTotal,
      hasMore: result.approxTotal === null,
    });
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

router.get("/api/autocomplete", async (req, res) => {
  const q = String(req.query.q ?? "");
  try {
    res.json({ items: await autocompleteTag(q) });
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

router.get("/api/groups", (_req, res) => {
  const groups = listGroupsStmt.all();
  res.json({
    groups: groups.map((g) => ({
      ...g,
      enabled: !!g.enabled,
      contributions: listContribStmt.all(g.id),
    })),
  });
});

router.post("/api/groups", (req, res) => {
  const { name, tags, imageLimit } = req.body as { name?: string; tags?: string; imageLimit?: number };
  if (!name?.trim() || !tags?.trim()) {
    res.status(400).json({ error: "name and tags required" });
    return;
  }
  const limit = Math.max(1, Math.min(Number(imageLimit ?? 50), 2000));
  const result = insertGroupStmt.run(name.trim(), tags.trim(), limit, req.user!.id, Date.now());
  const id = Number(result.lastInsertRowid);
  insertContribStmt.run(id, req.user!.id, "create", `tags=${tags.trim()} limit=${limit}`, Date.now());
  scheduler.notifyGroupsChanged();
  res.json({ id });
});

router.patch("/api/groups/:id", (req, res) => {
  const id = Number(req.params.id);
  const group = findGroupStmt.get(id);
  if (!group) {
    res.status(404).json({ error: "not found" });
    return;
  }
  const { name, tags, imageLimit, enabled, priority } = req.body as {
    name?: string;
    tags?: string;
    imageLimit?: number;
    enabled?: boolean;
    priority?: number;
  };
  const newName = name?.trim() || group.name;
  const newTags = tags?.trim() || group.tags;
  const newLimit = imageLimit != null ? Math.max(1, Math.min(Number(imageLimit), 2000)) : group.image_limit;
  const newEnabled = enabled === undefined ? group.enabled : enabled ? 1 : 0;
  const newPriority = priority == null ? group.priority : Number(priority);

  updateGroupStmt.run(newName, newTags, newLimit, newEnabled, newPriority, id);

  if (newTags !== group.tags) {
    const before = new Set(group.tags.split(/\s+/));
    const after = new Set(newTags.split(/\s+/));
    for (const t of after) if (!before.has(t)) insertContribStmt.run(id, req.user!.id, "add_tag", t, Date.now());
    for (const t of before) if (!after.has(t)) insertContribStmt.run(id, req.user!.id, "remove_tag", t, Date.now());
  }
  if (newEnabled !== group.enabled) {
    insertContribStmt.run(id, req.user!.id, newEnabled ? "enable" : "disable", null, Date.now());
  }
  scheduler.notifyGroupsChanged();
  res.json({ ok: true });
});

router.delete("/api/groups/:id", (req, res) => {
  const id = Number(req.params.id);
  const group = findGroupStmt.get(id);
  if (!group) {
    res.status(404).json({ error: "not found" });
    return;
  }
  insertContribStmt.run(id, req.user!.id, "delete", null, Date.now());
  deleteGroupStmt.run(id);
  scheduler.notifyGroupsChanged();
  res.json({ ok: true });
});

router.get("/api/groups/:id/zip", async (req, res) => {
  const id = Number(req.params.id);
  const group = findGroupStmt.get(id);
  if (!group) {
    res.status(404).json({ error: "not found" });
    return;
  }
  // Cap to keep zip sizes sane even if image_limit is set very high.
  const max = Math.min(group.image_limit, 500);
  let posts;
  try {
    const r = await searchPosts(group.tags, max);
    posts = r.posts;
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
    return;
  }
  if (posts.length === 0) {
    res.status(404).json({ error: "no images in this group right now" });
    return;
  }

  const safeName = group.name.replace(/[^\w.-]+/g, "_").slice(0, 60) || `group-${id}`;
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${safeName}.zip"`);

  // No compression — image formats are already compressed; this saves CPU
  // and keeps the stream moving.
  const archive = new ZipArchive({ zlib: { level: 0 } });
  archive.on("warning", (err: Error) => console.warn("[zip]", err));
  archive.on("error", (err: Error) => {
    console.error("[zip] fatal", err);
    if (!res.headersSent) res.status(500).end();
  });
  archive.pipe(res);

  // Include a manifest with metadata + source links for offline reference.
  const manifest = posts.map((p) => ({
    id: p.id,
    file: `${p.id}.${p.file.ext}`,
    source: `https://e621.net/posts/${p.id}`,
    artists: p.tags.artist,
    rating: p.rating,
    score: p.score?.total ?? 0,
  }));
  archive.append(JSON.stringify({ group: group.name, tags: group.tags, posts: manifest }, null, 2), {
    name: "manifest.json",
  });

  // Ensure each post is cached, then add the local file. Caching is rate-
  // limited inside ensureCached/e621.ts, so this is naturally paced.
  for (const p of posts) {
    if (!p.file?.url) continue;
    try {
      const localPath = await ensureCached(p);
      archive.file(localPath, { name: `${p.id}.${p.file.ext}` });
    } catch (err) {
      console.warn(`[zip] skipping ${p.id}: ${(err as Error).message}`);
    }
  }
  await archive.finalize();
});

router.post("/api/groups/:id/play", async (req, res) => {
  const id = Number(req.params.id);
  const group = findGroupStmt.get(id);
  if (!group) {
    res.status(404).json({ error: "not found" });
    return;
  }
  const mode = (req.body as { mode?: string })?.mode ?? "next";
  try {
    const { posts } = await searchPosts(group.tags, 8);
    const post = posts[Math.floor(Math.random() * posts.length)];
    if (!post) {
      res.status(404).json({ error: "no posts found for this group" });
      return;
    }
    if (mode === "now") scheduler.forcePlayNow(post, id);
    else scheduler.enqueuePlayNext(post, id);
    res.json({ ok: true, postId: post.id });
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

router.post("/api/posts/:id/play", async (req, res) => {
  const id = Number(req.params.id);
  const mode = ((req.body as { mode?: string })?.mode === "now" ? "now" : "next") as "now" | "next";
  try {
    const post = await getPost(id);
    if (!post) {
      res.status(404).json({ error: "post not found" });
      return;
    }
    scheduler.playAdhoc(post, req.user!.name, mode);
    res.json({ ok: true });
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

router.post("/api/votes", (req, res) => {
  const { postId, kind } = req.body as { postId?: number; kind?: string };
  if (!postId || !["up", "down", "download"].includes(String(kind))) {
    res.status(400).json({ error: "postId + kind(up|down|download) required" });
    return;
  }
  insertVoteStmt.run(postId, req.user!.id, kind, Date.now());
  const tally = Object.fromEntries(tallyVotesStmt.all(postId).map((r) => [r.kind, r.n]));
  if (kind === "up" && getSettings().reactionsEnabled) {
    broadcastReaction({
      kind: "up",
      emoji: "👍",
      postId,
      userName: req.user!.name,
      total: Number(tally.up ?? 0),
      at: Date.now(),
    });
  }
  res.json({ ok: true, tally });
});

router.post("/api/comments", (req, res) => {
  const { postId, text } = req.body as { postId?: number; text?: string };
  if (!postId || typeof text !== "string" || !text.trim()) {
    res.status(400).json({ error: "postId + text required" });
    return;
  }
  const mode = getSettings().commentsMode;
  if (mode === "off") {
    res.status(403).json({ error: "comments are disabled" });
    return;
  }
  const clean = text.trim().slice(0, 200);
  const { id, at } = insertComment(postId, req.user!.id, req.user!.name, clean);
  if (mode === "immediate" || mode === "both") {
    broadcastComment({
      id,
      postId,
      userName: req.user!.name,
      text: clean,
      at,
      origin: "live",
    });
  }
  res.json({ ok: true, id });
});

router.get("/api/comments/:postId", (req, res) => {
  res.json({ items: recentCommentsFor(Number(req.params.postId), 20) });
});

router.get("/api/votes/:postId", (req, res) => {
  const tally = Object.fromEntries(tallyVotesStmt.all(Number(req.params.postId)).map((r) => [r.kind, r.n]));
  res.json({ tally });
});

router.post("/api/overlay", (_req, res) => {
  scheduler.triggerOverlay();
  res.json({ ok: true });
});

router.post("/api/skip", (_req, res) => {
  // Fire-and-forget: advance() may take seconds if the group queue needs a
  // refill (e621 rate-limit serializes searches). The caller doesn't need to
  // block on it — the new frame will be broadcast over WS when it lands.
  void scheduler.skipAhead();
  res.json({ ok: true });
});

router.post("/api/playback", (req, res) => {
  const { action } = req.body as { action?: "pause" | "resume" | "toggle" };
  if (action === "pause") scheduler.pause();
  else if (action === "resume") scheduler.resume();
  else scheduler.togglePause();
  res.json({ ok: true, paused: scheduler.state().paused });
});

// Ephemeral emoji reactions — broadcast only, not persisted. The persistent
// up/down/download vote counters live on /api/votes.
router.post("/api/reactions", (req, res) => {
  const { postId, emoji } = req.body as { postId?: number; emoji?: string };
  if (!postId || typeof emoji !== "string" || !emoji.trim()) {
    res.status(400).json({ error: "postId + emoji required" });
    return;
  }
  if (getSettings().reactionsEnabled) {
    broadcastReaction({
      kind: "emoji",
      emoji: emoji.slice(0, 8),
      postId,
      userName: req.user!.name,
      total: null,
      at: Date.now(),
    });
  }
  res.json({ ok: true });
});

router.get("/api/state", (_req, res) => {
  res.json(scheduler.state());
});

// ---- blocklist ----
router.get("/api/blocks", (_req, res) => {
  res.json({ posts: listBlockedPosts(), artists: listBlockedArtists() });
});

router.post("/api/blocks/post", (req, res) => {
  const { postId } = req.body as { postId?: number };
  if (!postId || !Number.isFinite(postId)) {
    res.status(400).json({ error: "postId required" });
    return;
  }
  blockPost(Number(postId), req.user!.id, req.user!.name);
  scheduler.notifyGroupsChanged(); // refresh queues so blocked post drops out
  res.json({ ok: true });
});

router.delete("/api/blocks/post/:postId", (req, res) => {
  unblockPost(Number(req.params.postId));
  res.json({ ok: true });
});

router.post("/api/blocks/artist", (req, res) => {
  const { artist } = req.body as { artist?: string };
  if (typeof artist !== "string" || !artist.trim()) {
    res.status(400).json({ error: "artist required" });
    return;
  }
  blockArtist(artist, req.user!.id, req.user!.name);
  scheduler.notifyGroupsChanged();
  res.json({ ok: true });
});

router.delete("/api/blocks/artist/:artist", (req, res) => {
  unblockArtist(req.params.artist);
  res.json({ ok: true });
});

router.get("/api/settings", (_req, res) => {
  res.json({ settings: getSettingsForClient(), available: { transitions: ALL_TRANSITIONS } });
});

router.post("/api/settings/reset", (_req, res) => {
  resetSettings();
  scheduler.notifySettingsChanged();
  broadcastSettings();
  res.json({ settings: getSettingsForClient() });
});

router.patch("/api/settings", (req, res) => {
  // Forward the whole body — updateSettings validates / sanitizes per field
  // and ignores anything it doesn't know about.
  updateSettings((req.body ?? {}) as Parameters<typeof updateSettings>[0]);
  scheduler.notifySettingsChanged();
  broadcastSettings();
  res.json({ settings: getSettingsForClient() });
});

function serializePostPreview(p: E621Post) {
  return {
    id: p.id,
    preview: p.preview?.url,
    sample: p.sample?.url,
    file: p.file?.url,
    width: p.file?.width,
    height: p.file?.height,
    rating: p.rating,
    score: p.score?.total ?? 0,
    artists: p.tags?.artist ?? [],
  };
}
