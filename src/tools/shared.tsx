import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNotes } from "../lib/store";
import { copyText } from "../lib/tools";

/** True when a note is open and can take inserted text. */
export function useCanInsert() {
  return useNotes((s) => !!s.selectedId && !s.notes[s.selectedId]?.deletedAt);
}

/** Copies text; `what` is the short label the panel shows ("Copied #1E90FF"). */
export type Copy = (text: string, what?: string, secret?: boolean) => void;

/** Copies text and briefly says so at the bottom of the panel. */
export function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  const timer = useRef<number>();
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const copy: Copy = (text, what = text, secret = false) => {
    copyText(text, secret);
    setCopied(what);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(null), 1400);
  };
  return { copied, copy };
}

export function IconAction({ label, onClick, disabled, children }: { label: string; onClick(): void; disabled?: boolean; children: ReactNode }) {
  return (
    <button className="tool-button small" aria-label={label} title={label} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}
