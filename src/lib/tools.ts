import { readText, writeText } from "@tauri-apps/plugin-clipboard-manager";
import { create } from "zustand";
import { INSERT_TEXT_EVENT } from "../editor/extensions";

/**
 * The quick tools (calculator, colour, clipboard) live only in memory. Nothing
 * here is ever written to disk, a backup or a JSON export; it is gone when the
 * app quits.
 */
export type ToolTab = "calculator" | "color" | "clipboard";

export interface ClipEntry {
  id: number;
  text: string;
  at: number;
}

interface ToolsState {
  open: boolean;
  tab: ToolTab;
  calcHistory: { expr: string; result: string }[];
  color: string;
  clips: ClipEntry[];
  clipsPaused: boolean;
  toggle(tab?: ToolTab): void;
}

export const MAX_CLIPS = 50;
const MAX_CLIP_LENGTH = 20_000;

export const useTools = create<ToolsState>((set, get) => ({
  open: false,
  tab: "calculator",
  calcHistory: [],
  color: "#d9a400",
  clips: [],
  clipsPaused: false,
  toggle(tab) {
    const s = get();
    if (tab && s.open && s.tab !== tab) set({ tab });
    else set({ open: !s.open, tab: tab ?? s.tab });
  },
}));

const inTauri = "__TAURI_INTERNALS__" in window;

/** Sends plain text to the open note at the cursor. */
export const insertIntoNote = (text: string) => window.dispatchEvent(new CustomEvent(INSERT_TEXT_EVENT, { detail: text }));

export async function copyText(text: string) {
  try {
    if (inTauri) await writeText(text);
    else await navigator.clipboard.writeText(text);
  } catch {
    // Clipboard busy or blocked; nothing useful to tell the user.
  }
}

let nextClipId = 1;
let lastSeen: string | null = null;

/** Adds text to the top of the clipboard history, moving an older copy up. */
function remember(text: string) {
  if (!text.trim() || text.length > MAX_CLIP_LENGTH) return;
  useTools.setState((s) => ({
    clips: [{ id: nextClipId++, text, at: Date.now() }, ...s.clips.filter((c) => c.text !== text)].slice(0, MAX_CLIPS),
  }));
}

const POLL_MS = 1000;

/**
 * Watches the system clipboard for text while the app runs. Windows has no
 * change event we can reach from here, so it reads once a second; a read is a
 * small native call and nothing happens when the text hasn't changed.
 */
export function watchClipboard(): () => void {
  if (!inTauri) return () => {};
  let busy = false;
  const tick = async () => {
    if (busy || useTools.getState().clipsPaused) return;
    busy = true;
    try {
      const text = await readText();
      if (text !== lastSeen) {
        remember(text);
        lastSeen = text;
      }
    } catch {
      // Not text (an image, files) or the clipboard is locked by another app.
    } finally {
      busy = false;
    }
  };
  tick();
  const timer = window.setInterval(tick, POLL_MS);
  return () => window.clearInterval(timer);
}
