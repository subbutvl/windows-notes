import { useEffect, useMemo, useState } from "react";
import { keepFocus } from "../components/Popover";
import { GOOGLE_FONTS, fontStack, listSystemFonts, loadGoogleFont, loadGooglePreviews } from "../lib/fonts";

/** Font list for the toolbar: the app font, a few Google Fonts, then fonts on this PC. */
export function FontPicker({ current, onPick }: { current: string | null; onPick(name: string | null): void }) {
  const [query, setQuery] = useState("");
  const [system, setSystem] = useState<string[] | null>(null);

  useEffect(() => {
    loadGooglePreviews();
    let live = true;
    listSystemFonts().then((list) => live && setSystem(list));
    return () => {
      live = false;
    };
  }, []);

  const q = query.trim().toLowerCase();
  const google = useMemo(() => GOOGLE_FONTS.filter((f) => f.name.toLowerCase().includes(q)), [q]);
  const local = useMemo(() => (system ?? []).filter((f) => f.toLowerCase().includes(q)), [system, q]);

  const row = (name: string | null, label: string, note?: string) => (
    <button
      key={`${note ?? "pc"}:${label}`}
      role="menuitemradio"
      aria-checked={current === name}
      className="menu-item font-row"
      onMouseDown={keepFocus}
      onClick={() => {
        if (name && GOOGLE_FONTS.some((f) => f.name === name)) loadGoogleFont(name);
        onPick(name);
      }}
    >
      <span className="menu-check" aria-hidden="true">
        {current === name ? "✓" : null}
      </span>
      <span className="menu-label" style={name ? { fontFamily: fontStack(name) } : undefined}>
        {label}
      </span>
      {note && <kbd>{note}</kbd>}
    </button>
  );

  return (
    <div className="font-picker">
      <input
        className="font-search"
        type="search"
        placeholder="Search fonts"
        aria-label="Search fonts"
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="menu-scroll font-scroll">
        {!q && row(null, "Default", "Segoe UI")}
        {google.length > 0 && <div className="menu-heading">Google Fonts</div>}
        {google.map((f) => row(f.name, f.name, f.category))}
        <div className="menu-heading">On this PC</div>
        {system === null ? (
          <div className="menu-note">Loading…</div>
        ) : local.length ? (
          local.map((f) => row(f, f))
        ) : (
          <div className="menu-note">{q ? "No matching fonts" : "No fonts found"}</div>
        )}
      </div>
    </div>
  );
}
