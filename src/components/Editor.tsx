import { EditorState } from "@tiptap/pm/state";
import { EditorContent, useEditor, type Editor as TiptapEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useCallback, useEffect, useRef } from "react";
import { api } from "../lib/api";
import { longDate } from "../lib/dates";
import { useNotes } from "../lib/store";
import type { DocJSON } from "../lib/types";
import { PinIcon, RestoreIcon, TrashIcon } from "./Icons";

const SAVE_DELAY_MS = 400;
const SNIPPET_LENGTH = 120;
const TAG_PATTERN = /(?:^|\s)#([\p{L}\p{N}_-]+)/gu;

/** Title = first non-empty block, snippet = the text after it, tags = #words. */
function extractMeta(editor: TiptapEditor) {
  const blocks: string[] = [];
  editor.state.doc.forEach((node) => {
    const text = node.textBetween(0, node.content.size, " ", " ").trim();
    if (text) blocks.push(text);
  });
  const fullText = editor.state.doc.textBetween(0, editor.state.doc.content.size, "\n", " ");
  const tags = new Set<string>();
  for (const m of fullText.matchAll(TAG_PATTERN)) tags.add(m[1].toLowerCase());
  return {
    title: (blocks[0] ?? "").slice(0, 200),
    snippet: blocks.slice(1).join(" ").slice(0, SNIPPET_LENGTH),
    tags: [...tags],
  };
}

export function Editor() {
  const selectedId = useNotes((s) => s.selectedId);
  const summary = useNotes((s) => (s.selectedId ? s.notes[s.selectedId] : undefined));
  const saveNote = useNotes((s) => s.saveNote);
  const togglePin = useNotes((s) => s.togglePin);
  const deleteNote = useNotes((s) => s.deleteNote);
  const restoreNote = useNotes((s) => s.restoreNote);
  const purgeNote = useNotes((s) => s.purgeNote);

  // The note whose content is in the editor right now. Saves always target
  // this id, never the selection, so a fast note switch can't cross wires.
  const loadedId = useRef<string | null>(null);
  const timer = useRef<number | null>(null);
  const editorRef = useRef<TiptapEditor | null>(null);

  const saveNow = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    const editor = editorRef.current;
    const id = loadedId.current;
    if (!editor || !id) return;
    saveNote({ id, ...extractMeta(editor), content: editor.getJSON() as DocJSON });
  }, [saveNote]);

  const editor = useEditor({
    extensions: [StarterKit],
    editorProps: { attributes: { class: "note-body", spellcheck: "true", "aria-label": "Note text" } },
    onUpdate: () => {
      if (!loadedId.current) return;
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(saveNow, SAVE_DELAY_MS);
    },
  });
  editorRef.current = editor;

  // Swap the open note into the single, reused editor instance.
  useEffect(() => {
    if (!editor) return;
    if (timer.current !== null) saveNow();
    loadedId.current = null;
    if (!selectedId) return;

    let cancelled = false;
    api.loadNote(selectedId).then(
      (note) => {
        if (cancelled) return;
        let doc;
        try {
          doc = editor.schema.nodeFromJSON(note.content);
        } catch {
          doc = editor.schema.topNodeType.createAndFill()!;
        }
        // A fresh state (not setContent) so undo history never leaks between notes.
        editor.view.updateState(EditorState.create({ doc, plugins: editor.state.plugins }));
        editor.setEditable(!note.deletedAt);
        loadedId.current = note.id;
        if (!note.title && !note.deletedAt) editor.commands.focus("end");
      },
      (e) => useNotes.setState({ error: String(e) }),
    );
    return () => {
      cancelled = true;
    };
  }, [selectedId, editor, saveNow]);

  // Don't lose the last few keystrokes when the window loses focus or closes.
  useEffect(() => {
    const flush = () => timer.current !== null && saveNow();
    window.addEventListener("blur", flush);
    window.addEventListener("beforeunload", flush);
    return () => {
      window.removeEventListener("blur", flush);
      window.removeEventListener("beforeunload", flush);
    };
  }, [saveNow]);

  const deleted = !!summary?.deletedAt;

  return (
    <main className="editor-pane">
      <div className="editor-toolbar" role="toolbar" aria-label="Note actions">
        <div className="toolbar-spacer" />
        {summary && !deleted && (
          <>
            <button
              className={`icon-button${summary.pinned ? " accent" : ""}`}
              aria-pressed={summary.pinned}
              aria-label={summary.pinned ? "Unpin note" : "Pin note"}
              title={summary.pinned ? "Unpin note" : "Pin note"}
              onClick={() => togglePin(summary.id)}
            >
              <PinIcon />
            </button>
            <button className="icon-button" aria-label="Delete note" title="Delete note (Delete)" onClick={() => deleteNote(summary.id)}>
              <TrashIcon />
            </button>
          </>
        )}
      </div>

      {deleted && summary && (
        <div className="deleted-banner" role="status">
          <span>This note is in Recently Deleted and will be removed after 30 days.</span>
          <button className="text-button" onClick={() => restoreNote(summary.id)}>
            <RestoreIcon size={16} /> Recover
          </button>
          <button className="text-button danger" onClick={() => purgeNote(summary.id)}>
            Delete Now
          </button>
        </div>
      )}

      <div className="editor-scroll" hidden={!summary}>
        <article className="editor-page">
          {summary && <div className="editor-date">{longDate(summary.updatedAt)}</div>}
          <EditorContent editor={editor} />
        </article>
      </div>
      {!summary && <div className="editor-empty">No note selected</div>}
    </main>
  );
}
