import { useEffect, useRef, useState } from "react";
import type { DisplayPost, LayoutKind, TransitionKind } from "../lib/types";

type Props = {
  current: DisplayPost | null;
  extras: DisplayPost[];
  layout: LayoutKind;
  upcoming: DisplayPost[];
  fadeMs: number;
  transition: TransitionKind;
};

type Frame = {
  key: string;
  posts: DisplayPost[];     // 1 for single, 2 for split-*
  layout: LayoutKind;
  transition: TransitionKind;
  state: "incoming" | "outgoing";
};

function frameKeyFor(current: DisplayPost, extras: DisplayPost[]): string {
  return [current.id, ...extras.map((e) => e.id)].join("-");
}

export function Slideshow({ current, extras, layout, upcoming, fadeMs, transition }: Props) {
  const [frames, setFrames] = useState<Frame[]>([]);
  const lastKeyRef = useRef<string | null>(null);

  // Preload upcoming images so transitions are instant.
  useEffect(() => {
    for (const p of upcoming) {
      const img = new Image();
      img.src = p.url;
    }
  }, [upcoming]);

  useEffect(() => {
    if (!current) return;
    const sigPosts = [current, ...extras];
    const sig = frameKeyFor(current, extras);
    if (lastKeyRef.current === sig) return;
    lastKeyRef.current = sig;

    const id = `${sig}-${Date.now()}`;
    const next: Frame = { key: id, posts: sigPosts, layout, transition, state: "incoming" };
    setFrames((prev) => [
      ...prev.map((f) => ({ ...f, state: "outgoing" as const, transition })),
      next,
    ]);

    const cleanup = setTimeout(() => {
      setFrames((prev) => prev.filter((f) => f.key === id));
    }, fadeMs + 200);
    return () => clearTimeout(cleanup);
  }, [current, extras, layout, fadeMs, transition]);

  return (
    <div className="stage">
      {frames.map((f) => (
        <div
          key={f.key}
          className={`stage__frame stage__frame--${f.transition} stage__frame--${f.state}`}
          style={{ ["--fade-ms" as string]: `${fadeMs}ms` }}
        >
          <div className={`cells cells--${f.layout}`}>
            {f.posts.map((p, idx) => (
              <div
                key={`${f.key}-${idx}`}
                className="cells__cell"
                style={{ backgroundImage: `url(${JSON.stringify(p.url)})` }}
              />
            ))}
          </div>
        </div>
      ))}
      {!current && (
        <div className="stage__empty">
          <p>no images yet — create a tag group from the control panel.</p>
        </div>
      )}
    </div>
  );
}
