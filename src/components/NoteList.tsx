import { useVirtualizer } from "@tanstack/react-virtual";
import { forwardRef, useEffect, useMemo, useRef, type KeyboardEvent } from "react";
import { groupLabel, rowTime } from "../lib/dates";
import { SEPARATOR, openContextMenu, type MenuEntry } from "../lib/menu";
import { KEYS } from "../lib/shortcuts";
import { useNotes, visibleNotes } from "../lib/store";
import type { Folder, NoteSummary, View } from "../lib/types";
import { ComposeIcon, FolderIcon, SearchIcon } from "./Icons";
import { NOTE_DRAG_TYPE } from "./Sidebar";

type Row = { kind: "header"; label: string } | { kind: "note"; note: NoteSummary };

const HEADER_HEIGHT = 34;
const NOTE_HEIGHT = 76;
// Rows inside a folder skip the folder line, so they are shorter.
const NOTE_HEIGHT_IN_FOLDER = 58;

function buildRows(notes: NoteSummary[], view: View): Row[] {
  const rows: Row[] = [];
  const showPinned = view.kind !== "deleted" && view.kind !== "pinned";
  const pinned = showPinned ? notes.filter((n) => n.pinned) : [];
  if (pinned.length) {
    rows.push({ kind: "header", label: "Pinned" });
    for (const note of pinned) rows.push({ kind: "note", note });
  }
  const now = new Date();
  let last = "";
  for (const note of notes) {
    if (showPinned && note.pinned) continue;
    const label = groupLabel(note.updatedAt, now);
    if (label !== last) {
      rows.push({ kind: "header", label });
      last = label;
    }
    rows.push({ kind: "note", note });
  }
  return rows;
}

function viewTitle(view: View, folderName: (id: string) => string): string {
  switch (view.kind) {
    case "all":
      return "All Notes";
    case "pinned":
      return "Pinned";
    case "deleted":
      return "Recently Deleted";
    case "folder":
      return folderName(view.id);
    case "tag":
      return `#${view.tag}`;
  }
}

function noteMenu(n: NoteSummary, folders: Folder[]): MenuEntry[] {
  const s = useNotes.getState();
  if (n.deletedAt) {
    return [
      { label: "Recover", onSelect: () => s.restoreNote(n.id) },
      SEPARATOR,
      { label: "Delete Now", danger: true, onSelect: () => s.purgeNote(n.id) },
    ];
  }
  return [
    { label: "Open", onSelect: () => s.select(n.id) },
    { label: n.pinned ? "Unpin Note" : "Pin Note", shortcut: KEYS.pin, onSelect: () => s.togglePin(n.id) },
    {
      label: "Move To",
      submenu: folders.map((f) => ({ label: f.name, checked: f.id === n.folderId, disabled: f.id === n.folderId, onSelect: () => s.moveNote(n.id, f.id) })),
    },
    SEPARATOR,
    { label: "Delete", shortcut: KEYS.deleteNote, danger: true, onSelect: () => s.deleteNote(n.id) },
  ];
}

export const NoteList = forwardRef<HTMLInputElement>(function NoteList(_props, searchRef) {
  const notes = useNotes((s) => s.notes);
  const folders = useNotes((s) => s.folders);
  const view = useNotes((s) => s.view);
  const query = useNotes((s) => s.query);
  const selectedId = useNotes((s) => s.selectedId);
  const select = useNotes((s) => s.select);
  const setQuery = useNotes((s) => s.setQuery);
  const newNote = useNotes((s) => s.newNote);
  const deleteNote = useNotes((s) => s.deleteNote);

  const folderNames = useMemo(() => new Map(folders.map((f) => [f.id, f.name])), [folders]);
  const list = useMemo(() => visibleNotes(notes, view, query, folders), [notes, view, query, folders]);
  const rows = useMemo(() => buildRows(list, view), [list, view]);
  const order = useMemo(() => rows.flatMap((r) => (r.kind === "note" ? [r.note.id] : [])), [rows]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => (rows[i].kind === "header" ? HEADER_HEIGHT : view.kind === "folder" ? NOTE_HEIGHT_IN_FOLDER : NOTE_HEIGHT),
    overscan: 8,
  });

  // Row heights depend on the view, so re-measure when it changes.
  useEffect(() => virtualizer.measure(), [view.kind, virtualizer]);

  // Keep the selected note in view when it changes from the keyboard.
  useEffect(() => {
    const i = rows.findIndex((r) => r.kind === "note" && r.note.id === selectedId);
    if (i >= 0) virtualizer.scrollToIndex(i, { align: "auto" });
  }, [selectedId, rows, virtualizer]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!order.length) return;
    const at = selectedId ? order.indexOf(selectedId) : -1;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      select(order[Math.min(order.length - 1, at + 1)]);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      select(order[Math.max(0, at - 1)]);
    } else if (e.key === "Delete" && selectedId && view.kind !== "deleted") {
      e.preventDefault();
      const next = order[at + 1] ?? order[at - 1] ?? null;
      deleteNote(selectedId).then(() => select(next));
    }
  };

  const count = list.length;
  return (
    <section className="note-list" aria-label="Notes">
      <div className="list-header">
        <div className="list-title">
          <h1>{viewTitle(view, (id) => folderNames.get(id) ?? "Folder")}</h1>
          <span>
            {count} {count === 1 ? "note" : "notes"}
          </span>
        </div>
        {view.kind !== "deleted" && (
          <button className="icon-button accent" aria-label="New note (Ctrl+N)" title="New note (Ctrl+N)" onClick={() => newNote()}>
            <ComposeIcon size={20} />
          </button>
        )}
      </div>

      <div className="search-box">
        <SearchIcon size={16} />
        <input
          ref={searchRef}
          type="search"
          placeholder="Search"
          aria-label="Search notes"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && setQuery("")}
        />
        <kbd>Ctrl+F</kbd>
      </div>

      <div
        className="list-scroll"
        ref={scrollRef}
        tabIndex={0}
        onKeyDown={onKeyDown}
        aria-label="Note list"
        onContextMenu={(e) => view.kind !== "deleted" && openContextMenu(e, [{ label: "New Note", shortcut: KEYS.newNote, onSelect: () => newNote() }])}
      >
        {count === 0 ? (
          <p className="list-empty">{query ? "No matching notes" : view.kind === "deleted" ? "Nothing here" : "No notes"}</p>
        ) : (
          <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
            {virtualizer.getVirtualItems().map((v) => {
              const row = rows[v.index];
              const style = { position: "absolute" as const, top: 0, left: 0, right: 0, height: v.size, transform: `translateY(${v.start}px)` };
              if (row.kind === "header") {
                return (
                  <div key={v.key} className="list-group" style={style}>
                    {row.label}
                  </div>
                );
              }
              const n = row.note;
              const selected = n.id === selectedId;
              return (
                <div key={v.key} style={style} className="note-row-wrap">
                  <button
                    className={`note-row${selected ? " is-selected" : ""}`}
                    aria-pressed={selected}
                    onClick={() => select(n.id)}
                    onContextMenu={(e) => openContextMenu(e, noteMenu(n, folders))}
                    draggable={!n.deletedAt}
                    onDragStart={(e) => {
                      e.dataTransfer.setData(NOTE_DRAG_TYPE, n.id);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                  >
                    <span className="note-title">{n.title || "New Note"}</span>
                    <span className="note-meta">
                      <strong>{rowTime(n.updatedAt)}</strong> {n.snippet || "No additional text"}
                    </span>
                    {view.kind !== "folder" && (
                      <span className="note-folder">
                        <FolderIcon size={12} />
                        {folderNames.get(n.folderId) ?? "Notes"}
                      </span>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
});
