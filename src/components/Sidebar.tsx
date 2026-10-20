import { useMemo, useState, type DragEvent, type KeyboardEvent, type ReactNode } from "react";
import { SEPARATOR, openContextMenu } from "../lib/menu";
import { KEYS } from "../lib/shortcuts";
import { useNotes } from "../lib/store";
import type { Folder, View } from "../lib/types";
import type { ThemeChoice } from "../lib/theme";
import { useTools } from "../lib/tools";
import { openToolsMenu } from "../tools/registry";
import { CloudIcon, FolderIcon, KeyboardIcon, MonitorIcon, MoonIcon, NotesIcon, PinIcon, PlusIcon, SunIcon, ToolsIcon, TrashIcon } from "./Icons";

/** MIME type used when a note row is dragged onto a folder. */
export const NOTE_DRAG_TYPE = "application/x-windows-notes-note";

interface FolderRow {
  folder: Folder;
  depth: number;
}

/** Depth-first order so subfolders sit under their parent. */
function flattenFolders(folders: Folder[]): FolderRow[] {
  const children = new Map<string | null, Folder[]>();
  for (const f of folders) {
    const key = f.parentId && folders.some((p) => p.id === f.parentId) ? f.parentId : null;
    children.set(key, [...(children.get(key) ?? []), f]);
  }
  const rows: FolderRow[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const f of children.get(parent) ?? []) {
      rows.push({ folder: f, depth });
      walk(f.id, depth + 1);
    }
  };
  walk(null, 0);
  return rows;
}

const sameView = (a: View, b: View) =>
  a.kind === b.kind &&
  (a.kind !== "folder" || a.id === (b as typeof a).id) &&
  (a.kind !== "tag" || a.tag === (b as typeof a).tag);

const themeLabel: Record<ThemeChoice, string> = { system: "Match Windows", light: "Light", dark: "Dark" };

function FolderNameInput({ initial, depth, label, onCommit, onCancel }: { initial: string; depth: number; label: string; onCommit(name: string): void; onCancel(): void }) {
  const [done, setDone] = useState(false);
  const commit = (v: string) => {
    if (done) return;
    setDone(true);
    v.trim() ? onCommit(v) : onCancel();
  };
  return (
    <input
      className="side-input"
      style={{ marginLeft: depth * 18 }}
      defaultValue={initial}
      placeholder="Folder name"
      aria-label={label}
      autoFocus
      onFocus={(e) => e.currentTarget.select()}
      onBlur={(e) => commit(e.currentTarget.value)}
      onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") commit(e.currentTarget.value);
        if (e.key === "Escape") {
          setDone(true);
          onCancel();
        }
      }}
    />
  );
}

export function Sidebar({ theme, onCycleTheme }: { theme: ThemeChoice; onCycleTheme(): void }) {
  const folders = useNotes((s) => s.folders);
  const notes = useNotes((s) => s.notes);
  const view = useNotes((s) => s.view);
  const folderDraft = useNotes((s) => s.folderDraft);
  const toolsOpen = useTools((s) => s.open);
  const setView = useNotes((s) => s.setView);
  const newNote = useNotes((s) => s.newNote);
  const moveNote = useNotes((s) => s.moveNote);
  const createFolder = useNotes((s) => s.createFolder);
  const renameFolder = useNotes((s) => s.renameFolder);
  const deleteFolder = useNotes((s) => s.deleteFolder);

  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const setDraft = (parentId: string | null | undefined) => useNotes.setState({ folderDraft: parentId === undefined ? null : { parentId } });

  const counts = useMemo(() => {
    let all = 0, pinned = 0, deleted = 0;
    const perFolder: Record<string, number> = {};
    const tags: Record<string, number> = {};
    for (const n of Object.values(notes)) {
      if (n.deletedAt) {
        deleted++;
        continue;
      }
      all++;
      if (n.pinned) pinned++;
      perFolder[n.folderId] = (perFolder[n.folderId] ?? 0) + 1;
      for (const t of n.tags) tags[t] = (tags[t] ?? 0) + 1;
    }
    return { all, pinned, deleted, perFolder, tags: Object.keys(tags).sort() };
  }, [notes]);

  const rows = useMemo(() => flattenFolders(folders), [folders]);

  const item = (target: View, icon: ReactNode, label: string, count?: number) => (
    <button
      className={`side-item${sameView(view, target) ? " is-active" : ""}`}
      aria-current={sameView(view, target) ? "page" : undefined}
      onClick={() => setView(target)}
      onContextMenu={(e) =>
        openContextMenu(e, target.kind === "deleted" ? [] : [{ label: "New Note", shortcut: KEYS.newNote, onSelect: () => newNote() }])
      }
    >
      {icon}
      <span className="side-label">{label}</span>
      {count !== undefined && <span className="side-count">{count}</span>}
    </button>
  );

  const dropHandlers = (folderId: string) => ({
    onDragOver: (e: DragEvent) => {
      if (!e.dataTransfer.types.includes(NOTE_DRAG_TYPE)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDropTarget(folderId);
    },
    onDragLeave: () => setDropTarget((t) => (t === folderId ? null : t)),
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      setDropTarget(null);
      const id = e.dataTransfer.getData(NOTE_DRAG_TYPE);
      if (id) moveNote(id, folderId);
    },
  });

  const folderMenu = (folder: Folder) => [
    { label: "New Note", shortcut: KEYS.newNote, onSelect: () => newNote(folder.id) },
    { label: "New Subfolder", onSelect: () => setDraft(folder.id) },
    SEPARATOR,
    { label: "Rename", onSelect: () => setRenaming(folder.id) },
    folders.length > 1 && { label: "Delete Folder…", danger: true, onSelect: () => setConfirmDelete(folder.id) },
  ];

  return (
    <nav className="sidebar" aria-label="Folders and tags" onContextMenu={(e) => openContextMenu(e, [{ label: "New Folder", shortcut: KEYS.newFolder, onSelect: () => setDraft(null) }])}>
      <div className="side-group">
        {item({ kind: "all" }, <NotesIcon className="accent-icon" />, "All Notes", counts.all)}
        {item({ kind: "pinned" }, <PinIcon className="accent-icon" />, "Pinned", counts.pinned)}
      </div>

      <div className="side-heading">Folders</div>
      <div className="side-group">
        {rows.map(({ folder, depth }) => (
          <div key={folder.id}>
            {renaming === folder.id ? (
              <FolderNameInput
                initial={folder.name}
                depth={depth}
                label="Folder name"
                onCommit={(v) => (renameFolder(folder.id, v), setRenaming(null))}
                onCancel={() => setRenaming(null)}
              />
            ) : (
              <div className={`side-row${dropTarget === folder.id ? " is-drop-target" : ""}`} style={{ paddingLeft: depth * 18 }} {...dropHandlers(folder.id)}>
                <button
                  className={`side-item${sameView(view, { kind: "folder", id: folder.id }) ? " is-active" : ""}`}
                  onClick={() => setView({ kind: "folder", id: folder.id })}
                  onDoubleClick={() => setRenaming(folder.id)}
                  onKeyDown={(e) => e.key === "F2" && setRenaming(folder.id)}
                  onContextMenu={(e) => openContextMenu(e, folderMenu(folder))}
                  title="Double-click or F2 to rename"
                >
                  <FolderIcon className="accent-icon" />
                  <span className="side-label">{folder.name}</span>
                  <span className="side-count">{counts.perFolder[folder.id] ?? 0}</span>
                </button>
                {confirmDelete === folder.id && (
                  <button
                    className="side-delete is-confirming"
                    aria-label={`Confirm delete ${folder.name}`}
                    autoFocus
                    onClick={() => {
                      deleteFolder(folder.id);
                      setConfirmDelete(null);
                    }}
                    onBlur={() => setConfirmDelete(null)}
                  >
                    Delete?
                  </button>
                )}
              </div>
            )}
            {folderDraft?.parentId === folder.id && (
              <FolderNameInput initial="" depth={depth + 1} label="New subfolder name" onCommit={(v) => createFolder(v, folder.id)} onCancel={() => setDraft(undefined)} />
            )}
          </div>
        ))}
        {folderDraft && folderDraft.parentId === null && (
          <FolderNameInput initial="" depth={0} label="New folder name" onCommit={(v) => createFolder(v, null)} onCancel={() => setDraft(undefined)} />
        )}
      </div>

      {counts.tags.length > 0 && (
        <>
          <div className="side-heading">Tags</div>
          <div className="tag-cloud">
            {counts.tags.map((tag) => (
              <button
                key={tag}
                className={`tag-chip${sameView(view, { kind: "tag", tag }) ? " is-active" : ""}`}
                onClick={() => setView({ kind: "tag", tag })}
              >
                #{tag}
              </button>
            ))}
          </div>
        </>
      )}

      <div className="side-group side-deleted">
        {item({ kind: "deleted" }, <TrashIcon />, "Recently Deleted", counts.deleted)}
      </div>

      <div className="side-spacer" />

      <button className="side-action" onClick={() => setDraft(null)} title={`New folder (${KEYS.newFolder})`}>
        <PlusIcon />
        <span>New Folder</span>
      </button>
      <button className="side-action" onClick={() => useNotes.setState({ showBackup: true })} title="Back up to Google Drive, export or import">
        <CloudIcon />
        <span>Backup &amp; Export</span>
      </button>
      <button
        className={`side-action${toolsOpen ? " is-active" : ""}`}
        aria-pressed={toolsOpen}
        aria-haspopup="menu"
        onClick={(e) => openToolsMenu(e.currentTarget)}
        title={`Calculator, color codes, passwords and more (${KEYS.tools} opens the last one)`}
      >
        <ToolsIcon />
        <span>Quick Tools</span>
        <span className="side-action-arrow" aria-hidden="true">›</span>
      </button>
      <button className="side-action" onClick={onCycleTheme} title={`Change theme (${KEYS.toggleTheme})`} aria-label={`Theme: ${themeLabel[theme]}. Click to change.`}>
        {theme === "light" ? <SunIcon /> : theme === "dark" ? <MoonIcon /> : <MonitorIcon />}
        <span>{themeLabel[theme]}</span>
      </button>
      <button className="side-action" onClick={() => useNotes.setState({ showShortcuts: true })} title={`Keyboard shortcuts (${KEYS.shortcuts})`}>
        <KeyboardIcon />
        <span>Keyboard Shortcuts</span>
      </button>
    </nav>
  );
}
