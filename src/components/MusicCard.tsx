import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { onSettings } from "../lib/socket";
import { nextStationKey, prevStationKey, stationByKey } from "../lib/stations";
import type { AppSettings } from "../lib/types";

/**
 * A compact quick-controls card for /control: play/pause, prev/next station,
 * now-playing readout, volume. Separate from the full SettingsCard so guests
 * can vibe-tweak without scrolling into deep settings.
 */
export function MusicCard() {
  const [settings, setSettings] = useState<AppSettings | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.getSettings().then(({ settings }) => !cancelled && setSettings(settings));
    return onSettings((s) => setSettings(s));
  }, []);

  if (!settings) return null;
  const station = stationByKey(settings.musicStation);

  function patch(p: Partial<AppSettings>): void {
    setSettings((cur) => (cur ? { ...cur, ...p } : cur));
    api.updateSettings(p).catch(() => {});
  }

  return (
    <section className="card musiccard">
      <div className="musiccard__row">
        <div className="musiccard__np">
          <div className="musiccard__label">music</div>
          <div className="musiccard__name">
            {settings.musicEnabled ? (station?.name ?? "—") : "off"}
          </div>
          {settings.musicEnabled && station && (
            <div className="musiccard__blurb">{station.blurb}</div>
          )}
        </div>
        <div className="musiccard__controls">
          <button
            type="button"
            title="previous station"
            onClick={() => patch({ musicStation: prevStationKey(settings.musicStation) })}
            disabled={!settings.musicEnabled}
          >
            ⏮
          </button>
          <button
            type="button"
            title={settings.musicEnabled ? "stop music" : "start music"}
            className={settings.musicEnabled ? "on" : ""}
            onClick={() => patch({ musicEnabled: !settings.musicEnabled })}
          >
            {settings.musicEnabled ? "⏸" : "▶"}
          </button>
          <button
            type="button"
            title="next station"
            onClick={() => patch({ musicStation: nextStationKey(settings.musicStation) })}
            disabled={!settings.musicEnabled}
          >
            ⏭
          </button>
        </div>
      </div>
      {settings.musicEnabled && (
        <label className="musiccard__volume">
          <span>🔊 {Math.round(settings.musicVolume * 100)}%</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.02}
            value={settings.musicVolume}
            onChange={(e) => patch({ musicVolume: Number(e.target.value) })}
          />
        </label>
      )}
    </section>
  );
}
