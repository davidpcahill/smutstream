import { useState } from "react";
import type { Group } from "../lib/types";
import { api } from "../lib/api";
import { TagInput } from "./TagInput";

type Props = {
  group: Group;
  onChanged: () => void;
};

export function GroupCard({ group, onChanged }: Props) {
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftTags, setDraftTags] = useState(group.tags);
  const [draftLimit, setDraftLimit] = useState(group.image_limit);
  const [draftName, setDraftName] = useState(group.name);
  const contribs = group.contributions ?? [];
  const creator = contribs.find((c) => c.action === "create")?.user_name ?? "?";

  async function run<T>(p: Promise<T>) {
    setBusy(true);
    try {
      await p;
      onChanged();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function startEdit() {
    setDraftTags(group.tags);
    setDraftLimit(group.image_limit);
    setDraftName(group.name);
    setEditing(true);
  }

  async function saveEdit() {
    if (!draftTags.trim() || !draftName.trim()) {
      alert("name and at least one tag required");
      return;
    }
    await run(
      api.updateGroup(group.id, {
        name: draftName.trim(),
        tags: draftTags.trim(),
        imageLimit: draftLimit,
      }),
    );
    setEditing(false);
  }

  return (
    <div className={`group ${group.enabled ? "" : "group--off"}`}>
      <div className="group__head">
        <div>
          {editing ? (
            <input
              className="group__nameedit"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              maxLength={48}
            />
          ) : (
            <div className="group__name">{group.name}</div>
          )}
          <div className="group__meta">by {creator} · limit {group.image_limit}</div>
        </div>
        <label className="toggle">
          <input
            type="checkbox"
            checked={group.enabled}
            onChange={(e) => run(api.updateGroup(group.id, { enabled: e.target.checked }))}
            disabled={busy}
          />
          <span>{group.enabled ? "on" : "off"}</span>
        </label>
      </div>

      {editing ? (
        <div className="group__edit">
          <TagInput value={draftTags} onChange={setDraftTags} />
          <label className="field" style={{ margin: "10px 0 0" }}>
            <span>image cap: <strong>{draftLimit}</strong></span>
            <input
              type="range"
              min={5}
              max={2000}
              step={5}
              value={draftLimit}
              onChange={(e) => setDraftLimit(Number(e.target.value))}
            />
          </label>
          <div className="row" style={{ marginTop: 8 }}>
            <button disabled={busy} onClick={saveEdit}>save</button>
            <button disabled={busy} onClick={() => setEditing(false)}>cancel</button>
          </div>
        </div>
      ) : (
        <>
          <div className="group__tags">
            {group.tags.split(/\s+/).filter(Boolean).map((t) => (
              <span key={t} className={`chip chip--sm ${t.startsWith("-") ? "chip--neg" : ""}`}>{t}</span>
            ))}
          </div>
          <div className="group__actions">
            <button disabled={busy} onClick={() => run(api.playGroup(group.id, "now"))}>play now</button>
            <button disabled={busy} onClick={() => run(api.playGroup(group.id, "next"))}>play next</button>
            <button disabled={busy} onClick={startEdit}>edit tags</button>
            <a
              className="group__downloadall"
              href={`/api/groups/${group.id}/zip`}
              title="download all images in this group as a ZIP (up to 500)"
            >
              ⬇ all
            </a>
            <button
              disabled={busy}
              className="danger"
              onClick={() => {
                if (confirm(`Delete "${group.name}"?`)) run(api.deleteGroup(group.id));
              }}
            >
              remove
            </button>
          </div>
        </>
      )}

      {contribs.length > 1 && !editing && (
        <details className="group__contribs">
          <summary>{contribs.length} contributions</summary>
          <ul>
            {contribs.map((c) => (
              <li key={c.id}>
                <strong>{c.user_name ?? "?"}</strong> {c.action}{c.detail ? ` ${c.detail}` : ""}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
