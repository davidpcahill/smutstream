import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { onSettings } from "../lib/socket";
import { stationsByCategory } from "../lib/stations";
import type {
  AppSettings,
  CommentsMode,
  LayoutKind,
  OverlayCorner,
  OverlayMode,
  OverlayVerbosity,
  TransitionKind,
} from "../lib/types";

const TRANSITION_LABELS: Record<TransitionKind, string> = {
  fade: "smooth fade",
  "fade-black": "fade through black",
  slide: "slide across",
  zoom: "zoom",
};

const OVERLAY_MODES: { value: OverlayMode; label: string }[] = [
  { value: "off", label: "off" },
  { value: "occasional", label: "occasional" },
  { value: "always", label: "always" },
];

const OVERLAY_VERBOSITIES: { value: OverlayVerbosity; label: string; hint: string }[] = [
  { value: "qr-only", label: "qr only", hint: "just the QR code in a corner — no text" },
  { value: "minimal", label: "minimal", hint: "tiny corner chip — QR + URL" },
  { value: "normal", label: "normal", hint: "URL + QR + wifi name" },
  { value: "verbose", label: "verbose", hint: "+ hostname, alt IPs, now-showing" },
];

const CORNERS: { value: OverlayCorner; label: string }[] = [
  { value: "tl", label: "↖" },
  { value: "tr", label: "↗" },
  { value: "bl", label: "↙" },
  { value: "br", label: "↘" },
];

const LAYOUTS: { value: LayoutKind; label: string }[] = [
  { value: "single", label: "single" },
  { value: "split-v", label: "split ↔" },
  { value: "split-h", label: "split ↕" },
  { value: "diag",   label: "diagonal" },
];

// Tiny CSS-only preview tile that shows how each layout splits the frame.
function LayoutPreview({ kind }: { kind: LayoutKind }) {
  return (
    <span className={`layoutpreview layoutpreview--${kind}`}>
      <span /><span />
    </span>
  );
}

const COMMENTS_MODES: { value: CommentsMode; label: string; hint: string }[] = [
  { value: "off", label: "off", hint: "comments disabled" },
  { value: "immediate", label: "live", hint: "pops on display when sent" },
  { value: "replay", label: "replay", hint: "pops spaced over the slide on next showing" },
  { value: "both", label: "both", hint: "live + replay on next showings" },
];

export function SettingsCard() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [available, setAvailable] = useState<TransitionKind[]>([]);
  // Accumulate pending edits across the debounce window so changing slider B
  // doesn't cancel slider A's save (single timer covers both).
  const pendingRef = useRef<Partial<AppSettings>>({});
  // Keys we've already PATCHed but haven't gotten a response for yet. A WS
  // broadcast that arrives during this window (from a stale push or another
  // device's prior change) must NOT overwrite these keys, or our just-clicked
  // selection visibly snaps back.
  const inFlightRef = useRef<Partial<AppSettings>>({});
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.getSettings().then(({ settings, available }) => {
      if (cancelled) return;
      setSettings(settings);
      setAvailable(available.transitions);
    });
    // Live-sync settings broadcast by the server (other devices editing).
    // Only adopt fields that we don't have a local edit pending or in-flight.
    const unsub = onSettings((incoming) => {
      setSettings((cur) => {
        if (!cur) return incoming;
        const merged: AppSettings = { ...cur };
        for (const key of Object.keys(incoming) as (keyof AppSettings)[]) {
          if (key in pendingRef.current) continue;
          if (key in inFlightRef.current) continue;
          (merged as Record<string, unknown>)[key] = incoming[key];
        }
        return merged;
      });
    });
    return () => { cancelled = true; unsub(); };
  }, []);

  function patch(p: Partial<AppSettings>) {
    // optimistic UI
    setSettings((cur) => (cur ? { ...cur, ...p } : cur));
    // accumulate into pending payload
    pendingRef.current = { ...pendingRef.current, ...p };
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(flush, 300);
  }

  function flush() {
    const payload = pendingRef.current;
    if (Object.keys(payload).length === 0) return;
    pendingRef.current = {};
    timerRef.current = null;
    const sentKeys = Object.keys(payload) as (keyof AppSettings)[];
    // Move sent keys to inFlight so a stale WS broadcast during the request
    // window can't clobber them.
    inFlightRef.current = { ...inFlightRef.current, ...payload };
    api.updateSettings(payload).then(({ settings: confirmed }) => {
      // Release in-flight claim and adopt confirmed values, unless the user
      // has started another edit for the same key in the meantime.
      for (const k of sentKeys) delete (inFlightRef.current as Record<string, unknown>)[k];
      setSettings((cur) => {
        if (!cur) return confirmed;
        const merged: AppSettings = { ...cur };
        for (const k of sentKeys) {
          if (!(k in pendingRef.current)) {
            (merged as Record<string, unknown>)[k] = confirmed[k];
          }
        }
        return merged;
      });
    }).catch(() => {
      for (const k of sentKeys) delete (inFlightRef.current as Record<string, unknown>)[k];
    });
  }

  function toggleTransition(kind: TransitionKind) {
    if (!settings) return;
    const baseline =
      pendingRef.current.enabledTransitions ?? settings.enabledTransitions;
    const has = baseline.includes(kind);
    const next = has
      ? baseline.filter((t) => t !== kind)
      : [...baseline, kind];
    patch({ enabledTransitions: next.length > 0 ? next : ["fade"] });
  }

  function toggleLayout(kind: LayoutKind) {
    if (!settings) return;
    const baseline = pendingRef.current.enabledLayouts ?? settings.enabledLayouts;
    const has = baseline.includes(kind);
    const next = has
      ? baseline.filter((t) => t !== kind)
      : [...baseline, kind];
    patch({ enabledLayouts: next.length > 0 ? next : ["single"] });
  }

  async function resetToDefaults() {
    if (!confirm("Reset display settings to defaults?")) return;
    pendingRef.current = {};
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    const { settings: confirmed } = await api.resetSettings();
    setSettings(confirmed);
  }

  if (!settings) return null;

  return (
    <section className="card">
      <div className="card__head">
        <h2>display settings</h2>
        <button className="ghost small" onClick={resetToDefaults}>reset</button>
      </div>

      <label className="field">
        <span>
          time per image: <strong>{(settings.slideDurationMs / 1000).toFixed(1)}s</strong>
        </span>
        <input
          type="range"
          min={3000}
          max={120000}
          step={500}
          value={settings.slideDurationMs}
          onChange={(e) => patch({ slideDurationMs: Number(e.target.value) })}
        />
      </label>

      <label className="field">
        <span>
          transition length: <strong>{(settings.fadeMs / 1000).toFixed(1)}s</strong>
        </span>
        <input
          type="range"
          min={200}
          max={6000}
          step={100}
          value={settings.fadeMs}
          onChange={(e) => patch({ fadeMs: Number(e.target.value) })}
        />
      </label>

      <div className="field">
        <span>transitions (pick more than one to randomize)</span>
        <div className="checks">
          {available.map((t) => (
            <label key={t} className="check">
              <input
                type="checkbox"
                checked={settings.enabledTransitions.includes(t)}
                onChange={() => toggleTransition(t)}
              />
              <span>{TRANSITION_LABELS[t]}</span>
            </label>
          ))}
        </div>
      </div>

      <hr className="divider" />

      <div className="field">
        <span>LAN info overlay</span>
        <div className="segmented">
          {OVERLAY_MODES.map((m) => (
            <button
              key={m.value}
              className={settings.overlayMode === m.value ? "on" : ""}
              onClick={() => patch({ overlayMode: m.value })}
              type="button"
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <span>verbosity</span>
        <div className="segmented">
          {OVERLAY_VERBOSITIES.map((v) => (
            <button
              key={v.value}
              className={settings.overlayVerbosity === v.value ? "on" : ""}
              onClick={() => patch({ overlayVerbosity: v.value })}
              type="button"
              title={v.hint}
            >
              {v.label}
            </button>
          ))}
        </div>
        <small className="muted">
          {OVERLAY_VERBOSITIES.find((v) => v.value === settings.overlayVerbosity)?.hint}
        </small>
      </div>

      {settings.overlayMode === "occasional" && (
        <>
          <label className="field">
            <span>
              show every: <strong>{formatSeconds(settings.overlayIntervalMs)}</strong>
            </span>
            <input
              type="range"
              min={15000}
              max={600000}
              step={5000}
              value={settings.overlayIntervalMs}
              onChange={(e) => patch({ overlayIntervalMs: Number(e.target.value) })}
            />
          </label>
          <label className="field">
            <span>
              for: <strong>{Math.round(settings.overlayDurationMs / 1000)}s</strong>
            </span>
            <input
              type="range"
              min={3000}
              max={60000}
              step={1000}
              value={settings.overlayDurationMs}
              onChange={(e) => patch({ overlayDurationMs: Number(e.target.value) })}
            />
          </label>
        </>
      )}

      <label className="field">
        <span>wi-fi name (shown in overlay; macOS hides this from the server)</span>
        <input
          type="text"
          value={settings.wifiSsid ?? ""}
          placeholder="e.g. PartyNet 5G"
          maxLength={64}
          onChange={(e) => patch({ wifiSsid: e.target.value })}
        />
      </label>

      {(settings.overlayVerbosity === "qr-only" || settings.overlayVerbosity === "minimal") && (
        <div className="field">
          <span>corner</span>
          <div className="segmented">
            {CORNERS.map((c) => (
              <button
                key={c.value}
                className={settings.overlayCorner === c.value ? "on" : ""}
                onClick={() => patch({ overlayCorner: c.value })}
                type="button"
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <label className="field">
        <span>opacity: <strong>{Math.round(settings.overlayOpacity * 100)}%</strong></span>
        <input
          type="range"
          min={0.3}
          max={1}
          step={0.05}
          value={settings.overlayOpacity}
          onChange={(e) => patch({ overlayOpacity: Number(e.target.value) })}
        />
      </label>

      <label className="field">
        <span>size: <strong>{settings.overlayScale.toFixed(2)}×</strong></span>
        <input
          type="range"
          min={0.6}
          max={1.6}
          step={0.05}
          value={settings.overlayScale}
          onChange={(e) => patch({ overlayScale: Number(e.target.value) })}
        />
      </label>

      <hr className="divider" />

      <div className="field">
        <span>layouts (pick more to randomize)</span>
        <div className="checks">
          {LAYOUTS.map((l) => (
            <label key={l.value} className="check check--withpreview">
              <input
                type="checkbox"
                checked={settings.enabledLayouts.includes(l.value)}
                onChange={() => toggleLayout(l.value)}
              />
              <LayoutPreview kind={l.value} />
              <span>{l.label}</span>
            </label>
          ))}
        </div>
      </div>

      {settings.enabledLayouts.includes("single") &&
        settings.enabledLayouts.some((l) => l !== "single") && (
          <label className="field">
            <span>
              chance of multiplex: <strong>{Math.round(settings.multiplexProbability * 100)}%</strong>
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={settings.multiplexProbability}
              onChange={(e) => patch({ multiplexProbability: Number(e.target.value) })}
            />
          </label>
        )}

      <hr className="divider" />

      <label className="check check--standalone">
        <input
          type="checkbox"
          checked={settings.reactionsEnabled}
          onChange={(e) => patch({ reactionsEnabled: e.target.checked })}
        />
        <span>live reactions (floating 👍 + counter)</span>
      </label>

      <div className="field">
        <span>comments</span>
        <div className="segmented">
          {COMMENTS_MODES.map((m) => (
            <button
              key={m.value}
              className={settings.commentsMode === m.value ? "on" : ""}
              onClick={() => patch({ commentsMode: m.value })}
              type="button"
              title={m.hint}
            >
              {m.label}
            </button>
          ))}
        </div>
        <small className="muted">
          {COMMENTS_MODES.find((m) => m.value === settings.commentsMode)?.hint}
        </small>
      </div>

      <hr className="divider" />

      <label className="check check--standalone">
        <input
          type="checkbox"
          checked={settings.musicEnabled}
          onChange={(e) => patch({ musicEnabled: e.target.checked })}
        />
        <span>background music on display (SomaFM — ad-free 24/7 streams)</span>
      </label>

      {settings.musicEnabled && (
        <>
          <label className="field">
            <span>station</span>
            <select
              value={settings.musicStation}
              onChange={(e) => patch({ musicStation: e.target.value })}
              className="select"
            >
              {stationsByCategory().map((g) => (
                <optgroup key={g.category} label={g.label}>
                  {g.stations.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.name} — {s.blurb}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>

          <label className="field">
            <span>volume: <strong>{Math.round(settings.musicVolume * 100)}%</strong></span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.02}
              value={settings.musicVolume}
              onChange={(e) => patch({ musicVolume: Number(e.target.value) })}
            />
          </label>

          <small className="muted">
            chrome blocks audio until someone taps the display tab once — a "tap to start music" button will appear if needed.
          </small>
        </>
      )}

      <hr className="divider" />

      <label className="field">
        <span>
          image cooldown: <strong>
            {settings.imageCooldownMs === 0 ? "off" : formatSeconds(settings.imageCooldownMs)}
          </strong>{" "}
          <span className="muted">— don't repeat the same image within this window</span>
        </span>
        <input
          type="range"
          min={0}
          max={7_200_000}
          step={60_000}
          value={settings.imageCooldownMs}
          onChange={(e) => patch({ imageCooldownMs: Number(e.target.value) })}
        />
      </label>

      <hr className="divider" />

      <label className="check" style={{ marginBottom: 12 }}>
        <input
          type="checkbox"
          checked={settings.reactionConfettiEnabled}
          onChange={(e) => patch({ reactionConfettiEnabled: e.target.checked })}
        />
        <span>reaction confetti burst when reactions hit a threshold</span>
      </label>
      {settings.reactionConfettiEnabled && (
        <>
          <label className="field">
            <span>fire after <strong>{settings.reactionConfettiThreshold}</strong> reactions within {Math.round(settings.reactionConfettiWindowMs / 1000)}s</span>
            <input
              type="range"
              min={2}
              max={30}
              step={1}
              value={settings.reactionConfettiThreshold}
              onChange={(e) => patch({ reactionConfettiThreshold: Number(e.target.value) })}
            />
          </label>
          <label className="field">
            <span>window: <strong>{Math.round(settings.reactionConfettiWindowMs / 1000)}s</strong></span>
            <input
              type="range"
              min={3000}
              max={120000}
              step={1000}
              value={settings.reactionConfettiWindowMs}
              onChange={(e) => patch({ reactionConfettiWindowMs: Number(e.target.value) })}
            />
          </label>
        </>
      )}

      <hr className="divider" />

      <label className="check" style={{ marginBottom: 12 }}>
        <input
          type="checkbox"
          checked={settings.telegramEnabled}
          onChange={(e) => patch({ telegramEnabled: e.target.checked })}
        />
        <span>telegram now-playing — bot posts each image to a chat</span>
      </label>
      {settings.telegramEnabled && (
        <>
          <label className="field">
            <span>bot token (from @BotFather; current shown as •••••)</span>
            <input
              type="password"
              value={settings.telegramBotToken}
              placeholder="123456:ABC-DEF…"
              autoComplete="off"
              onChange={(e) => patch({ telegramBotToken: e.target.value })}
            />
          </label>
          <label className="field">
            <span>chat id (your DM with the bot, or a group's id)</span>
            <input
              type="text"
              value={settings.telegramChatId}
              placeholder="-100123456789 or @yourchannel"
              onChange={(e) => patch({ telegramChatId: e.target.value })}
            />
          </label>
          <small className="muted">
            send any message to your bot once first so it's allowed to message you. Throttled to one post per ~8s on the server.
          </small>
        </>
      )}
    </section>
  );
}

function formatSeconds(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem ? `${m}m ${rem}s` : `${m}m`;
}
