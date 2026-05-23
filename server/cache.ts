import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { config } from "./config.js";
import type { E621Post } from "./e621.js";

fs.mkdirSync(config.cache.dir, { recursive: true });

const inflight = new Map<number, Promise<string>>();

function localPath(post: E621Post): string {
  return path.join(config.cache.dir, `${post.id}.${post.file.ext}`);
}

export function localRelUrl(post: E621Post): string {
  return `/cache/${post.id}.${post.file.ext}`;
}

export function isCached(post: E621Post): boolean {
  return fs.existsSync(localPath(post));
}

export async function ensureCached(post: E621Post): Promise<string> {
  const dest = localPath(post);
  if (fs.existsSync(dest)) return dest;
  const existing = inflight.get(post.id);
  if (existing) return existing;
  const url = post.file.url;
  if (!url) throw new Error(`post ${post.id} has no file url`);
  const job = (async () => {
    const res = await fetch(url, { headers: { "User-Agent": config.e621.userAgent } });
    if (!res.ok || !res.body) throw new Error(`download ${post.id} failed: ${res.status}`);
    const tmp = `${dest}.part`;
    await pipeline(Readable.fromWeb(res.body as never), fs.createWriteStream(tmp));
    fs.renameSync(tmp, dest);
    return dest;
  })().finally(() => inflight.delete(post.id));
  inflight.set(post.id, job);
  return job;
}

export function startCacheSweeper(): void {
  const sweep = () => {
    const cutoff = Date.now() - config.cache.ttlHours * 60 * 60 * 1000;
    try {
      for (const f of fs.readdirSync(config.cache.dir)) {
        const full = path.join(config.cache.dir, f);
        try {
          const stat = fs.statSync(full);
          if (stat.mtimeMs < cutoff) fs.unlinkSync(full);
        } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
  };
  setInterval(sweep, 30 * 60 * 1000).unref();
}
