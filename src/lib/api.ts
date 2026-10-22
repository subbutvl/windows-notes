import { invoke } from "@tauri-apps/api/core";
import type { BackupFile, DriveStatus, Folder, ImportReport, Library, Note, NoteSummary, NoteUpdate, ScreenInfo, SearchHit } from "./types";

/**
 * Thin wrapper over the Rust commands in src-tauri/src/lib.rs.
 *
 * When the UI runs in a plain browser (`npm run dev` without Tauri) it falls
 * back to an in-memory mock so the layout can be worked on without the
 * native shell. The mock is never used inside the app.
 */
export interface Api {
  getLibrary(): Promise<Library>;
  loadNote(id: string): Promise<Note>;
  createNote(folderId: string): Promise<Note>;
  saveNote(update: NoteUpdate): Promise<NoteSummary>;
  setPinned(id: string, pinned: boolean): Promise<NoteSummary>;
  moveNote(id: string, folderId: string): Promise<NoteSummary>;
  deleteNote(id: string): Promise<NoteSummary>;
  restoreNote(id: string): Promise<NoteSummary>;
  purgeNote(id: string): Promise<void>;
  createFolder(name: string, parentId: string | null): Promise<Folder>;
  renameFolder(id: string, name: string): Promise<Folder>;
  deleteFolder(id: string): Promise<Library>;
  systemFonts(): Promise<string[]>;
  startScreenSnip(): Promise<void>;
  openMeasure(): Promise<void>;
  closeMeasure(): Promise<void>;
  screenInfo(): Promise<ScreenInfo>;
  searchNotes(query: string): Promise<SearchHit[]>;
  exportLibrary(path: string): Promise<void>;
  exportNotePdf(path: string): Promise<void>;
  exportNoteHtml(path: string, html: string): Promise<void>;
  importLibrary(path: string): Promise<ImportReport>;
  driveStatus(): Promise<DriveStatus>;
  driveSetClient(clientId: string, clientSecret: string): Promise<DriveStatus>;
  driveConnect(): Promise<DriveStatus>;
  driveDisconnect(): Promise<DriveStatus>;
  driveList(): Promise<BackupFile[]>;
  driveBackup(): Promise<BackupFile>;
  driveRestore(fileId: string): Promise<ImportReport>;
}

const tauriApi: Api = {
  getLibrary: () => invoke("get_library"),
  loadNote: (id) => invoke("load_note", { id }),
  createNote: (folderId) => invoke("create_note", { folderId }),
  saveNote: (update) => invoke("save_note", { update }),
  setPinned: (id, pinned) => invoke("set_pinned", { id, pinned }),
  moveNote: (id, folderId) => invoke("move_note", { id, folderId }),
  deleteNote: (id) => invoke("delete_note", { id }),
  restoreNote: (id) => invoke("restore_note", { id }),
  purgeNote: (id) => invoke("purge_note", { id }),
  createFolder: (name, parentId) => invoke("create_folder", { name, parentId }),
  renameFolder: (id, name) => invoke("rename_folder", { id, name }),
  deleteFolder: (id) => invoke("delete_folder", { id }),
  systemFonts: () => invoke("list_system_fonts"),
  startScreenSnip: () => invoke("start_screen_snip"),
  openMeasure: () => invoke("open_measure"),
  closeMeasure: () => invoke("close_measure"),
  screenInfo: () => invoke("screen_info"),
  searchNotes: (query) => invoke("search_notes", { query }),
  exportLibrary: (path) => invoke("export_library", { path }),
  exportNotePdf: (path) => invoke("export_note_pdf", { path }),
  exportNoteHtml: (path, html) => invoke("export_note_html", { path, html }),
  importLibrary: (path) => invoke("import_library", { path }),
  driveStatus: () => invoke("drive_status"),
  driveSetClient: (clientId, clientSecret) => invoke("drive_set_client", { clientId, clientSecret }),
  driveConnect: () => invoke("drive_connect"),
  driveDisconnect: () => invoke("drive_disconnect"),
  driveList: () => invoke("drive_list"),
  driveBackup: () => invoke("drive_backup"),
  driveRestore: (fileId) => invoke("drive_restore", { fileId }),
};

const desktopOnly = () => new Error("This works in the desktop app only.");

function createMockApi(): Api {
  const now = () => new Date().toISOString();
  const uid = () => Math.random().toString(36).slice(2, 12);
  const text = (t: string) => [{ type: "text", text: t }];
  const folders: Folder[] = [
    { id: "notes", name: "Notes", parentId: null },
    { id: "work", name: "Work", parentId: null },
    { id: "meetings", name: "Meetings", parentId: "work" },
    { id: "recipes", name: "Recipes", parentId: null },
  ];
  const notes = new Map<string, Note>();
  const add = (folderId: string, title: string, body: string, hoursAgo: number, pinned = false) => {
    const ts = new Date(Date.now() - hoursAgo * 3_600_000).toISOString();
    const id = uid();
    notes.set(id, {
      id, folderId, title, snippet: body, tags: [], pinned, createdAt: ts, updatedAt: ts, deletedAt: null,
      content: { type: "doc", content: [{ type: "paragraph", content: text(title) }, { type: "paragraph", content: text(body) }] },
    });
  };
  add("work", "Q4 planning", "Goals for the quarter and this week", 1, true);
  add("notes", "Groceries", "Oat milk, eggs, basil, lemons", 26, true);
  add("meetings", "Standup notes", "Design review moved to Thursday", 2);
  add("notes", "App ideas", "Quick capture from the tray icon", 3);
  add("notes", "Kyoto trip", "Book a ryokan for three nights near Gion", 60);
  add("recipes", "Dal tadka", "One cup toor dal, turmeric, ghee, cumin", 100);
  for (let i = 0; i < 200; i++) add("notes", `Sample note ${i + 1}`, "Generated to test scrolling", 24 * (8 + i));

  const summary = ({ content: _c, ...s }: Note): NoteSummary => s;
  const get = (id: string) => {
    const n = notes.get(id);
    if (!n) throw new Error(`note not found: ${id}`);
    return n;
  };
  const patch = async (id: string, p: Partial<Note>) => {
    const n = { ...get(id), ...p };
    notes.set(id, n);
    return summary(n);
  };

  return {
    async getLibrary() {
      return { folders: [...folders], notes: [...notes.values()].map(summary) };
    },
    async loadNote(id) {
      return structuredClone(get(id));
    },
    async createNote(folderId) {
      const ts = now();
      const n: Note = {
        id: uid(), folderId, title: "", snippet: "", tags: [], pinned: false, createdAt: ts, updatedAt: ts, deletedAt: null,
        content: { type: "doc", content: [{ type: "paragraph" }] },
      };
      notes.set(n.id, n);
      return structuredClone(n);
    },
    async saveNote(u) {
      return patch(u.id, { title: u.title, snippet: u.snippet, tags: u.tags, content: u.content, updatedAt: now() });
    },
    setPinned: (id, pinned) => patch(id, { pinned }),
    moveNote: (id, folderId) => patch(id, { folderId }),
    deleteNote: (id) => patch(id, { deletedAt: now(), pinned: false }),
    restoreNote: (id) => patch(id, { deletedAt: null }),
    async purgeNote(id) {
      notes.delete(id);
    },
    async createFolder(name, parentId) {
      const f = { id: uid(), name, parentId };
      folders.push(f);
      return f;
    },
    async renameFolder(id, name) {
      const f = folders.find((x) => x.id === id)!;
      f.name = name;
      return { ...f };
    },
    async deleteFolder(id) {
      const doomed = new Set([id]);
      for (let grew = true; grew; ) {
        grew = false;
        for (const f of folders) if (f.parentId && doomed.has(f.parentId) && !doomed.has(f.id)) (doomed.add(f.id), (grew = true));
      }
      for (const n of notes.values()) if (doomed.has(n.folderId) && !n.deletedAt) await patch(n.id, { deletedAt: now(), pinned: false });
      for (let i = folders.length - 1; i >= 0; i--) if (doomed.has(folders[i].id)) folders.splice(i, 1);
      return this.getLibrary();
    },
    async systemFonts() {
      return ["Arial", "Calibri", "Cambria", "Candara", "Consolas", "Georgia", "Segoe UI", "Tahoma", "Times New Roman", "Verdana"];
    },
    async startScreenSnip() {
      throw desktopOnly();
    },
    async openMeasure() {
      throw desktopOnly();
    },
    async closeMeasure() {},
    screenInfo: async () => ({ rawDpi: null, scale: window.devicePixelRatio }),
    async searchNotes(query) {
      const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
      return [...notes.values()]
        .filter((n) => terms.every((t) => `${n.title} ${n.snippet} ${n.tags.join(" ")}`.toLowerCase().includes(t)))
        .map((n) => ({ id: n.id, snippet: null }));
    },
    exportLibrary: async () => {
      throw desktopOnly();
    },
    exportNotePdf: async () => {
      throw desktopOnly();
    },
    exportNoteHtml: async () => {
      throw desktopOnly();
    },
    importLibrary: async () => {
      throw desktopOnly();
    },
    driveStatus: async () => ({ configured: false, connected: false, email: null, lastBackupAt: null }),
    driveSetClient: async () => {
      throw desktopOnly();
    },
    driveConnect: async () => {
      throw desktopOnly();
    },
    driveDisconnect: async () => ({ configured: false, connected: false, email: null, lastBackupAt: null }),
    driveList: async () => [],
    driveBackup: async () => {
      throw desktopOnly();
    },
    driveRestore: async () => {
      throw desktopOnly();
    },
  };
}

const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export const api: Api = inTauri ? tauriApi : createMockApi();
