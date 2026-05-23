import { useEffect, useRef, useState } from "react";
import { onReaction, onSettings } from "../lib/socket";
import { api } from "../lib/api";
import type { AppSettings, ReactionEvent } from "../lib/types";

type Floater = {
  key: string;
  emoji: string;
  left: number;       // 0-100 %
  startBottom: number; // 0-30 %
  drift: number;       // -40..40 px
  scale: number;       // 0.85..1.25
  name: string;
};

type Props = {
  currentPostId: number | null;
  initialTotal?: number;
};

type Burst = { key: string; emojis: string[] };

const BURST_COOLDOWN_MS = 60_000; // most one screen-wide burst per minute

export function ReactionsLayer({ currentPostId, initialTotal = 0 }: Props) {
  const [floaters, setFloaters] = useState<Floater[]>([]);
  const [total, setTotal] = useState(initialTotal);
  const [pulse, setPulse] = useState(0);
  const [burst, setBurst] = useState<Burst | null>(null);
  const lastPostIdRef = useRef<number | null>(currentPostId);
  const recentRef = useRef<{ at: number; emoji: string }[]>([]);
  const lastBurstRef = useRef<number>(0);
  const settingsRef = useRef<AppSettings | null>(null);

  // Track settings for confetti thresholds. Settings get broadcast over WS;
  // we also fetch once on mount in case we connect after the last broadcast.
  useEffect(() => {
    api.getSettings().then(({ settings }) => { settingsRef.current = settings; });
    return onSettings((s) => { settingsRef.current = s; });
  }, []);

  // Reset counter when the displayed image changes.
  useEffect(() => {
    if (currentPostId !== lastPostIdRef.current) {
      lastPostIdRef.current = currentPostId;
      setTotal(initialTotal);
    }
  }, [currentPostId, initialTotal]);

  useEffect(() => {
    return onReaction((evt: ReactionEvent) => {
      if (evt.postId !== currentPostId) return;
      // The 'up' kind also carries an aggregated total; update the counter.
      if (evt.kind === "up" && typeof evt.total === "number") {
        setTotal(evt.total);
        setPulse((p) => p + 1);
      }
      const f: Floater = {
        key: `${evt.at}-${Math.random().toString(36).slice(2, 6)}`,
        emoji: evt.emoji || "👍",
        left: 6 + Math.random() * 88,
        startBottom: 6 + Math.random() * 10,
        drift: -40 + Math.random() * 80,
        scale: 0.85 + Math.random() * 0.4,
        name: evt.userName,
      };
      setFloaters((cur) => [...cur, f]);
      window.setTimeout(() => {
        setFloaters((cur) => cur.filter((x) => x.key !== f.key));
      }, 3200);

      // ---- confetti burst detection ----
      const s = settingsRef.current;
      if (!s || !s.reactionConfettiEnabled) return;
      const now = Date.now();
      recentRef.current.push({ at: now, emoji: evt.emoji || "👍" });
      // trim outside-window entries
      recentRef.current = recentRef.current.filter((r) => now - r.at <= s.reactionConfettiWindowMs);
      if (
        recentRef.current.length >= s.reactionConfettiThreshold &&
        now - lastBurstRef.current >= BURST_COOLDOWN_MS
      ) {
        lastBurstRef.current = now;
        const emojis = recentRef.current.map((r) => r.emoji);
        const key = `burst-${now}`;
        setBurst({ key, emojis });
        // Burst animates for ~3.5s, then clear.
        window.setTimeout(() => {
          setBurst((cur) => (cur?.key === key ? null : cur));
        }, 3500);
      }
    });
  }, [currentPostId]);

  return (
    <>
      <div className="reactions">
        {floaters.map((f) => (
          <span
            key={f.key}
            className="reactions__float"
            style={{
              left: `${f.left}%`,
              bottom: `${f.startBottom}%`,
              ["--drift" as string]: `${f.drift}px`,
              ["--scale" as string]: `${f.scale}`,
            }}
          >
            <span className="reactions__emoji">{f.emoji}</span>
            <span className="reactions__name">{f.name}</span>
          </span>
        ))}
      </div>
      {total > 0 && (
        <div className={`likecount ${pulse ? "likecount--pulse" : ""}`} key={`c-${pulse}`}>
          <span>♥</span> {total}
        </div>
      )}
      {burst && (
        <div className="confetti" key={burst.key}>
          {Array.from({ length: 36 }).map((_, i) => {
            const e = burst.emojis[i % burst.emojis.length] ?? "🎉";
            const left = Math.random() * 100;
            const delay = Math.random() * 0.6;
            const dur = 2.4 + Math.random() * 1.2;
            const drift = -120 + Math.random() * 240;
            const size = 24 + Math.random() * 30;
            return (
              <span
                key={i}
                className="confetti__piece"
                style={{
                  left: `${left}%`,
                  fontSize: `${size}px`,
                  animationDelay: `${delay}s`,
                  animationDuration: `${dur}s`,
                  ["--drift" as string]: `${drift}px`,
                }}
              >
                {e}
              </span>
            );
          })}
        </div>
      )}
    </>
  );
}
