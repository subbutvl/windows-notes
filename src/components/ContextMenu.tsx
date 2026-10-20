import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { cleanItems, useMenu, type MenuItem } from "../lib/menu";

const EDGE = 8;

function focusables(panel: HTMLElement | null) {
  return panel ? [...panel.querySelectorAll<HTMLButtonElement>(":scope > .menu-entry > button:not(:disabled)")] : [];
}

function moveFocus(panel: HTMLElement | null, delta: 1 | -1) {
  const items = focusables(panel);
  if (!items.length) return;
  const at = items.indexOf(document.activeElement as HTMLButtonElement);
  items[(at + delta + items.length) % items.length].focus();
}

function Panel({ items, x, y, flipX, onDone, onBack }: { items: MenuItem[]; x: number; y: number; flipX?: number; onDone(): void; onBack?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });
  const [openSub, setOpenSub] = useState<number | null>(null);

  // Keep the panel on screen; a submenu flips to the left when needed.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let left = x;
    let top = y;
    // A submenu that would run off the right edge opens to the left of its parent instead.
    if (left + r.width > window.innerWidth - EDGE) left = flipX !== undefined ? flipX - r.width : window.innerWidth - r.width - EDGE;
    if (top + r.height > window.innerHeight - EDGE) top = Math.max(EDGE, window.innerHeight - r.height - EDGE);
    setPos({ left: Math.max(EDGE, left), top });
  }, [x, y, flipX]);

  useEffect(() => {
    focusables(ref.current)[0]?.focus();
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target instanceof HTMLElement && e.target.closest(".context-menu") !== ref.current) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      moveFocus(ref.current, e.key === "ArrowDown" ? 1 : -1);
    } else if (e.key === "ArrowRight") {
      const idx = Number((document.activeElement as HTMLElement)?.dataset.index);
      const item = items[idx];
      if (item && !("separator" in item) && item.submenu) {
        e.preventDefault();
        setOpenSub(idx);
      }
    } else if (e.key === "ArrowLeft" && onBack) {
      e.preventDefault();
      e.stopPropagation();
      onBack();
    }
  };

  return (
    <div ref={ref} className="context-menu" role="menu" style={pos} onKeyDown={onKeyDown}>
      {items.map((item, i) => {
        if ("separator" in item) return <div key={i} className="menu-separator" role="separator" />;
        const sub = item.submenu ? cleanItems(item.submenu) : null;
        return (
          <div key={i} className="menu-entry" onMouseEnter={() => setOpenSub(sub ? i : null)}>
            <button
              role="menuitem"
              data-index={i}
              aria-haspopup={sub ? "menu" : undefined}
              aria-expanded={sub ? openSub === i : undefined}
              className={`menu-item${item.danger ? " danger" : ""}${openSub === i ? " is-open" : ""}`}
              disabled={item.disabled}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                if (sub) return setOpenSub(i);
                onDone();
                item.onSelect?.();
              }}
            >
              <span className="menu-check" aria-hidden="true">
                {item.checked ? "✓" : item.swatch ? <span className="menu-swatch" style={{ background: item.swatch }} /> : null}
              </span>
              <span className="menu-label">{item.label}</span>
              {item.shortcut && <kbd>{item.shortcut}</kbd>}
              {sub && <span className="menu-arrow" aria-hidden="true">›</span>}
            </button>
            {sub && openSub === i && <SubPanel items={sub} anchorIndex={i} parent={ref} onDone={onDone} onBack={() => setOpenSub(null)} />}
          </div>
        );
      })}
    </div>
  );
}

function SubPanel({ items, anchorIndex, parent, onDone, onBack }: { items: MenuItem[]; anchorIndex: number; parent: RefObject<HTMLDivElement>; onDone(): void; onBack(): void }) {
  const anchor = parent.current?.querySelector<HTMLElement>(`[data-index="${anchorIndex}"]`);
  const r = anchor?.getBoundingClientRect();
  const panelRect = parent.current?.getBoundingClientRect();
  if (!r || !panelRect) return null;
  const back = () => {
    onBack();
    anchor?.focus();
  };
  return <Panel items={items} x={panelRect.right - 4} y={r.top - 5} flipX={panelRect.left + 4} onDone={onDone} onBack={back} key={anchorIndex} />;
}

/** The app's single right-click menu; opened through `openContextMenu`. */
export function ContextMenu() {
  const menu = useMenu((s) => s.menu);
  const close = useMenu((s) => s.close);
  const restoreFocus = useRef<Element | null>(null);

  useEffect(() => {
    if (!menu) return;
    restoreFocus.current = document.activeElement;
    const onDown = (e: MouseEvent) => {
      if (!(e.target instanceof Element) || !e.target.closest(".context-menu")) close();
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        (restoreFocus.current as HTMLElement | null)?.focus?.();
      }
    };
    window.addEventListener("mousedown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("blur", close);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("blur", close);
      window.removeEventListener("resize", close);
    };
  }, [menu, close]);

  if (!menu) return null;
  return <Panel key={`${menu.x},${menu.y}`} items={menu.items} x={menu.x} y={menu.y} onDone={close} />;
}
