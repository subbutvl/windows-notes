export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
}

export interface NoteSummary {
  id: string;
  folderId: string;
  title: string;
  snippet: string;
  tags: string[];
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/** TipTap/ProseMirror document JSON. */
export type DocJSON = { type: string; [key: string]: unknown };

export interface Note extends NoteSummary {
  content: DocJSON;
}

export interface NoteUpdate {
  id: string;
  title: string;
  snippet: string;
  tags: string[];
  content: DocJSON;
}

export interface Library {
  folders: Folder[];
  notes: NoteSummary[];
}

export type View =
  | { kind: "all" }
  | { kind: "pinned" }
  | { kind: "deleted" }
  | { kind: "folder"; id: string }
  | { kind: "tag"; tag: string };

export interface SearchHit {
  id: string;
  /** Text around the first match in the body, or null when only the title matched. */
  snippet: string | null;
}

export interface ImportReport {
  added: number;
  updated: number;
  skipped: number;
  foldersAdded: number;
}

export interface DriveStatus {
  configured: boolean;
  connected: boolean;
  email: string | null;
  lastBackupAt: string | null;
}

export interface BackupFile {
  id: string;
  name: string;
  modifiedTime: string;
  size: string | null;
}
