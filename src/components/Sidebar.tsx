import { useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import { useNotes } from "../lib/store";
import type { Folder, View } from "../lib/types";
import type { ThemeChoice } from "../lib/theme";
import { FolderIcon, MonitorIcon, MoonIcon, NotesIcon, PinIcon, PlusIcon, SunIcon, TrashIcon } from "./Icons";

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

export function Sidebar({ theme, onCycleTheme }: { theme: ThemeChoice; onCycleTheme(): void }) {
  const folders = useNotes((s) => s.folders);
  const notes = useNotes((s) => s.notes);
  const view = useNotes((s) => s.view);
  const setView = useNotes((s) => s.setView);
  const createFolder = useNotes((s) => s.createFolder);
  const renameFolder = useNotes((s) => s.renameFolder);
  const deleteFolder = useNotes((s) => s.deleteFolder);

  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

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
    >
      {icon}
      <span className="side-label">{label}</span>
      {count !== undefined && <span className="side-count">{count}</span>}
    </button>
  );

  const onNameKey = (e: KeyboardEvent<HTMLInputElement>, commit: (v: string) => void, cancel: () => void) => {
    if (e.key === "Enter") commit(e.currentTarget.value);
    if (e.key === "Escape") cancel();
  };

  return (
    <nav className="sidebar" aria-label="Folders and tags">
      <div className="side-group">
        {item({ kind: "all" }, <NotesIcon className="accent-icon" />, "All Notes", counts.all)}
        {item({ kind: "pinned" }, <PinIcon className="accent-icon" />, "Pinned", counts.pinned)}
      </div>

      <div className="side-heading">Folders</div>
      <div className="side-group">
        {rows.map(({ folder, depth }) =>
          renaming === folder.id ? (
            <input
              key={folder.id}
              className="side-input"
              style={{ marginLeft: depth * 18 }}
              defaultValue={folder.name}
              aria-label="Folder name"
              autoFocus
              onFocus={(e) => e.currentTarget.select()}
              onBlur={(e) => {
                renameFolder(folder.id, e.currentTarget.value);
                setRenaming(null);
              }}
              onKeyDown={(e) => onNameKey(e, (v) => (renameFolder(folder.id, v), setRenaming(null)), () => setRenaming(null))}
            />
          ) : (
            <div key={folder.id} className="side-row" style={{ paddingLeft: depth * 18 }}>
              <button
                className={`side-item${sameView(view, { kind: "folder", id: folder.id }) ? " is-active" : ""}`}
                onClick={() => setView({ kind: "folder", id: folder.id })}
                onDoubleClick={() => setRenaming(folder.id)}
                title="Double-click to rename"
              >
                <FolderIcon className="accent-icon" />
                <span className="side-label">{folder.name}</span>
                <span className="side-count">{counts.perFolder[folder.id] ?? 0}</span>
              </button>
              {folders.length > 1 && (
                <button
                  className={`side-delete${confirmDelete === folder.id ? " is-confirming" : ""}`}
                  aria-label={confirmDelete === folder.id ? `Confirm delete ${folder.name}` : `Delete ${folder.name}`}
                  onClick={() => {
                    if (confirmDelete === folder.id) {
                      deleteFolder(folder.id);
                      setConfirmDelete(null);
                    } else setConfirmDelete(folder.id);
                  }}
                  onBlur={() => setConfirmDelete(null)}
                >
                  {confirmDelete === folder.id ? "Delete?" : <TrashIcon size={15} />}
                </button>
              )}
            </div>
          ),
        )}
        {adding && (
          <input
            className="side-input"
            placeholder="Folder name"
            aria-label="New folder name"
            autoFocus
            onBlur={(e) => {
              if (e.currentTarget.value.trim()) createFolder(e.currentTarget.value, null);
              setAdding(false);
            }}
            onKeyDown={(e) =>
              onNameKey(
                e,
                (v) => {
                  if (v.trim()) createFolder(v, null);
                  setAdding(false);
                },
                () => setAdding(false),
              )
            }
          />
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

      <button className="side-action" onClick={() => setAdding(true)}>
        <PlusIcon />
        <span>New Folder</span>
      </button>
      <button className="side-action" onClick={onCycleTheme} aria-label={`Theme: ${themeLabel[theme]}. Click to change.`}>
        {theme === "light" ? <SunIcon /> : theme === "dark" ? <MoonIcon /> : <MonitorIcon />}
        <span>{themeLabel[theme]}</span>
      </button>
    </nav>
  );
}
