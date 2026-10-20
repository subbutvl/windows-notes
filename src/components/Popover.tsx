import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDownIcon } from "./Icons";

/**
 * A toolbar button with a drop-down panel. Buttons inside the panel should
 * use `keepFocus` so clicking them doesn't pull focus out of the editor.
 */
export function Popover({
  label,
  title,
  button,
  active,
  wide,
  children,
}: {
  label: string;
  title?: string;
  button: ReactNode;
  active?: boolean;
  wide?: boolean;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", onDown, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="pop-wrap" ref={ref}>
      <button
        className={`tool-button with-caret${wide ? " wide" : ""}${active ? " is-active" : ""}`}
        aria-label={label}
        title={title ?? label}
        aria-haspopup="true"
        aria-expanded={open}
        onMouseDown={keepFocus}
        onClick={() => setOpen((o) => !o)}
      >
        {button}
        <ChevronDownIcon size={12} />
      </button>
      {open && (
        <div className="pop-panel" role="menu">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

/** Stop a toolbar click from moving focus (and the selection) out of the editor. */
export const keepFocus = (e: { preventDefault(): void }) => e.preventDefault();
