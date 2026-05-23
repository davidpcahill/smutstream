import { EventEmitter } from "node:events";
import { db, type DbGroup } from "./db.js";
import { searchPosts, type E621Post } from "./e621.js";
import { ensureCached, localRelUrl } from "./cache.js";
import {
  getSettings,
  pickLayout,
  pickTransition,
  postsNeededForLayout,
  type LayoutKind,
  type OverlayMode,
  type OverlayVerbosity,
  type TransitionKind,
} from "./settings.js";
import { broadcastComment } from "./sockets.js";
import { recentCommentsFor } from "./comments.js";
import { announceToTelegram } from "./telegram.js";

type GroupQueue = {
  group: DbGroup;
  remaining: E621Post[];      // not-yet-shown
  shownIds: Set<number>;      // already shown this rotation
  lastFetchedAt: number;
};

type MaterializeOverrides = { groupName?: string; contributorName?: string };
type QueuedPlay = { post: E621Post; groupId: number; overrides?: MaterializeOverrides };

export type DisplayPost = {
  id: number;
  url: string;                 // local /cache url
  remoteUrl: string;           // original e621 file url (for download)
  width: number;
  height: number;
  rating: string;
  artists: string[];
  score: number;
  groupId: number;
  groupName: string;
  contributorName: string | null;
};

export type DisplayState = {
  current: DisplayPost | null;
  extras: DisplayPost[];        // additional posts for multiplex layouts
  layout: LayoutKind;
  startedAt: number | null;     // ms epoch when current started
  durationMs: number;
  fadeMs: number;
  transition: TransitionKind;   // transition used to bring `current` on screen
  upcoming: DisplayPost[];
  history: DisplayPost[];       // most-recent first; primary posts only
  paused: boolean;
  overlay: {
    visible: boolean;
    until: number | null;
    mode: OverlayMode;
    verbosity: OverlayVerbosity;
  };
};

const HISTORY_LIMIT = 20;

const listGroupsStmt = db.prepare<[], DbGroup>(`SELECT * FROM groups WHERE enabled = 1 ORDER BY id ASC`);
const findCreatorName = db.prepare<[number], { name: string }>(
  `SELECT u.name FROM users u WHERE u.id = ?`,
);

export class Scheduler extends EventEmitter {
  private queues = new Map<number, GroupQueue>();
  private rotationOrder: number[] = [];
  private rotationIndex = 0;
  private current: DisplayPost | null = null;
  private extras: DisplayPost[] = [];
  private currentLayout: LayoutKind = "single";
  private startedAt: number | null = null;
  private currentTransition: TransitionKind = "fade";
  private upcoming: DisplayPost[] = [];
  private history: DisplayPost[] = [];
  private replayTimers: NodeJS.Timeout[] = [];
  private paused = false;
  private pausedAt: number | null = null;
  /** post_id → ms epoch last shown; used by image-cooldown skipping. */
  private lastShownAt = new Map<number, number>();
  private overlayVisible = false;
  private overlayUntil: number | null = null;
  private playNextQueue: QueuedPlay[] = [];
  // Serializes advance + refillUpcoming so concurrent triggers can't race the
  // materialize/cache awaits (which would shift the same group queue twice and
  // emit state out of order).
  private workChain: Promise<unknown> = Promise.resolve();
  private tickTimer: NodeJS.Timeout | null = null;
  private overlayTimer: NodeJS.Timeout | null = null;

  constructor() {
    super();
  }

  start(): void {
    void this.refreshAll();
    this.scheduleTick(0);
    this.scheduleOverlay();
  }

  state(): DisplayState {
    const s = getSettings();
    let visible = this.overlayVisible;
    let until: number | null = this.overlayUntil;
    if (s.overlayMode === "always") { visible = true; until = null; }
    else if (s.overlayMode === "off") { visible = false; until = null; }
    return {
      current: this.current,
      extras: this.extras,
      layout: this.currentLayout,
      startedAt: this.startedAt,
      durationMs: s.slideDurationMs,
      fadeMs: s.fadeMs,
      transition: this.currentTransition,
      upcoming: this.upcoming,
      history: this.history,
      paused: this.paused,
      overlay: {
        visible,
        until,
        mode: s.overlayMode,
        verbosity: s.overlayVerbosity,
      },
    };
  }

  notifyGroupsChanged(): void {
    void this.refreshAll();
    this.emit("state", this.state());
  }

  // ---- serial work chain ----

  private enqueueWork<T>(fn: () => Promise<T>): Promise<T | undefined> {
    const run = this.workChain.then(fn).catch((err) => {
      console.error("[scheduler] work failed:", err);
      return undefined;
    }) as Promise<T | undefined>;
    this.workChain = run;
    return run;
  }

  private refreshAll(): Promise<void> {
    return this.enqueueWork(() => this.refreshAllInner()) as Promise<void>;
  }

  private refillUpcoming(): Promise<void> {
    return this.enqueueWork(() => this.refillUpcomingInner()) as Promise<void>;
  }

  notifySettingsChanged(): void {
    const s = getSettings();
    if (this.startedAt) {
      const remaining = Math.max(0, this.startedAt + s.slideDurationMs - Date.now());
      this.scheduleTick(remaining);
    }
    this.scheduleOverlay(); // pick up new interval / mode
    this.emit("state", this.state());
  }

  enqueuePlayNext(post: E621Post, groupId: number, overrides?: MaterializeOverrides): void {
    this.playNextQueue.unshift({ post, groupId, overrides });
    void this.refillUpcoming();
    this.emit("state", this.state());
  }

  forcePlayNow(post: E621Post, groupId: number, overrides?: MaterializeOverrides): void {
    this.playNextQueue.unshift({ post, groupId, overrides });
    void this.advance();
  }

  /** Immediately advance to the next frame (skips remaining slide time).
   *  Used for "see another / cycle layouts" buttons. */
  skipAhead(): Promise<void> {
    // Skip always advances even if paused, then leaves us paused on the new
    // frame. Toggle paused off briefly so advance() schedules the next tick
    // correctly, then re-pause if we were paused.
    const wasPaused = this.paused;
    this.paused = false;
    return this.advance().then(() => {
      if (wasPaused) this.pause();
    });
  }

  pause(): void {
    if (this.paused) return;
    this.paused = true;
    this.pausedAt = Date.now();
    if (this.tickTimer) { clearTimeout(this.tickTimer); this.tickTimer = null; }
    this.emit("state", this.state());
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.pausedAt = null;
    // Show the current slide for at least 3s after resume so it doesn't
    // snap-advance if we were paused near the end of the previous slide.
    this.scheduleTick(3000);
    this.emit("state", this.state());
  }

  togglePause(): void {
    if (this.paused) this.resume();
    else this.pause();
  }

  playAdhoc(post: E621Post, contributorName: string, mode: "now" | "next"): void {
    const overrides: MaterializeOverrides = {
      groupName: `hand-picked by ${contributorName}`,
      contributorName,
    };
    if (mode === "now") this.forcePlayNow(post, -1, overrides);
    else this.enqueuePlayNext(post, -1, overrides);
  }

  triggerOverlay(durationMs?: number): void {
    const ms = durationMs ?? getSettings().overlayDurationMs;
    this.overlayVisible = true;
    this.overlayUntil = Date.now() + ms;
    this.emit("state", this.state());
    setTimeout(() => {
      this.overlayVisible = false;
      this.overlayUntil = null;
      this.emit("state", this.state());
    }, ms).unref();
  }

  // -------- internals --------

  private scheduleTick(delayMs: number): void {
    if (this.tickTimer) clearTimeout(this.tickTimer);
    if (this.paused) return; // no ticking while paused
    this.tickTimer = setTimeout(() => {
      void this.advance();
    }, delayMs);
    this.tickTimer.unref();
  }

  private scheduleOverlay(): void {
    if (this.overlayTimer) clearInterval(this.overlayTimer);
    const s = getSettings();
    if (s.overlayMode !== "occasional") return; // off / always need no timer
    this.overlayTimer = setInterval(() => this.triggerOverlay(), s.overlayIntervalMs);
    this.overlayTimer.unref();
  }

  private async refreshAllInner(): Promise<void> {
    const groups = listGroupsStmt.all();
    const seen = new Set<number>();
    for (const g of groups) {
      seen.add(g.id);
      if (!this.queues.has(g.id)) {
        this.queues.set(g.id, { group: g, remaining: [], shownIds: new Set(), lastFetchedAt: 0 });
      } else {
        const q = this.queues.get(g.id)!;
        q.group = g;
      }
      await this.refillGroup(g.id);
    }
    for (const id of [...this.queues.keys()]) {
      if (!seen.has(id)) this.queues.delete(id);
    }
    this.rotationOrder = [...this.queues.keys()];
    if (this.rotationOrder.length > 0) {
      this.rotationIndex = this.rotationIndex % this.rotationOrder.length;
    } else {
      this.rotationIndex = 0;
    }
    await this.refillUpcomingInner();
  }

  private async refillGroup(groupId: number): Promise<void> {
    const q = this.queues.get(groupId);
    if (!q) return;
    if (q.remaining.length >= 5) return;
    const tooSoon = Date.now() - q.lastFetchedAt < 30_000;
    if (tooSoon && q.remaining.length > 0) return;
    try {
      const { posts } = await searchPosts(q.group.tags, q.group.image_limit);
      q.lastFetchedAt = Date.now();
      const fresh = posts
        .filter((p) => !q.shownIds.has(p.id))
        .sort(() => Math.random() - 0.5)
        .slice(0, q.group.image_limit);
      q.remaining = fresh;
      if (fresh.length === 0 && q.shownIds.size > 0) {
        // exhausted -- reset rotation for this group
        q.shownIds.clear();
      }
    } catch (err) {
      console.error(`[scheduler] refill group ${groupId} failed:`, err);
    }
  }

  private advance(): Promise<void> {
    return this.enqueueWork(() => this.advanceInner()) as Promise<void>;
  }

  private async advanceInner(): Promise<void> {
    const layout = pickLayout();
    const need = postsNeededForLayout(layout);
    const primary = await this.pickNext();
    if (!primary) {
      this.current = null;
      this.extras = [];
      this.currentLayout = "single";
      this.startedAt = null;
      this.emit("state", this.state());
      this.scheduleTick(5000);
      return;
    }
    const extras: DisplayPost[] = [];
    for (let i = 1; i < need; i++) {
      const p = await this.pickNext();
      if (p) extras.push(p);
    }
    // Push the outgoing primary onto history (most-recent first), dedupe on id
    // so repeats from short rotations don't stack.
    if (this.current) {
      const prev = this.current;
      this.history = [prev, ...this.history.filter((p) => p.id !== prev.id)].slice(0, HISTORY_LIMIT);
    }
    this.current = primary;
    this.extras = extras;
    this.currentLayout = extras.length === need - 1 ? layout : "single";
    this.startedAt = Date.now();
    this.currentTransition = pickTransition();
    this.cancelReplayTimers();
    this.scheduleReplayComments(primary);
    announceToTelegram(primary);
    await this.refillUpcomingInner();
    this.emit("state", this.state());
    this.scheduleTick(getSettings().slideDurationMs);
  }

  private cancelReplayTimers(): void {
    for (const t of this.replayTimers) clearTimeout(t);
    this.replayTimers = [];
  }

  private scheduleReplayComments(post: DisplayPost): void {
    const s = getSettings();
    if (s.commentsMode !== "replay" && s.commentsMode !== "both") return;
    const comments = recentCommentsFor(post.id, 6);
    if (comments.length === 0) return;
    const slot = Math.max(2000, Math.floor(s.slideDurationMs / (comments.length + 1)));
    comments.forEach((c, idx) => {
      const t = setTimeout(() => {
        broadcastComment({
          id: c.id,
          postId: c.post_id,
          userName: c.user_name ?? "?",
          text: c.text,
          at: c.at,
          origin: "replay",
        });
      }, slot * (idx + 1));
      t.unref();
      this.replayTimers.push(t);
    });
  }

  private async pickNext(): Promise<DisplayPost | null> {
    // play-next queue takes priority
    const pn = this.playNextQueue.shift();
    if (pn) return this.materialize(pn.post, pn.groupId, pn.overrides);

    if (this.rotationOrder.length === 0) {
      await this.refreshAllInner();
      if (this.rotationOrder.length === 0) return null;
    }

    const cooldownMs = getSettings().imageCooldownMs;
    const now = Date.now();
    for (let i = 0; i < this.rotationOrder.length; i++) {
      const groupId = this.rotationOrder[(this.rotationIndex + i) % this.rotationOrder.length]!;
      const q = this.queues.get(groupId);
      if (!q) continue;
      if (q.remaining.length === 0) await this.refillGroup(groupId);
      // Skip posts whose lastShownAt is still within the cooldown. Bound the
      // search so we don't infinite-loop a small group whose every post is in
      // cooldown — fall back to whatever's at the head after N attempts.
      let post: E621Post | undefined;
      const skipLimit = Math.min(q.remaining.length, 50);
      for (let s = 0; s < skipLimit; s++) {
        const candidate = q.remaining.shift();
        if (!candidate) break;
        const last = this.lastShownAt.get(candidate.id) ?? 0;
        if (cooldownMs > 0 && now - last < cooldownMs) {
          // Put it back at the END so it gets a chance later this rotation.
          q.remaining.push(candidate);
          continue;
        }
        post = candidate;
        break;
      }
      if (post) {
        q.shownIds.add(post.id);
        this.lastShownAt.set(post.id, now);
        this.rotationIndex = (this.rotationIndex + i + 1) % this.rotationOrder.length;
        return this.materialize(post, groupId);
      }
    }
    return null;
  }

  private async refillUpcomingInner(): Promise<void> {
    const wanted = 3;
    const peek: DisplayPost[] = [];
    // Peek without mutating queues: take a snapshot
    const tempIdx = this.rotationIndex;
    const consumedPerGroup = new Map<number, number>();
    const pnCopy = [...this.playNextQueue];
    while (peek.length < wanted) {
      const pn = pnCopy.shift();
      if (pn) {
        peek.push(await this.materialize(pn.post, pn.groupId, pn.overrides));
        continue;
      }
      if (this.rotationOrder.length === 0) break;
      let found = false;
      for (let i = 0; i < this.rotationOrder.length; i++) {
        const groupId = this.rotationOrder[(tempIdx + i + peek.length) % this.rotationOrder.length]!;
        const q = this.queues.get(groupId);
        if (!q) continue;
        const offset = consumedPerGroup.get(groupId) ?? 0;
        const post = q.remaining[offset];
        if (post) {
          consumedPerGroup.set(groupId, offset + 1);
          peek.push(await this.materialize(post, groupId));
          found = true;
          break;
        }
      }
      if (!found) break;
    }
    this.upcoming = peek;
    // proactively cache upcoming
    for (const p of peek) {
      // file urls are remote; fire-and-forget local cache fill
      void this.warmCache(p);
    }
  }

  private async warmCache(p: DisplayPost): Promise<void> {
    // We need the original E621Post to call ensureCached. Reconstruct minimal.
    // (We store remoteUrl and ext is encoded in url path; for simplicity we re-derive.)
    const ext = p.url.split(".").pop() ?? "jpg";
    const fakePost = { id: p.id, file: { url: p.remoteUrl, ext } } as unknown as E621Post;
    try {
      await ensureCached(fakePost);
    } catch (err) {
      console.error(`[scheduler] cache warm ${p.id} failed:`, err);
    }
  }

  private async materialize(post: E621Post, groupId: number, overrides?: MaterializeOverrides): Promise<DisplayPost> {
    const group = this.queues.get(groupId)?.group;
    const baseContributor = group?.created_by ? findCreatorName.get(group.created_by)?.name ?? null : null;
    const groupName = overrides?.groupName ?? group?.name ?? "?";
    const contributor = overrides?.contributorName ?? baseContributor;
    // Ensure local cache exists before exposing; fall back to remote if download fails.
    let url = localRelUrl(post);
    try {
      await ensureCached(post);
    } catch (err) {
      console.error(`[scheduler] cache ${post.id} failed, falling back to remote:`, err);
      url = post.file.url ?? "";
    }
    return {
      id: post.id,
      url,
      remoteUrl: post.file.url ?? "",
      width: post.file.width,
      height: post.file.height,
      rating: post.rating,
      artists: post.tags.artist ?? [],
      score: post.score?.total ?? 0,
      groupId,
      groupName,
      contributorName: contributor,
    };
  }
}

export const scheduler = new Scheduler();
