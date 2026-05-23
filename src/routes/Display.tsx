import { useEffect, useRef, useState } from "react";
import { Slideshow } from "../components/Slideshow";
import { Overlay } from "../components/Overlay";
import { ReactionsLayer } from "../components/ReactionsLayer";
import { CommentsLayer } from "../components/CommentsLayer";
import { MusicPlayer } from "../components/MusicPlayer";
import { useDisplayState, onSettings } from "../lib/socket";
import { api } from "../lib/api";
import type { AppSettings } from "../lib/types";

export function Display() {
  const state = useDisplayState();
  const rootRef = useRef<HTMLDivElement>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [initialTotal, setInitialTotal] = useState(0);

  useEffect(() => {
    api.getSettings().then(({ settings }) => setSettings(settings));
    return onSettings(setSettings);
  }, []);

  // Fetch the vote tally for the current image when it changes, so the
  // counter starts at the right number on page-load / image change.
  useEffect(() => {
    const id = state?.current?.id;
    if (!id) { setInitialTotal(0); return; }
    let cancelled = false;
    fetch(`/api/votes/${id}`, { credentials: "include" })
      .then((r) => r.json())
      .then((d: { tally?: Record<string, number> }) => {
        if (!cancelled) setInitialTotal(Number(d.tally?.up ?? 0));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [state?.current?.id]);

  function goFullscreen() {
    const el = document.documentElement;
    if (!document.fullscreenElement && el.requestFullscreen) {
      void el.requestFullscreen().catch(() => {});
    } else if (document.exitFullscreen) {
      void document.exitFullscreen().catch(() => {});
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "f" || e.key === "F") goFullscreen();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="display" ref={rootRef}>
      <Slideshow
        current={state?.current ?? null}
        extras={state?.extras ?? []}
        layout={state?.layout ?? "single"}
        upcoming={state?.upcoming ?? []}
        fadeMs={state?.fadeMs ?? 1500}
        transition={state?.transition ?? "fade"}
      />
      <CommentsLayer currentPostId={state?.current?.id ?? null} />
      <ReactionsLayer currentPostId={state?.current?.id ?? null} initialTotal={initialTotal} />
      <Overlay
        visible={!!state?.overlay.visible}
        verbosity={state?.overlay.verbosity ?? "minimal"}
        opacity={settings?.overlayOpacity ?? 0.85}
        scale={settings?.overlayScale ?? 1}
        corner={settings?.overlayCorner ?? "br"}
        current={state?.current ?? null}
      />
      <MusicPlayer
        enabled={settings?.musicEnabled ?? false}
        stationKey={settings?.musicStation ?? "groovesalad"}
        volume={settings?.musicVolume ?? 0.45}
      />
      {state?.paused && <div className="display__pausedbadge">⏸ paused</div>}
      <button className="display__fs" onClick={goFullscreen} aria-label="toggle fullscreen">⛶</button>
    </div>
  );
}
