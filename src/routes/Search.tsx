import { useState } from "react";
import { TagInput } from "../components/TagInput";
import { api } from "../lib/api";
import { sourceUrl } from "../lib/posts";
import type { SearchPost, SearchResult } from "../lib/types";

// e621 sort metatags — validated against https://e621.net/help/cheatsheet.
// Clicking one of these injects the metatag into the tag list as a chip
// (replacing any existing `order:*`), so it behaves like any other tag —
// visible, removable, editable from TagInput.
const SORT_TAGS: { label: string; tag: string; hint: string }[] = [
  { label: "newest",    tag: "order:id_desc",  hint: "newest posts first (default)" },
  { label: "hottest",   tag: "order:hot",      hint: "the 'Hot' page sort (~last 2 days)" },
  { label: "top score", tag: "order:score",    hint: "highest upvotes all-time" },
  { label: "most faves",tag: "order:favcount", hint: "most favorites all-time" },
  { label: "random",    tag: "order:random",   hint: "random sample" },
];

export function Search() {
  const [tags, setTags] = useState("");
  const [name, setName] = useState("");
  const [imageLimit, setImageLimit] = useState(50);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<SearchResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [perPostBusy, setPerPostBusy] = useState<number | null>(null);

  function flash(msg: string) {
    setStatus(msg);
    window.setTimeout(() => setStatus((s) => (s === msg ? null : s)), 2500);
  }

  // Inject a metatag chip, replacing any existing tag with the same prefix
  // (so order:hot doesn't pile up with order:score, etc.).
  function applyMetatag(metatag: string) {
    const prefix = metatag.split(":")[0]!.toLowerCase() + ":";
    setTags((prev) => {
      const cleaned = prev
        .split(/\s+/)
        .filter(Boolean)
        .filter((t) => !t.toLowerCase().startsWith(prefix) && !t.toLowerCase().startsWith("-" + prefix));
      cleaned.push(metatag);
      return cleaned.join(" ");
    });
  }

  const activeOrderTag =
    tags.split(/\s+/).find((t) => t.toLowerCase().startsWith("order:")) ?? null;

  async function preview() {
    if (!tags.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      setResults(await api.search(tags, 60));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function create(mode: "pool" | "now" | "next") {
    if (!tags.trim() || !name.trim()) {
      flash("name and at least one tag required");
      return;
    }
    setBusy(true);
    try {
      const { id } = await api.createGroup({ name: name.trim(), tags: tags.trim(), imageLimit });
      if (mode === "now") await api.playGroup(id, "now");
      else if (mode === "next") await api.playGroup(id, "next");
      flash(
        mode === "pool"
          ? `"${name.trim()}" added to pool`
          : mode === "next"
            ? `"${name.trim()}" added and queued next`
            : `"${name.trim()}" added and playing now`,
      );
      setName("");
    } catch (e) {
      flash((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function playPost(p: SearchPost, mode: "now" | "next") {
    setPerPostBusy(p.id);
    try {
      await api.playPost(p.id, mode);
      flash(mode === "now" ? `playing #${p.id} now` : `queued #${p.id}`);
    } catch (e) {
      flash((e as Error).message);
    } finally {
      setPerPostBusy((cur) => (cur === p.id ? null : cur));
    }
  }

  function downloadPost(p: SearchPost) {
    if (!p.file) return;
    window.open(p.file, "_blank", "noopener");
    api.vote(p.id, "download").catch(() => {});
  }

  return (
    <main className="search">
      <section className="card">
        <h2>new tag group</h2>
        <label className="field">
          <span>group name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder='eg "thicc dragons" or "winter cozy"'
            maxLength={48}
          />
        </label>
        <label className="field">
          <span>tags (prefix with - to exclude)</span>
          <TagInput value={tags} onChange={setTags} />
        </label>
        <label className="field">
          <span>image cap for this group: <strong>{imageLimit}</strong></span>
          <input
            type="range"
            min={5}
            max={2000}
            step={5}
            value={imageLimit}
            onChange={(e) => setImageLimit(Number(e.target.value))}
          />
        </label>
        <div className="field">
          <span>quick add sort tag (appears as a chip above — remove like any tag)</span>
          <div className="quickadd">
            {SORT_TAGS.map((s) => (
              <button
                key={s.tag}
                type="button"
                className={`quickadd__btn ${activeOrderTag === s.tag ? "on" : ""}`}
                title={`adds ${s.tag} — ${s.hint}`}
                onClick={() => applyMetatag(s.tag)}
              >
                + {s.label}
              </button>
            ))}
          </div>
        </div>
        <div className="row">
          <button onClick={preview} disabled={busy || !tags.trim()}>preview</button>
          <button onClick={() => create("pool")} disabled={busy || !tags.trim() || !name.trim()}>
            add to pool
          </button>
          <button onClick={() => create("next")} disabled={busy || !tags.trim() || !name.trim()}>
            play next
          </button>
          <button onClick={() => create("now")} disabled={busy || !tags.trim() || !name.trim()}>
            play now
          </button>
        </div>
        {err && <p className="error">{err}</p>}
        {status && <p className="status">{status}</p>}
      </section>

      {results && (
        <section className="card">
          <h2>
            preview · {results.posts.length}
            {results.hasMore ? "+" : ""} match{results.posts.length === 1 ? "" : "es"}
          </h2>
          {results.posts.length === 0 ? (
            <p className="muted">no matches. try fewer or different tags.</p>
          ) : (
            <div className="grid">
              {results.posts.map((p) => (
                <div key={p.id} className="thumb">
                  <img src={p.sample ?? p.preview ?? p.file ?? ""} alt="" loading="lazy" />
                  <div className="thumb__actions">
                    <button
                      disabled={perPostBusy === p.id}
                      onClick={() => playPost(p, "next")}
                      title="play next"
                    >
                      ▶ next
                    </button>
                    <button
                      disabled={perPostBusy === p.id}
                      onClick={() => playPost(p, "now")}
                      title="play now"
                    >
                      ▶ now
                    </button>
                    <button
                      onClick={() => downloadPost(p)}
                      title="download"
                    >
                      ⬇
                    </button>
                    <a
                      href={sourceUrl(p.id)}
                      target="_blank"
                      rel="noreferrer"
                      title="open on e621.net (favorite, comment, etc.)"
                    >
                      🔗
                    </a>
                    <a
                      className="thumb__open"
                      href={p.file ?? "#"}
                      target="_blank"
                      rel="noreferrer"
                      title={`#${p.id} · ↑${p.score} · open original image`}
                    >
                      ↗
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </main>
  );
}
