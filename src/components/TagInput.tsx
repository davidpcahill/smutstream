import { useEffect, useRef, useState } from "react";

type Suggestion = { name: string; post_count: number };

type Updater = string | ((prev: string) => string);

type Props = {
  value: string;
  onChange: (next: Updater) => void;
  placeholder?: string;
};

export function TagInput({ value, onChange, placeholder }: Props) {
  const [draft, setDraft] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [highlight, setHighlight] = useState<number>(-1);
  const [focused, setFocused] = useState(false);
  const debounceRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const tags = value.split(/\s+/).filter(Boolean);

  function cancelInflight(): void {
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    abortRef.current?.abort();
    abortRef.current = null;
  }

  useEffect(() => {
    if (!draft || draft.length < 2 || (draft.startsWith("-") && draft.length < 3)) {
      cancelInflight();
      setSuggestions([]);
      setHighlight(-1);
      return;
    }
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const q = draft.startsWith("-") ? draft.slice(1) : draft;
    debounceRef.current = window.setTimeout(async () => {
      try {
        const r = await fetch(`/api/autocomplete?q=${encodeURIComponent(q)}`, {
          credentials: "include",
          signal: controller.signal,
        });
        const data = (await r.json()) as { items: Suggestion[] };
        if (controller.signal.aborted) return;
        setSuggestions((data.items ?? []).slice(0, 8));
        setHighlight(-1);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setSuggestions([]);
        setHighlight(-1);
      }
    }, 180);
    return () => controller.abort();
  }, [draft]);

  useEffect(() => () => cancelInflight(), []);

  /** Commit a single, named tag (from a suggestion click or arrow+Enter). */
  function commitOne(name: string): void {
    cancelInflight();
    const negate = draft.startsWith("-");
    const final = (negate && !name.startsWith("-") ? `-${name}` : name).trim();
    if (!final) return;
    onChange((prev) => {
      const existing = new Set(prev.split(/\s+/).filter(Boolean));
      existing.add(final);
      return [...existing].join(" ");
    });
    setDraft("");
    setSuggestions([]);
    setHighlight(-1);
  }

  /** Commit the typed draft, splitting on whitespace so pasted multi-tag
   *  strings become multiple chips. */
  function commitDraft(): void {
    const text = draft.trim();
    if (!text) return;
    cancelInflight();
    const parts = text.split(/\s+/).filter(Boolean);
    onChange((prev) => {
      const existing = new Set(prev.split(/\s+/).filter(Boolean));
      for (const t of parts) existing.add(t);
      return [...existing].join(" ");
    });
    setDraft("");
    setSuggestions([]);
    setHighlight(-1);
  }

  function removeTag(target: string): void {
    onChange((prev) =>
      prev.split(/\s+/).filter(Boolean).filter((t) => t !== target).join(" "),
    );
  }

  const suggestionsVisible = focused && suggestions.length > 0;

  return (
    <div className="taginput">
      <div className="taginput__chips" onClick={() => inputRef.current?.focus()}>
        {tags.map((t, i) => (
          <span key={`${t}-${i}`} className={`chip ${t.startsWith("-") ? "chip--neg" : ""}`}>
            {t}
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => { e.stopPropagation(); removeTag(t); }}
              aria-label={`remove ${t}`}
            >
              ×
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={draft}
          placeholder={placeholder ?? "type a tag, then enter or space"}
          onFocus={() => setFocused(true)}
          // With onMouseDown preventDefault on the suggestion buttons, blur
          // doesn't fire when clicking them. So a real blur means "user moved
          // focus elsewhere" — safe to hide suggestions immediately.
          onBlur={() => setFocused(false)}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" && suggestionsVisible) {
              e.preventDefault();
              setHighlight((h) => (h + 1) % suggestions.length);
            } else if (e.key === "ArrowUp" && suggestionsVisible) {
              e.preventDefault();
              setHighlight((h) => (h <= 0 ? suggestions.length - 1 : h - 1));
            } else if (e.key === "Escape") {
              setHighlight(-1);
              setSuggestions([]);
            } else if ((e.key === "Enter" || e.key === " ") && (draft.trim() || highlight >= 0)) {
              e.preventDefault();
              e.stopPropagation();
              if (highlight >= 0 && highlight < suggestions.length) {
                commitOne(suggestions[highlight]!.name);
              } else {
                commitDraft();
              }
            } else if (e.key === "Backspace" && !draft && tags.length > 0) {
              const last = tags[tags.length - 1];
              if (last) removeTag(last);
            }
          }}
          onPaste={(e) => {
            // If user pastes a multi-token string AND the input is empty,
            // split immediately into chips instead of waiting for Enter.
            const text = e.clipboardData.getData("text");
            if (text && /\s/.test(text.trim()) && !draft) {
              e.preventDefault();
              const parts = text.trim().split(/\s+/).filter(Boolean);
              onChange((prev) => {
                const existing = new Set(prev.split(/\s+/).filter(Boolean));
                for (const t of parts) existing.add(t);
                return [...existing].join(" ");
              });
            }
          }}
        />
      </div>
      {suggestionsVisible && (
        <ul className="taginput__suggestions">
          {suggestions.map((s, idx) => (
            <li key={s.name} className={highlight === idx ? "on" : ""}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onTouchStart={(e) => e.stopPropagation()}
                onClick={() => commitOne(s.name)}
                onMouseEnter={() => setHighlight(idx)}
              >
                <span>{draft.startsWith("-") ? `-${s.name}` : s.name}</span>
                <span className="count">{s.post_count.toLocaleString()}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
