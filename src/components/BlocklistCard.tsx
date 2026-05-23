import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { sourceUrl } from "../lib/posts";

type BlockedPost = { post_id: number; blocked_name: string | null; at: number };
type BlockedArtist = { artist: string; blocked_name: string | null; at: number };

export function BlocklistCard() {
  const [posts, setPosts] = useState<BlockedPost[]>([]);
  const [artists, setArtists] = useState<BlockedArtist[]>([]);
  const [manualArtist, setManualArtist] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const r = await api.listBlocks();
    setPosts(r.posts);
    setArtists(r.artists);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function addArtist() {
    if (!manualArtist.trim()) return;
    setBusy(true);
    try {
      await api.blockArtist(manualArtist.trim());
      setManualArtist("");
      void refresh();
    } finally { setBusy(false); }
  }

  async function rmPost(id: number) {
    setBusy(true);
    try { await api.unblockPost(id); void refresh(); }
    finally { setBusy(false); }
  }

  async function rmArtist(a: string) {
    setBusy(true);
    try { await api.unblockArtist(a); void refresh(); }
    finally { setBusy(false); }
  }

  return (
    <section className="card">
      <h2>blocklist</h2>
      <div className="field">
        <span>block an artist by tag</span>
        <div className="row">
          <input
            value={manualArtist}
            onChange={(e) => setManualArtist(e.target.value)}
            placeholder="artist_tag"
            onKeyDown={(e) => e.key === "Enter" && addArtist()}
          />
          <button onClick={addArtist} disabled={busy || !manualArtist.trim()}>block</button>
        </div>
      </div>

      {artists.length > 0 && (
        <div className="field">
          <span>blocked artists ({artists.length})</span>
          <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
            {artists.map((a) => (
              <span key={a.artist} className="chip chip--neg">
                {a.artist}
                <button type="button" onClick={() => rmArtist(a.artist)} aria-label={`unblock ${a.artist}`}>×</button>
              </span>
            ))}
          </div>
        </div>
      )}

      {posts.length > 0 && (
        <div className="field">
          <span>blocked posts ({posts.length})</span>
          <ul className="blocklist__posts">
            {posts.map((p) => (
              <li key={p.post_id}>
                <a href={sourceUrl(p.post_id)} target="_blank" rel="noreferrer">#{p.post_id}</a>
                {p.blocked_name && <span className="muted"> (by {p.blocked_name})</span>}
                <button className="link" onClick={() => rmPost(p.post_id)}>unblock</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {posts.length === 0 && artists.length === 0 && (
        <p className="muted">nothing blocked yet. use the 🚫 button on any image to hide it forever.</p>
      )}
    </section>
  );
}
