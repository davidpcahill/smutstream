import { useState } from "react";
import type { DisplayPost } from "../lib/types";
import { PostActions } from "./PostActions";

type Props = { history: DisplayPost[] };

export function RecentStrip({ history }: Props) {
  const [openId, setOpenId] = useState<number | null>(null);

  if (history.length === 0) {
    return <p className="muted">nothing has played yet.</p>;
  }
  const open = openId !== null ? history.find((h) => h.id === openId) ?? null : null;
  return (
    <div className="recent">
      <ul className="recent__strip">
        {history.map((p) => (
          <li key={`${p.id}`} className={openId === p.id ? "on" : ""}>
            <button
              type="button"
              className="recent__thumb"
              onClick={() => setOpenId((cur) => (cur === p.id ? null : p.id))}
              title={`${p.groupName}${p.artists[0] ? " · " + p.artists[0] : ""}`}
            >
              <img src={p.url} alt="" loading="lazy" />
            </button>
            <div className="recent__caption">{p.groupName}</div>
          </li>
        ))}
      </ul>
      {open && (
        <div className="recent__panel">
          <div className="recent__panel-meta">
            <strong>{open.groupName}</strong>
            {open.artists.length > 0 && <span className="muted"> · {open.artists.slice(0, 2).join(", ")}</span>}
            <span className="muted"> · #{open.id}</span>
          </div>
          <PostActions postId={open.id} downloadUrl={open.remoteUrl || open.url} artists={open.artists} />
        </div>
      )}
    </div>
  );
}
