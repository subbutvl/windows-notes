import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef } from "react";
import { BackupDialog } from "./components/BackupDialog";
import { ContextMenu } from "./components/ContextMenu";
import { Editor } from "./components/Editor";
import { CloseIcon } from "./components/Icons";
import { NoteList } from "./components/NoteList";
import { ShortcutsDialog } from "./components/ShortcutsDialog";
import { Sidebar } from "./components/Sidebar";
import { ToolsPanel } from "./components/ToolsPanel";
import { copySelection, pasteIntoInput } from "./lib/clipboard";
import { SEPARATOR, useMenu } from "./lib/menu";
import { KEYS } from "./lib/shortcuts";
import { useNotes } from "./lib/store";
import { useTheme } from "./lib/theme";
import { useTools, watchClipboard } from "./lib/tools";

const inTauri = "__TAURI_INTERNALS__" in window;

type TextField = HTMLInputElement | HTMLTextAreaElement;

const isTextField = (t: EventTarget | null): t is TextField =>
  t instanceof HTMLTextAreaElement || (t instanceof HTMLInputElement && ["text", "search", "url", ""].includes(t.type));

/** Cut/Copy/Paste for plain inputs such as search and folder names. */
function openFieldMenu(e: MouseEvent, field: TextField) {
  const hasSelection = field.selectionStart !== field.selectionEnd;
  useMenu.getState().open(e.clientX, e.clientY, [
    { label: "Cut", shortcut: KEYS.cut, disabled: !hasSelection || field.readOnly, onSelect: () => (field.focus(), copySelection(true)) },
    { label: "Copy", shortcut: KEYS.copy, disabled: !hasSelection, onSelect: () => (field.focus(), copySelection()) },
    { label: "Paste", shortcut: KEYS.paste, disabled: field.readOnly, onSelect: () => pasteIntoInput(field) },
    SEPARATOR,
    { label: "Select All", shortcut: KEYS.selectAll, onSelect: () => (field.focus(), field.select()) },
  ]);
}

/** Browser keys that make no sense in a desktop app (reload, print, find bar). */
function isBrowserKey(e: KeyboardEvent) {
  const key = e.key.toLowerCase();
  if (e.key === "F5" || e.key === "F3" || e.key === "F7") return true;
  if (!e.ctrlKey) return false;
  return key === "r" || key === "p" || key === "g" || key === "s" || key === "o" || key === "w";
}

export default function App() {
  const loaded = useNotes((s) => s.loaded);
  const error = useNotes((s) => s.error);
  const showShortcuts = useNotes((s) => s.showShortcuts);
  const showBackup = useNotes((s) => s.showBackup);
  const toolsOpen = useTools((s) => s.open);
  const init = useNotes((s) => s.init);
  const { choice, cycle } = useTheme();
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    init();
  }, [init]);

  // The clipboard history fills in the background, kept in memory only.
  useEffect(() => watchClipboard(), []);

  // "New Note" from the notification-area icon.
  useEffect(() => {
    if (!inTauri) return;
    const off = listen("tray-new-note", () => useNotes.getState().newNote());
    return () => {
      off.then((f) => f());
    };
  }, []);

  // Replace the WebView's own right-click menu everywhere. Components that
  // have a menu of their own open it first and stop the event.
  useEffect(() => {
    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      if (isTextField(e.target)) openFieldMenu(e, e.target);
    };
    window.addEventListener("contextmenu", onContextMenu);
    return () => window.removeEventListener("contextmenu", onContextMenu);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // The editor handles its own formatting keys first and marks them handled.
      if (e.defaultPrevented) return;
      const s = useNotes.getState();
      const key = e.key.toLowerCase();
      const ctrl = e.ctrlKey && !e.altKey;

      if (ctrl && !e.shiftKey && key === "n") s.newNote();
      else if (ctrl && e.shiftKey && key === "n") useNotes.setState({ folderDraft: { parentId: null } });
      else if (ctrl && !e.shiftKey && key === "f") {
        searchRef.current?.focus();
        searchRef.current?.select();
      } else if (ctrl && e.shiftKey && key === "p") {
        if (s.selectedId && !s.notes[s.selectedId]?.deletedAt) s.togglePin(s.selectedId);
      } else if (ctrl && e.shiftKey && key === "d") cycle();
      else if (ctrl && (key === "/" || e.code === "Slash")) useNotes.setState({ showShortcuts: !s.showShortcuts });
      else if (!isBrowserKey(e)) return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cycle]);

  return (
    <div className="app">
      {error && (
        <div className="error-bar" role="alert">
          <span>{error}</span>
          <button className="icon-button" aria-label="Dismiss" onClick={() => useNotes.setState({ error: null })}>
            <CloseIcon size={16} />
          </button>
        </div>
      )}
      {loaded ? (
        <div className="panes">
          <Sidebar theme={choice} onCycleTheme={cycle} />
          <NoteList ref={searchRef} />
          <Editor />
          {toolsOpen && <ToolsPanel />}
        </div>
      ) : (
        !error && <div className="loading">Loading notes…</div>
      )}
      <ContextMenu />
      {showShortcuts && <ShortcutsDialog />}
      {showBackup && <BackupDialog />}
    </div>
  );
}
