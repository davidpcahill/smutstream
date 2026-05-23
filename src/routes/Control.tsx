import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { GroupCard } from "../components/GroupCard";
import { SettingsCard } from "../components/SettingsCard";
import { PostActions } from "../components/PostActions";
import { RecentStrip } from "../components/RecentStrip";
import { ReactionPicker } from "../components/ReactionPicker";
import { MusicCard } from "../components/MusicCard";
import { BlocklistCard } from "../components/BlocklistCard";
import { api } from "../lib/api";
import { useDisplayState } from "../lib/socket";
import type { Group } from "../lib/types";

export function Control() {
  const state = useDisplayState();
  const [groups, setGroups] = useState<Group[]>([]);
  const [me, setMe] = useState<{ id: number; name: string } | null>(null);
  const [nameDraft, setNameDraft] = useState("");

  const refresh = useCallback(async () => {
    const [g, m] = await Promise.all([api.groups(), api.me()]);
    setGroups(g.groups);
    setMe(m);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function saveName() {
    if (!nameDraft.trim()) return;
    await api.setName(nameDraft.trim());
    setNameDraft("");
    void refresh();
  }

  const needsName = me && (me.name === "Guest" || !me.name);

  return (
    <main className="control">
      {needsName && (
        <section className="card name-prompt">
          <h2>what's your name?</h2>
          <p>so your contributions and votes show up next to your name during the party.</p>
          <div className="row">
            <input
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              placeholder="your name"
              maxLength={32}
              onKeyDown={(e) => e.key === "Enter" && saveName()}
            />
            <button onClick={saveName}>save</button>
          </div>
        </section>
      )}

      {me && !needsName && (
        <div className="who">
          you are <strong>{me.name}</strong>{" "}
          <button
            className="link"
            onClick={() => {
              const next = prompt("change your name", me.name);
              if (next) api.setName(next).then(refresh);
            }}
          >
            change
          </button>
        </div>
      )}

      {state?.current && (
        <section className="card nowcard">
          <div className="nowcard__thumb">
            <img src={state.current.url} alt="" />
            {state.paused && <div className="nowcard__pausedbadge">⏸ paused</div>}
          </div>
          <div className="nowcard__body">
            <div className="nowcard__label">
              {state.paused ? "paused — " : "now playing — "}{state.current.groupName}
            </div>
            {state.current.artists.length > 0 && (
              <div className="nowcard__artists">by {state.current.artists.slice(0, 3).join(", ")}</div>
            )}
            <PostActions
              postId={state.current.id}
              downloadUrl={state.current.remoteUrl || state.current.url}
              artists={state.current.artists}
            />
            <ReactionPicker postId={state.current.id} />
          </div>
        </section>
      )}

      <section className="card">
        <div className="row">
          <button
            onClick={() => api.playback("toggle")}
            className={state?.paused ? "on" : ""}
          >
            {state?.paused ? "▶ resume slideshow" : "⏸ pause slideshow"}
          </button>
          <button className="ghost" onClick={() => api.skip()}>⏭ skip to next image / layout</button>
          <button className="ghost" onClick={() => api.triggerOverlay()}>show LAN info on display now</button>
        </div>
      </section>

      <MusicCard />

      {state?.history && state.history.length > 0 && (
        <section className="card">
          <h2>recently shown</h2>
          <RecentStrip history={state.history} />
        </section>
      )}

      <section className="card">
        <div className="card__head">
          <h2>tag group pool</h2>
          <Link className="button" to="/search">+ new group</Link>
        </div>
        {groups.length === 0 ? (
          <p className="muted">no groups yet. create one to get the slideshow going.</p>
        ) : (
          <div className="groups">
            {groups.map((g) => (
              <GroupCard key={g.id} group={g} onChanged={refresh} />
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <h2>up next</h2>
        {state?.upcoming && state.upcoming.length > 0 ? (
          <ul className="upnext">
            {state.upcoming.map((u, i) => (
              <li key={`${u.id}-${i}`}>
                <img src={u.url} alt="" />
                <div>
                  <div className="upnext__group">{u.groupName}</div>
                  {u.artists[0] && <div className="upnext__artist">{u.artists[0]}</div>}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">queue is empty.</p>
        )}
      </section>

      <BlocklistCard />

      <SettingsCard />
    </main>
  );
}
