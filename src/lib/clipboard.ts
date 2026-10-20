import { readText } from "@tauri-apps/plugin-clipboard-manager";

const inTauri = "__TAURI_INTERNALS__" in window;

/** Copy or cut the current selection, keeping its formatting. */
export function copySelection(cut = false) {
  document.execCommand(cut ? "cut" : "copy");
}

/** Plain text from the system clipboard, or null if it can't be read. */
export async function readClipboardText(): Promise<string | null> {
  try {
    return inTauri ? await readText() : await navigator.clipboard.readText();
  } catch {
    return null;
  }
}

/** Paste plain text into a focused input or textarea. */
export async function pasteIntoInput(input: HTMLInputElement | HTMLTextAreaElement) {
  const text = await readClipboardText();
  if (text === null) return;
  input.focus();
  // insertText keeps the field's own undo history.
  document.execCommand("insertText", false, text);
}
