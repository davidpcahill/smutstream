import { useEffect, useState } from "react";
import { onComment } from "../lib/socket";
import type { CommentEvent } from "../lib/types";

type Bubble = {
  key: string;
  text: string;
  name: string;
  origin: "live" | "replay";
  bottomPct: number; // 5..32 → bottom band of the screen
  rightPx: number;   // 14..52 → small horizontal scatter near the right edge
  rotate: number;    // -2..2 deg, very subtle
};

type Props = { currentPostId: number | null };

const LINGER_MS = 7500;

export function CommentsLayer({ currentPostId }: Props) {
  const [bubbles, setBubbles] = useState<Bubble[]>([]);

  useEffect(() => {
    return onComment((c: CommentEvent) => {
      if (c.postId !== currentPostId) return;
      const b: Bubble = {
        key: `${c.id}-${c.at}-${Math.random().toString(36).slice(2, 6)}`,
        text: c.text,
        name: c.userName,
        origin: c.origin,
        // Bottom band, right-anchored — keeps comments out of the central
        // image action. Small randomness so multiple bubbles don't perfectly
        // overlap.
        bottomPct: 6 + Math.random() * 26,
        rightPx: 14 + Math.random() * 36,
        rotate: -2 + Math.random() * 4,
      };
      setBubbles((cur) => [...cur, b]);
      window.setTimeout(() => {
        setBubbles((cur) => cur.filter((x) => x.key !== b.key));
      }, LINGER_MS);
    });
  }, [currentPostId]);

  // Clear bubbles when the slide changes — don't keep old comments on a new image.
  useEffect(() => {
    setBubbles([]);
  }, [currentPostId]);

  return (
    <div className="comments">
      {bubbles.map((b) => (
        <div
          key={b.key}
          className={`bubble bubble--${b.origin}`}
          style={{
            bottom: `${b.bottomPct}%`,
            right: `${b.rightPx}px`,
            ["--rot" as string]: `${b.rotate}deg`,
          }}
        >
          <div className="bubble__text">{b.text}</div>
          <div className="bubble__name">— {b.name}</div>
        </div>
      ))}
    </div>
  );
}
