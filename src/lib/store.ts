import { create } from "zustand";
import { api } from "./api";
import type { Folder, NoteSummary, NoteUpdate, View } from "./types";

interface NotesState {
  loaded: boolean;
  error: string | null;
  folders: Folder[];
  /** Summaries only; full notes are loaded by the editor on demand. */
  notes: Record<string, NoteSummary>;
  view: View;
  selectedId: string | null;
  query: string;
  /** A folder name being typed in the sidebar; parentId null = top level. */
  folderDraft: { parentId: string | null } | null;
  showShortcuts: boolean;

  init(): Promise<void>;
  setView(view: View): void;
  select(id: string | null): void;
  setQuery(query: string): void;
  newNote(folderId?: string): Promise<void>;
  moveNote(id: string, folderId: string): Promise<void>;
  saveNote(update: NoteUpdate): Promise<void>;
  togglePin(id: string): Promise<void>;
  deleteNote(id: string): Promise<void>;
  restoreNote(id: string): Promise<void>;
  purgeNote(id: string): Promise<void>;
  createFolder(name: string, parentId: string | null): Promise<void>;
  renameFolder(id: string, name: string): Promise<void>;
  deleteFolder(id: string): Promise<void>;
}

const byId = (list: NoteSummary[]) => Object.fromEntries(list.map((n) => [n.id, n]));

export const useNotes = create<NotesState>((set, get) => {
  const putNote = (n: NoteSummary) => set((s) => ({ notes: { ...s.notes, [n.id]: n } }));
  const fail = (e: unknown) => set({ error: String(e) });

  return {
    loaded: false,
    error: null,
    folders: [],
    notes: {},
    view: { kind: "all" },
    selectedId: null,
    query: "",
    folderDraft: null,
    showShortcuts: false,

    async init() {
      try {
        const lib = await api.getLibrary();
        set({ folders: lib.folders, notes: byId(lib.notes), loaded: true });
      } catch (e) {
        fail(e);
      }
    },

    setView: (view) => set({ view, selectedId: null }),
    select: (selectedId) => set({ selectedId }),
    setQuery: (query) => set({ query }),

    async newNote(target) {
      const { view, folders } = get();
      const folderId = target ?? (view.kind === "folder" ? view.id : folders[0]?.id);
      if (!folderId) return;
      try {
        const note = await api.createNote(folderId);
        const { content: _content, ...summary } = note;
        putNote(summary);
        const keepView = view.kind === "folder" && view.id === folderId;
        set({ selectedId: note.id, query: "", view: keepView ? view : target ? { kind: "folder", id: folderId } : { kind: "all" } });
      } catch (e) {
        fail(e);
      }
    },

    async moveNote(id, folderId) {
      if (get().notes[id]?.folderId === folderId) return;
      try {
        putNote(await api.moveNote(id, folderId));
      } catch (e) {
        fail(e);
      }
    },

    async saveNote(update) {
      try {
        putNote(await api.saveNote(update));
      } catch (e) {
        fail(e);
      }
    },

    async togglePin(id) {
      const n = get().notes[id];
      if (!n) return;
      try {
        putNote(await api.setPinned(id, !n.pinned));
      } catch (e) {
        fail(e);
      }
    },

    async deleteNote(id) {
      try {
        putNote(await api.deleteNote(id));
        if (get().selectedId === id) set({ selectedId: null });
      } catch (e) {
        fail(e);
      }
    },

    async restoreNote(id) {
      try {
        putNote(await api.restoreNote(id));
      } catch (e) {
        fail(e);
      }
    },

    async purgeNote(id) {
      try {
        await api.purgeNote(id);
        set((s) => {
          const notes = { ...s.notes };
          delete notes[id];
          return { notes, selectedId: s.selectedId === id ? null : s.selectedId };
        });
      } catch (e) {
        fail(e);
      }
    },

    async createFolder(name, parentId) {
      try {
        const folder = await api.createFolder(name, parentId);
        set((s) => ({ folders: [...s.folders, folder], view: { kind: "folder", id: folder.id }, selectedId: null, folderDraft: null }));
      } catch (e) {
        fail(e);
      }
    },

    async renameFolder(id, name) {
      try {
        const folder = await api.renameFolder(id, name);
        set((s) => ({ folders: s.folders.map((f) => (f.id === id ? folder : f)) }));
      } catch (e) {
        fail(e);
      }
    },

    async deleteFolder(id) {
      try {
        const lib = await api.deleteFolder(id);
        set({ folders: lib.folders, notes: byId(lib.notes), view: { kind: "all" }, selectedId: null });
      } catch (e) {
        fail(e);
      }
    },
  };
});

/** Notes visible in the current view, newest first. */
export function visibleNotes(notes: Record<string, NoteSummary>, view: View, query: string, folders: Folder[]): NoteSummary[] {
  let folderSet: Set<string> | null = null;
  if (view.kind === "folder") {
    // A folder shows its own notes and those of its subfolders.
    folderSet = new Set([view.id]);
    for (let grew = true; grew; ) {
      grew = false;
      for (const f of folders) {
        if (f.parentId && folderSet.has(f.parentId) && !folderSet.has(f.id)) {
          folderSet.add(f.id);
          grew = true;
        }
      }
    }
  }
  const q = query.trim().toLowerCase();
  const out: NoteSummary[] = [];
  for (const n of Object.values(notes)) {
    const deleted = n.deletedAt !== null;
    if (view.kind === "deleted" ? !deleted : deleted) continue;
    if (view.kind === "pinned" && !n.pinned) continue;
    if (folderSet && !folderSet.has(n.folderId)) continue;
    if (view.kind === "tag" && !n.tags.includes(view.tag)) continue;
    if (q && !n.title.toLowerCase().includes(q) && !n.snippet.toLowerCase().includes(q)) continue;
    out.push(n);
  }
  out.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
  return out;
}
