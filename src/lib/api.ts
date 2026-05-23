import type { AppSettings, Group, SearchResult, ServerInfo, TransitionKind } from "./types";

async function jget<T>(url: string): Promise<T> {
  const r = await fetch(url, { credentials: "include" });
  if (!r.ok) throw new Error(`${url} -> ${r.status}`);
  return r.json();
}

async function jsend<T>(url: string, method: string, body?: unknown): Promise<T> {
  const r = await fetch(url, {
    method,
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(text || `${url} -> ${r.status}`);
  }
  return r.json();
}

export const api = {
  me: () => jget<{ id: number; name: string }>("/api/me"),
  setName: (name: string) => jsend<{ ok: true; name: string }>("/api/me", "POST", { name }),
  serverInfo: () => jget<ServerInfo>("/api/server-info"),
  groups: () => jget<{ groups: Group[] }>("/api/groups"),
  createGroup: (input: { name: string; tags: string; imageLimit: number }) =>
    jsend<{ id: number }>("/api/groups", "POST", input),
  updateGroup: (id: number, patch: Partial<{ name: string; tags: string; imageLimit: number; enabled: boolean; priority: number }>) =>
    jsend<{ ok: true }>(`/api/groups/${id}`, "PATCH", patch),
  deleteGroup: (id: number) => jsend<{ ok: true }>(`/api/groups/${id}`, "DELETE"),
  playGroup: (id: number, mode: "now" | "next") => jsend<{ ok: true }>(`/api/groups/${id}/play`, "POST", { mode }),
  playPost: (postId: number, mode: "now" | "next") =>
    jsend<{ ok: true }>(`/api/posts/${postId}/play`, "POST", { mode }),
  search: (tags: string, limit = 24) =>
    jget<SearchResult>(`/api/search?tags=${encodeURIComponent(tags)}&limit=${limit}`),
  vote: (postId: number, kind: "up" | "down" | "download") =>
    jsend<{ ok: true; tally: Record<string, number> }>("/api/votes", "POST", { postId, kind }),
  voteTally: (postId: number) => jget<{ tally: Record<string, number> }>(`/api/votes/${postId}`),
  triggerOverlay: () => jsend<{ ok: true }>("/api/overlay", "POST"),
  skip: () => jsend<{ ok: true }>("/api/skip", "POST"),
  playback: (action: "pause" | "resume" | "toggle") =>
    jsend<{ ok: true; paused: boolean }>("/api/playback", "POST", { action }),
  reaction: (postId: number, emoji: string) =>
    jsend<{ ok: true }>("/api/reactions", "POST", { postId, emoji }),
  // ---- blocklist ----
  listBlocks: () =>
    jget<{
      posts: { post_id: number; blocked_name: string | null; at: number }[];
      artists: { artist: string; blocked_name: string | null; at: number }[];
    }>("/api/blocks"),
  blockPost: (postId: number) => jsend<{ ok: true }>("/api/blocks/post", "POST", { postId }),
  unblockPost: (postId: number) =>
    jsend<{ ok: true }>(`/api/blocks/post/${postId}`, "DELETE"),
  blockArtist: (artist: string) =>
    jsend<{ ok: true }>("/api/blocks/artist", "POST", { artist }),
  unblockArtist: (artist: string) =>
    jsend<{ ok: true }>(`/api/blocks/artist/${encodeURIComponent(artist)}`, "DELETE"),
  getSettings: () =>
    jget<{ settings: AppSettings; available: { transitions: TransitionKind[] } }>("/api/settings"),
  updateSettings: (patch: Partial<AppSettings>) =>
    jsend<{ settings: AppSettings }>("/api/settings", "PATCH", patch),
  resetSettings: () => jsend<{ settings: AppSettings }>("/api/settings/reset", "POST"),
  comment: (postId: number, text: string) =>
    jsend<{ ok: true; id: number }>("/api/comments", "POST", { postId, text }),
};
