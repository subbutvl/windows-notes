import { useEffect, useState } from "react";
import { InsertIcon, PauseIcon, PlayIcon, TrashIcon } from "../components/Icons";
import { SEPARATOR, openContextMenu } from "../lib/menu";
import { KEYS } from "../lib/shortcuts";
import { MAX_CLIPS, insertIntoNote, useTools } from "../lib/tools";
import { IconAction, useCanInsert, type Copy } from "./shared";

const timeAgo = (at: number) => {
  const s = Math.round((Date.now() - at) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  return new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
};

export function ClipboardTool({ copy }: { copy: Copy }) {
  const clips = useTools((s) => s.clips);
  const paused = useTools((s) => s.clipsPaused);
  const canInsert = useCanInsert();
  const remove = (id: number) => useTools.setState((s) => ({ clips: s.clips.filter((c) => c.id !== id) }));

  // Refresh the "x min ago" labels while the list is on screen.
  const [, tick] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => tick((n) => n + 1), 30_000);
    return () => window.clearInterval(t);
  }, []);

  return (
    <div className="tool-body">
      <div className="clip-bar">
        <span>
          {clips.length} of {MAX_CLIPS}
        </span>
        <button className="text-button" onClick={() => useTools.setState({ clipsPaused: !paused })}>
          {paused ? <PlayIcon size={14} /> : <PauseIcon size={14} />}
          {paused ? "Resume" : "Pause"}
        </button>
        <button className="text-button" disabled={!clips.length} onClick={() => useTools.setState({ clips: [] })}>
          Clear All
        </button>
      </div>
      <p className="tool-hint">Text you copy anywhere shows up here. It is kept in memory only and cleared when you quit.</p>

      {clips.length === 0 ? (
        <p className="tool-empty">{paused ? "Paused" : "Copy some text to see it here"}</p>
      ) : (
        <ul className="clip-list">
          {clips.map((c) => (
            <li key={c.id} className="clip-item">
              <button
                className="clip-text"
                title="Click to copy"
                onClick={() => copy(c.text, "Clip")}
                onContextMenu={(e) =>
                  openContextMenu(e, [
                    { label: "Copy", shortcut: KEYS.copy, onSelect: () => copy(c.text, "Clip") },
                    { label: "Insert into Note", disabled: !canInsert, onSelect: () => insertIntoNote(c.text) },
                    SEPARATOR,
                    { label: "Delete", danger: true, onSelect: () => remove(c.id) },
                  ])
                }
              >
                {c.text}
              </button>
              <div className="clip-meta">
                <span>{timeAgo(c.at)}</span>
                <IconAction label="Insert into note" disabled={!canInsert} onClick={() => insertIntoNote(c.text)}>
                  <InsertIcon size={14} />
                </IconAction>
                <IconAction label="Delete" onClick={() => remove(c.id)}>
                  <TrashIcon size={14} />
                </IconAction>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
