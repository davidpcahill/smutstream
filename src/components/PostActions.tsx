import { useState } from "react";
import { api } from "../lib/api";
import { sourceUrl } from "../lib/posts";

type Props = {
  postId: number;
  /** When provided, used as the download URL; defaults to source page. */
  downloadUrl?: string | null;
  /** Artist tags for the post — used for the "hide artist" action. */
  artists?: string[];
  /** "row" = labelled buttons; "compact" = icon-only for tight strips. */
  variant?: "row" | "compact";
  /** Show a 💬 button that toggles an inline comment input. */
  withComment?: boolean;
};

export function PostActions({ postId, downloadUrl, artists = [], variant = "row", withComment = true }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [showComment, setShowComment] = useState(false);
  const [comment, setComment] = useState("");
  const [flash, setFlash] = useState<string | null>(null);

  async function vote(kind: "up" | "down" | "download") {
    setBusy(kind);
    try {
      if (kind === "download") {
        window.open(downloadUrl || sourceUrl(postId), "_blank", "noopener");
      }
      await api.vote(postId, kind);
      flashMsg(kind === "up" ? "💖" : kind === "down" ? "👎" : "⬇");
    } catch (err) {
      flashMsg((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function openSource() {
    window.open(sourceUrl(postId), "_blank", "noopener");
  }

  async function hide(scope: "post" | "artist") {
    if (scope === "post") {
      if (!confirm(`Block image #${postId}? It won't appear again.`)) return;
      setBusy("hide");
      try {
        await api.blockPost(postId);
        flashMsg("hidden");
      } catch (err) {
        flashMsg((err as Error).message);
      } finally {
        setBusy(null);
      }
    } else {
      const a = artists[0];
      if (!a) { flashMsg("no artist tag"); return; }
      if (!confirm(`Block all posts by "${a}"?`)) return;
      setBusy("hide");
      try {
        await api.blockArtist(a);
        flashMsg(`blocked ${a}`);
      } catch (err) {
        flashMsg((err as Error).message);
      } finally {
        setBusy(null);
      }
    }
  }

  async function sendComment() {
    if (!comment.trim()) return;
    setBusy("comment");
    try {
      await api.comment(postId, comment);
      setComment("");
      setShowComment(false);
      flashMsg("comment sent ✓");
    } catch (err) {
      flashMsg((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function flashMsg(msg: string) {
    setFlash(msg);
    window.setTimeout(() => setFlash((cur) => (cur === msg ? null : cur)), 1600);
  }

  const compact = variant === "compact";

  return (
    <div className={`postactions ${compact ? "postactions--compact" : ""}`}>
      <button onClick={() => vote("up")} disabled={!!busy} title="more like this">
        <span className="postactions__icon" aria-hidden>👍</span>
        {!compact && <span className="postactions__label">more</span>}
      </button>
      <button onClick={() => vote("down")} disabled={!!busy} title="less like this">
        <span className="postactions__icon" aria-hidden>👎</span>
        {!compact && <span className="postactions__label">less</span>}
      </button>
      <button onClick={() => vote("download")} disabled={!!busy} title="download">
        <span className="postactions__icon" aria-hidden>⬇</span>
        {!compact && <span className="postactions__label">download</span>}
      </button>
      <button onClick={openSource} title="open source on e621.net (favorite / comment there)">
        <span className="postactions__icon" aria-hidden>🔗</span>
        {!compact && <span className="postactions__label">source</span>}
      </button>
      <button
        onClick={() => hide("post")}
        disabled={!!busy}
        title="hide this image — won't appear again"
      >
        <span className="postactions__icon" aria-hidden>🚫</span>
        {!compact && <span className="postactions__label">hide</span>}
      </button>
      {artists[0] && !compact && (
        <button
          onClick={() => hide("artist")}
          disabled={!!busy}
          title={`block all posts by ${artists[0]}`}
        >
          <span className="postactions__icon" aria-hidden>🙈</span>
          <span className="postactions__label">hide artist</span>
        </button>
      )}
      {withComment && (
        <button
          onClick={() => setShowComment((s) => !s)}
          title="comment on this image"
          className={showComment ? "on" : ""}
        >
          <span className="postactions__icon" aria-hidden>{showComment ? "×" : "💬"}</span>
          {!compact && (
            <span className="postactions__label">{showComment ? "cancel" : "comment"}</span>
          )}
        </button>
      )}
      {flash && <span className="postactions__flash">{flash}</span>}
      {withComment && showComment && (
        <div className="postactions__commentrow">
          <input
            autoFocus
            value={comment}
            placeholder="say something on the display"
            maxLength={200}
            onChange={(e) => setComment(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") sendComment(); }}
            disabled={busy === "comment"}
          />
          <button onClick={sendComment} disabled={!!busy || !comment.trim()}>send</button>
        </div>
      )}
    </div>
  );
}
