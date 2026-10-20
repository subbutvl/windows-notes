import { useEffect, useRef } from "react";
import { Editor } from "./components/Editor";
import { CloseIcon } from "./components/Icons";
import { NoteList } from "./components/NoteList";
import { Sidebar } from "./components/Sidebar";
import { useNotes } from "./lib/store";
import { useTheme } from "./lib/theme";

export default function App() {
  const loaded = useNotes((s) => s.loaded);
  const error = useNotes((s) => s.error);
  const init = useNotes((s) => s.init);
  const newNote = useNotes((s) => s.newNote);
  const { choice, cycle } = useTheme();
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === "n" && !e.shiftKey) {
        e.preventDefault();
        newNote();
      } else if (key === "f") {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [newNote]);

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
        </div>
      ) : (
        !error && <div className="loading">Loading notes…</div>
      )}
    </div>
  );
}
