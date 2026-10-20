import { readText, writeText } from "@tauri-apps/plugin-clipboard-manager";
import { create } from "zustand";
import { INSERT_TEXT_EVENT } from "../editor/extensions";

/**
 * The quick tools live only in memory. Nothing here is ever written to disk,
 * a backup or a JSON export, and nothing is read back from one; it is all gone
 * when the app quits.
 */
export type ToolId = "calculator" | "color" | "clipboard" | "password" | "currency" | "snip" | "tailwind";

export interface Rates {
  /** Day the rates were published (ECB reference rates). */
  date: string;
  /** Units of each currency per 1 INR. */
  perInr: Record<string, number>;
}

export interface ClipEntry {
  id: number;
  text: string;
  at: number;
}

interface ToolsState {
  open: boolean;
  tool: ToolId;
  calcHistory: { expr: string; result: string }[];
  color: string;
  clips: ClipEntry[];
  clipsPaused: boolean;
  rates: Rates | null;
  /** Opens a tool, or closes the panel if that tool is already showing. No tool: toggles the last one. */
  toggle(tool?: ToolId): void;
}

export const MAX_CLIPS = 50;
const MAX_CLIP_LENGTH = 20_000;

export const useTools = create<ToolsState>((set, get) => ({
  open: false,
  tool: "calculator",
  calcHistory: [],
  color: "#d9a400",
  clips: [],
  clipsPaused: false,
  rates: null,
  toggle(tool) {
    const s = get();
    if (!tool) set({ open: !s.open });
    else set({ open: !(s.open && s.tool === tool), tool });
  },
}));

const inTauri = "__TAURI_INTERNALS__" in window;
/** The clipboard text the watcher last saw. */
let lastSeen: string | null = null;

/** Sends plain text to the open note at the cursor. */
export const insertIntoNote = (text: string) => window.dispatchEvent(new CustomEvent(INSERT_TEXT_EVENT, { detail: text }));

/** Copies to the system clipboard. `secret` text (passwords) stays out of the clipboard history. */
export async function copyText(text: string, secret = false) {
  if (secret) lastSeen = text;
  try {
    if (inTauri) await writeText(text);
    else await navigator.clipboard.writeText(text);
  } catch {
    // Clipboard busy or blocked; nothing useful to tell the user.
  }
}

let nextClipId = 1;

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
