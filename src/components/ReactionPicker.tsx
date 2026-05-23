import { useState } from "react";
import { api } from "../lib/api";

// Curated party-flavored emoji set. Each tap fires an ephemeral reaction
// (floats up on the display). Independent of the upvote counter.
const EMOJIS = [
  "👍", "❤️", "🔥", "💦", "🥵", "😈",
  "😻", "🍑", "🍆", "🌶️", "💋", "🤤",
  "🥂", "🍾", "🍻", "🥃", "🤘", "🎉",
];

export function ReactionPicker({ postId }: { postId: number }) {
  const [recent, setRecent] = useState<string | null>(null);

  async function send(emoji: string) {
    setRecent(emoji);
    window.setTimeout(() => setRecent((cur) => (cur === emoji ? null : cur)), 600);
    try {
      await api.reaction(postId, emoji);
    } catch {
      // silent — these are best-effort
    }
  }

  return (
    <div className="reactionpicker" aria-label="send a reaction">
      {EMOJIS.map((e) => (
        <button
          key={e}
          type="button"
          className={`reactionpicker__btn ${recent === e ? "just-sent" : ""}`}
          onClick={() => send(e)}
          title={`send ${e}`}
        >
          {e}
        </button>
      ))}
    </div>
  );
}
