import { save as saveFile } from "@tauri-apps/plugin-dialog";
import type { Editor } from "@tiptap/react";
import { api } from "./api";

export type ExportKind = "pdf" | "html";

const FILTERS: Record<ExportKind, { name: string; extensions: string[] }> = {
  pdf: { name: "PDF", extensions: ["pdf"] },
  html: { name: "Web page", extensions: ["html"] },
};

/** The note's title as a file name, without the characters Windows forbids. */
function fileName(title: string, kind: ExportKind) {
  const base = title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "").trim().slice(0, 80) || "Note";
  return `${base}.${kind}`;
}

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** The app's light-theme variables and note styles, so the file looks like the note. */
function noteStyles() {
  const out: string[] = [];
  for (const sheet of document.styleSheets) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    for (const rule of rules) {
      if (rule instanceof CSSStyleRule && (rule.selectorText === ":root" || /\.note-body|\.color-code/.test(rule.selectorText))) out.push(rule.cssText);
    }
  }
  return out.join("\n");
}

/** The note as shown, colour codes included, minus the editor's own markup. */
function noteBody(editor: Editor) {
  const body = editor.view.dom.cloneNode(true) as HTMLElement;
  for (const el of [body, ...body.querySelectorAll("[contenteditable]")]) el.removeAttribute("contenteditable");
  body.querySelectorAll(".ProseMirror-trailingBreak, .ProseMirror-separator, .ProseMirror-gapcursor").forEach((el) => el.remove());
  // Ticks live in the checkbox's state, which plain HTML doesn't keep.
  body.querySelectorAll<HTMLInputElement>("input[type=checkbox]").forEach((box) => {
    box.toggleAttribute("checked", box.checked);
    box.setAttribute("disabled", "");
  });
  body.className = "note-body";
  for (const attr of ["role", "aria-label", "translate", "tabindex"]) body.removeAttribute(attr);
  return body.outerHTML;
}

function noteDocument(editor: Editor, title: string, date: string) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title || "Note")}</title>
<style>
${noteStyles()}
body { margin: 0; background: #ffffff; color: var(--text); font-family: "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif; font-size: 14px; }
main { max-width: 860px; margin: 0 auto; padding: 40px 24px; }
.note-date { font-size: 12px; color: var(--muted); margin-bottom: 16px; }
.note-body { min-height: 0; }
</style>
</head>
<body>
<main>
<div class="note-date">${escapeHtml(date)}</div>
${noteBody(editor)}
</main>
</body>
</html>
`;
}

/**
 * Asks where to save, then writes the open note as a PDF (printed from the app
 * with its print styles) or a standalone HTML page. Returns the path, or null
 * when the save dialog was cancelled.
 */
export async function exportNote(editor: Editor, kind: ExportKind, title: string, date: string) {
  const path = await saveFile({ defaultPath: fileName(title, kind), filters: [FILTERS[kind]] });
  if (!path) return null;
  if (kind === "pdf") await api.exportNotePdf(path);
  else await api.exportNoteHtml(path, noteDocument(editor, title, date));
  return path;
}
