import { db } from "./db.js";

const insertPost = db.prepare(
  `INSERT OR IGNORE INTO blocked_posts (post_id, blocked_by, blocked_name, at) VALUES (?, ?, ?, ?)`,
);
const removePost = db.prepare(`DELETE FROM blocked_posts WHERE post_id = ?`);
const listPosts = db.prepare<[], { post_id: number; blocked_name: string | null; at: number }>(
  `SELECT post_id, blocked_name, at FROM blocked_posts ORDER BY at DESC`,
);
const isPostBlockedStmt = db.prepare<[number], { post_id: number }>(
  `SELECT post_id FROM blocked_posts WHERE post_id = ?`,
);

const insertArtist = db.prepare(
  `INSERT OR IGNORE INTO blocked_artists (artist, blocked_by, blocked_name, at) VALUES (?, ?, ?, ?)`,
);
const removeArtist = db.prepare(`DELETE FROM blocked_artists WHERE artist = ?`);
const listArtists = db.prepare<[], { artist: string; blocked_name: string | null; at: number }>(
  `SELECT artist, blocked_name, at FROM blocked_artists ORDER BY at DESC`,
);
const allBlockedArtists = db.prepare<[], { artist: string }>(`SELECT artist FROM blocked_artists`);

// Hot cache so the hot-path filter doesn't hit sqlite per-post.
let blockedPostIds: Set<number> | null = null;
let blockedArtistTags: Set<string> | null = null;

function bumpCacheStamp(): void {
  blockedPostIds = null;
  blockedArtistTags = null;
}

export function blockPost(postId: number, userId: number | null, userName: string): void {
  insertPost.run(postId, userId, userName, Date.now());
  bumpCacheStamp();
}

export function unblockPost(postId: number): void {
  removePost.run(postId);
  bumpCacheStamp();
}

export function blockArtist(artist: string, userId: number | null, userName: string): void {
  const clean = artist.trim().toLowerCase().slice(0, 64);
  if (!clean) return;
  insertArtist.run(clean, userId, userName, Date.now());
  bumpCacheStamp();
}

export function unblockArtist(artist: string): void {
  removeArtist.run(artist.trim().toLowerCase());
  bumpCacheStamp();
}

export function listBlockedPosts() {
  return listPosts.all();
}

export function listBlockedArtists() {
  return listArtists.all();
}

export function isPostBlocked(postId: number): boolean {
  if (!blockedPostIds) {
    blockedPostIds = new Set(listPosts.all().map((r) => r.post_id));
  }
  return blockedPostIds.has(postId);
}

export function getBlockedArtists(): Set<string> {
  if (!blockedArtistTags) {
    blockedArtistTags = new Set(allBlockedArtists.all().map((r) => r.artist));
  }
  return blockedArtistTags;
}

export function postPassesBlocklist(post: { id: number; tags: { artist: string[] } }): boolean {
  if (isPostBlocked(post.id)) return false;
  const blocked = getBlockedArtists();
  if (blocked.size === 0) return true;
  for (const a of post.tags.artist ?? []) {
    if (blocked.has(a.toLowerCase())) return false;
  }
  return true;
}
