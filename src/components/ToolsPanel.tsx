import { Suspense } from "react";
import { KEYS } from "../lib/shortcuts";
import { useTools } from "../lib/tools";
import { TOOLS, openToolsMenu } from "../tools/registry";
import { useCopy } from "../tools/shared";
import { ChevronDownIcon, CloseIcon } from "./Icons";

/** Shows the one quick tool that is open. Only that tool is mounted. */
export function ToolsPanel() {
  const id = useTools((s) => s.tool);
  const { copied, copy } = useCopy();
  const tool = TOOLS.find((t) => t.id === id) ?? TOOLS[0];

  return (
    <aside className={`tools-panel${tool.wide ? " is-wide" : ""}`} aria-label={tool.label}>
      <div className="tools-header">
        <button className="tools-switch" title="Switch tool" aria-haspopup="menu" onClick={(e) => openToolsMenu(e.currentTarget, "below")}>
          {tool.icon}
          <span>{tool.label}</span>
          <ChevronDownIcon size={14} />
        </button>
        <button className="icon-button" aria-label={`Close (${KEYS.tools})`} title={`Close (${KEYS.tools})`} onClick={() => useTools.setState({ open: false })}>
          <CloseIcon size={16} />
        </button>
      </div>
      <div className="tools-scroll" key={tool.id}>
        <Suspense fallback={<p className="tool-empty">Loading…</p>}>{tool.render(copy)}</Suspense>
      </div>
      <div className={`tools-toast${copied ? " is-visible" : ""}`} role="status">
        {copied ? (copied.length > 24 ? "Copied" : `Copied ${copied}`) : ""}
      </div>
    </aside>
  );
}
