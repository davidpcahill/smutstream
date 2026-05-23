import { config } from "./config.js";
import { postPassesBlocklist } from "./blocklist.js";

export type E621File = { url: string | null; ext: string; width: number; height: number; size: number; md5: string };
export type E621Post = {
  id: number;
  rating: "s" | "q" | "e";
  file: E621File;
  preview: { url: string | null; width: number; height: number };
  sample: { has: boolean; url: string | null; width: number; height: number };
  tags: { general: string[]; species: string[]; character: string[]; artist: string[]; meta: string[] };
  score: { up: number; down: number; total: number };
  fav_count: number;
  duration: number | null;
  created_at: string;
  sources: string[];
};

export type E621SearchResult = {
  posts: E621Post[];
  approxTotal: number | null; // null = unknown / "more than limit"
};

const BASE = "https://e621.net";
const PER_REQUEST_LIMIT = 320; // e621 hard cap per request
const TOTAL_LIMIT = 2000;       // self-imposed safety on multi-page fetches
// e621 hard cap is 2 req/s; docs target is <= 1 req/s sustained. Spacing leaves headroom.
const MIN_REQUEST_SPACING_MS = 1100;

function authHeader(): string | undefined {
  const { username, apiKey } = config.e621;
  if (!username || !apiKey) return undefined;
  const token = Buffer.from(`${username}:${apiKey}`).toString("base64");
  return `Basic ${token}`;
}

let requestChain: Promise<unknown> = Promise.resolve();
let lastRequestAt = 0;

function schedule<T>(fn: () => Promise<T>): Promise<T> {
  const next = requestChain.then(async () => {
    const wait = lastRequestAt + MIN_REQUEST_SPACING_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastRequestAt = Date.now();
    return fn();
  });
  requestChain = next.catch(() => undefined);
  return next;
}

// e621 returns video posts (webm/mp4/swf) intermixed with images. The display
// can only render still images, so we always exclude video types server-side.
// Otherwise sorts like `order:score` return only videos and the user sees
// "0 matches" because everything got filtered.
const VIDEO_EXCLUSIONS = ["-type:webm", "-type:mp4", "-type:swf"];

function buildTagQuery(rawTags: string): string {
  const userTags = rawTags.split(/\s+/).map((t) => t.trim()).filter(Boolean);
  const userNegs = new Set(userTags.filter((t) => t.startsWith("-")).map((t) => t.slice(1).toLowerCase()));
  const blacklistNegs = config.safetyBlacklist
    .filter((t) => !userNegs.has(t.toLowerCase()))
    .map((t) => `-${t}`);
  // Don't duplicate user-supplied type exclusions; allow user to opt-in to
  // videos by adding `type:webm` etc. explicitly (in which case the negative
  // would conflict but e621 honors the positive, so a no-op).
  const haveVideoExclusion = new Set(userTags.map((t) => t.toLowerCase()));
  const videoNegs = VIDEO_EXCLUSIONS.filter((t) => !haveVideoExclusion.has(t.toLowerCase()));
  return [...userTags, ...blacklistNegs, ...videoNegs].join(" ");
}

function request(pathname: string, params: Record<string, string | number | undefined> = {}): Promise<unknown> {
  const url = new URL(pathname, BASE);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  }
  const headers: Record<string, string> = { "User-Agent": config.e621.userAgent };
  const auth = authHeader();
  if (auth) headers["Authorization"] = auth;

  return schedule(async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await fetch(url, { headers });
      if (res.ok) return res.json();
      if (res.status === 429 || res.status === 503) {
        // Backoff and retry; e621 returns these when we exceed the hard limit.
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        continue;
      }
      const body = await res.text().catch(() => "");
      throw new Error(`e621 ${pathname} ${res.status}: ${body.slice(0, 200)}`);
    }
    throw new Error(`e621 ${pathname}: rate-limited after retries`);
  });
}

export async function searchPosts(rawTags: string, limit = 75, page: number | string = 1): Promise<E621SearchResult> {
  const tags = buildTagQuery(rawTags);
  const goal = Math.min(Math.max(limit, 1), TOTAL_LIMIT);

  // Single-page fast path: no pagination needed.
  if (goal <= PER_REQUEST_LIMIT) {
    const data = (await request("/posts.json", { tags, limit: goal, page })) as { posts?: E621Post[] };
    const posts = filterUsablePosts(data.posts);
    const approxTotal = posts.length < goal ? posts.length : null;
    return { posts, approxTotal };
  }

  // Paginate via `page=b<lowest_id>` per e621 docs (cursor-based; safe past page 750).
  const collected: E621Post[] = [];
  let cursor: string | number = 1;
  while (collected.length < goal) {
    const remaining = goal - collected.length;
    const reqLimit = Math.min(remaining, PER_REQUEST_LIMIT);
    const data = (await request("/posts.json", { tags, limit: reqLimit, page: cursor })) as { posts?: E621Post[] };
    const batch = filterUsablePosts(data.posts);
    if (batch.length === 0) break;
    collected.push(...batch);
    const lowestId = Math.min(...batch.map((p) => p.id));
    cursor = `b${lowestId}`;
    if (batch.length < reqLimit) break; // exhausted
  }
  const approxTotal = collected.length < goal ? collected.length : null;
  return { posts: collected, approxTotal };
}

function filterUsablePosts(input: unknown): E621Post[] {
  const arr = Array.isArray(input) ? (input as E621Post[]) : [];
  return arr.filter(
    (p) =>
      p.file?.url &&
      /^(jpg|jpeg|png|gif|webp)$/i.test(p.file.ext) &&
      postPassesBlocklist(p),
  );
}

export async function getPost(id: number): Promise<E621Post | null> {
  const data = (await request(`/posts/${id}.json`)) as { post?: E621Post };
  const post = data.post;
  if (!post || !post.file?.url) return null;
  return post;
}

export async function autocompleteTag(prefix: string): Promise<Array<{ name: string; post_count: number; category: number }>> {
  if (!prefix || prefix.length < 2) return [];
  const data = (await request("/tags/autocomplete.json", { "search[name_matches]": prefix })) as Array<{
    name: string;
    post_count: number;
    category: number;
  }>;
  return Array.isArray(data) ? data : [];
}
