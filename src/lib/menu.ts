import { create } from "zustand";

export type MenuItem =
  | {
      label: string;
      shortcut?: string;
      onSelect?: () => void;
      disabled?: boolean;
      checked?: boolean;
      danger?: boolean;
      /** A colour dot shown before the label. */
      swatch?: string;
      submenu?: MenuEntry[];
    }
  | { separator: true };

export type MenuEntry = MenuItem | false | null | undefined;

interface MenuState {
  menu: { x: number; y: number; items: MenuItem[] } | null;
  open(x: number, y: number, items: MenuEntry[]): void;
  close(): void;
}

/** Drops falsy entries and stray separators so callers can build menus with `cond && item`. */
export function cleanItems(entries: MenuEntry[]): MenuItem[] {
  const out: MenuItem[] = [];
  for (const e of entries) {
    if (!e) continue;
    if ("separator" in e && (out.length === 0 || "separator" in out[out.length - 1])) continue;
    out.push(e);
  }
  while (out.length && "separator" in out[out.length - 1]) out.pop();
  return out;
}

export const SEPARATOR: MenuItem = { separator: true };

export const useMenu = create<MenuState>((set) => ({
  menu: null,
  open: (x, y, items) => {
    const clean = cleanItems(items);
    set({ menu: clean.length ? { x, y, items: clean } : null });
  },
  close: () => set({ menu: null }),
}));

/** Open a context menu at the pointer, replacing the browser's own. */
export function openContextMenu(e: { preventDefault(): void; stopPropagation(): void; clientX: number; clientY: number }, items: MenuEntry[]) {
  e.preventDefault();
  e.stopPropagation();
  useMenu.getState().open(e.clientX, e.clientY, items);
}
