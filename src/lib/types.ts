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
