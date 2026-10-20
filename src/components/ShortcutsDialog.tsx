import { useEffect, useRef } from "react";
import { SHORTCUT_GROUPS } from "../lib/shortcuts";
import { useNotes } from "../lib/store";
import { CloseIcon } from "./Icons";

export function ShortcutsDialog() {
  const close = () => useNotes.setState({ showShortcuts: false });
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const restore = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      restore?.focus?.();
    };
  }, []);

  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="dialog shortcuts" role="dialog" aria-modal="true" aria-labelledby="shortcuts-title" tabIndex={-1} ref={ref}>
        <div className="dialog-header">
          <h2 id="shortcuts-title">Keyboard Shortcuts</h2>
          <button className="icon-button" aria-label="Close" onClick={close}>
            <CloseIcon size={16} />
          </button>
        </div>
        <div className="shortcut-columns">
          {SHORTCUT_GROUPS.map((g) => (
            <section key={g.title}>
              <h3>{g.title}</h3>
              <dl>
                {g.items.map(([label, keys]) => (
                  <div key={label} className="shortcut-row">
                    <dt>{label}</dt>
                    <dd>
                      <kbd>{keys}</kbd>
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
