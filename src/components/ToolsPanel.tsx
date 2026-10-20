import { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { evaluate, formatNumber } from "../lib/calc";
import { hexToRgb, normalizeHex, readableOn, rgbToHsl, tintsAndShades } from "../lib/color";
import { SEPARATOR, openContextMenu } from "../lib/menu";
import { useNotes } from "../lib/store";
import { KEYS } from "../lib/shortcuts";
import { MAX_CLIPS, copyText, insertIntoNote, useTools, type ToolTab } from "../lib/tools";
import { CalculatorIcon, ClipboardIcon, CloseIcon, CopyIcon, InsertIcon, PaletteIcon, PauseIcon, PlayIcon, TrashIcon } from "./Icons";

const TABS: { id: ToolTab; label: string; icon: ReactNode }[] = [
  { id: "calculator", label: "Calculator", icon: <CalculatorIcon size={16} /> },
  { id: "color", label: "Color", icon: <PaletteIcon size={16} /> },
  { id: "clipboard", label: "Clipboard", icon: <ClipboardIcon size={16} /> },
];

/** True when a note is open and can take inserted text. */
function useCanInsert() {
  return useNotes((s) => !!s.selectedId && !s.notes[s.selectedId]?.deletedAt);
}

/** Copies text and briefly says so at the bottom of the panel. */
function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  const timer = useRef<number>();
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const copy = (text: string, what = text) => {
    copyText(text);
    setCopied(what);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(null), 1400);
  };
  return { copied, copy };
}

type Copy = (text: string, what?: string) => void;

function IconAction({ label, onClick, disabled, children }: { label: string; onClick(): void; disabled?: boolean; children: ReactNode }) {
  return (
    <button className="tool-button small" aria-label={label} title={label} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}

const KEYPAD = ["C", "⌫", "%", "÷", "7", "8", "9", "×", "4", "5", "6", "−", "1", "2", "3", "+", "(", "0", ".", ")", "√", "^", "π", "="];
const OPERATORS = new Set(["÷", "×", "−", "+", "^", "%"]);

function Calculator({ copy }: { copy: Copy }) {
  const history = useTools((s) => s.calcHistory);
  const canInsert = useCanInsert();
  const [expr, setExpr] = useState("");
  const input = useRef<HTMLInputElement>(null);

  const preview = useMemo(() => {
    try {
      return formatNumber(evaluate(expr));
    } catch {
      return null;
    }
  }, [expr]);

  const commit = () => {
    if (preview === null) return;
    useTools.setState((s) => ({ calcHistory: [{ expr, result: preview }, ...s.calcHistory].slice(0, 30) }));
    setExpr(preview);
  };

  const press = (key: string) => {
    if (key === "C") setExpr("");
    else if (key === "⌫") setExpr((e) => e.slice(0, -1));
    else if (key === "=") commit();
    else if (key === "√") setExpr((e) => `${e}√(`);
    else setExpr((e) => e + (OPERATORS.has(key) ? ` ${key} ` : key));
    input.current?.focus();
  };

  return (
    <div className="tool-body">
      <div className="calc-display">
        <input
          ref={input}
          className="calc-input"
          aria-label="Expression"
          placeholder="0"
          value={expr}
          autoFocus
          spellCheck={false}
          onChange={(e) => setExpr(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "=") {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape" && expr) {
              e.stopPropagation();
              setExpr("");
            }
          }}
        />
        <div className={`calc-result${preview === null && expr ? " is-error" : ""}`} aria-live="polite">
          {expr ? (preview ?? "…") : " "}
        </div>
        <div className="tool-actions">
          <IconAction label="Copy result" disabled={preview === null} onClick={() => preview !== null && copy(preview)}>
            <CopyIcon size={16} />
          </IconAction>
          <IconAction label="Insert result into note" disabled={preview === null || !canInsert} onClick={() => preview !== null && insertIntoNote(preview)}>
            <InsertIcon size={16} />
          </IconAction>
        </div>
      </div>

      <div className="calc-keypad">
        {KEYPAD.map((k) => (
          <button
            key={k}
            className={`calc-key${OPERATORS.has(k) ? " is-op" : ""}${k === "=" ? " is-equals" : ""}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => press(k)}
          >
            {k}
          </button>
        ))}
      </div>

      {history.length > 0 && (
        <section className="tool-section">
          <div className="tool-section-head">
            <h3>History</h3>
            <button className="link-button" onClick={() => useTools.setState({ calcHistory: [] })}>
              Clear
            </button>
          </div>
          <ul className="calc-history">
            {history.map((h, i) => (
              <li key={i}>
                <button
                  className="calc-history-row"
                  title="Use this result"
                  onClick={() => setExpr(h.result)}
                  onContextMenu={(e) =>
                    openContextMenu(e, [
                      { label: "Copy Result", onSelect: () => copy(h.result) },
                      { label: "Copy Calculation", onSelect: () => copy(`${h.expr} = ${h.result}`) },
                      { label: "Insert into Note", disabled: !canInsert, onSelect: () => insertIntoNote(`${h.expr} = ${h.result}`) },
                    ])
                  }
                >
                  <span className="calc-history-expr">{h.expr} =</span>
                  <span className="calc-history-result">{h.result}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function ColorTool({ copy }: { copy: Copy }) {
  const color = useTools((s) => s.color);
  const canInsert = useCanInsert();
  const [text, setText] = useState(color);
  // Follow colour changes made elsewhere (native picker, "Use as Base Color").
  useEffect(() => setText((t) => (normalizeHex(t) === color ? t : color)), [color]);

  const setColor = (hex: string) => useTools.setState({ color: hex });
  const rgb = hexToRgb(color);
  const hsl = rgbToHsl(rgb);
  const formats = [
    ["HEX", color.toUpperCase()],
    ["RGB", `rgb(${rgb.join(", ")})`],
    ["HSL", `hsl(${hsl[0]}, ${hsl[1]}%, ${hsl[2]}%)`],
  ];
  const { tints, shades } = useMemo(() => tintsAndShades(color), [color]);

  const swatchMenu = (e: MouseEvent, hex: string) =>
    openContextMenu(e, [
      { label: "Copy", onSelect: () => copy(hex.toUpperCase()) },
      { label: "Insert into Note", disabled: !canInsert, onSelect: () => insertIntoNote(hex.toUpperCase()) },
      SEPARATOR,
      { label: "Use as Base Color", onSelect: () => setColor(hex) },
    ]);

  const strip = (title: string, list: { step: number; hex: string }[]) => (
    <section className="tool-section">
      <div className="tool-section-head">
        <h3>{title}</h3>
      </div>
      <div className="color-strip">
        {list.map((c) => (
          <button
            key={c.step}
            className="color-chip"
            style={{ background: c.hex, color: readableOn(c.hex) }}
            title={`${c.step}% · ${c.hex.toUpperCase()} (click to copy)`}
            onClick={() => copy(c.hex.toUpperCase())}
            onContextMenu={(e) => swatchMenu(e, c.hex)}
          >
            <span>{c.step}</span>
            <span>{c.hex.slice(1).toUpperCase()}</span>
          </button>
        ))}
      </div>
    </section>
  );

  return (
    <div className="tool-body">
      <div className="color-hero" style={{ background: color, color: readableOn(color) }} onContextMenu={(e) => swatchMenu(e, color)}>
        {color.toUpperCase()}
      </div>
      <div className="color-input-row">
        <input
          className="tool-input"
          aria-label="Hex color"
          value={text}
          spellCheck={false}
          maxLength={7}
          onChange={(e) => {
            setText(e.target.value);
            // Short "#abc" codes apply on Enter or blur, so typing "1e9…" doesn't jump early.
            const hex = /^#?[0-9a-f]{6}$/i.test(e.target.value.trim()) ? normalizeHex(e.target.value) : null;
            if (hex) setColor(hex);
          }}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          onBlur={() => {
            const hex = normalizeHex(text);
            if (hex) setColor(hex);
            else setText(color);
          }}
        />
        <input type="color" className="color-native" aria-label="Pick a color" value={color} onChange={(e) => setColor(e.target.value)} />
        <IconAction label="Insert hex into note" disabled={!canInsert} onClick={() => insertIntoNote(color.toUpperCase())}>
          <InsertIcon size={16} />
        </IconAction>
      </div>
      {/[^#0-9a-f\s]/i.test(text) && <p className="tool-hint is-error">Type a hex code like #1E90FF or 1e90ff.</p>}

      <div className="color-formats">
        {formats.map(([k, v]) => (
          <button key={k} className="color-format" title="Click to copy" onClick={() => copy(v)}>
            <span className="color-format-key">{k}</span>
            <span className="color-format-value">{v}</span>
            <CopyIcon size={14} />
          </button>
        ))}
      </div>

      {strip("Tints (mixed with white)", tints)}
      {strip("Shades (mixed with black)", shades)}
    </div>
  );
}

const timeAgo = (at: number) => {
  const s = Math.round((Date.now() - at) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  return new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
};

function ClipboardTool({ copy }: { copy: Copy }) {
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

export function ToolsPanel() {
  const tab = useTools((s) => s.tab);
  const { copied, copy } = useCopy();

  return (
    <aside className="tools-panel" aria-label="Quick tools">
      <div className="tools-header">
        <div className="tools-tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              className={`tools-tab${tab === t.id ? " is-active" : ""}`}
              onClick={() => useTools.setState({ tab: t.id })}
            >
              {t.icon}
              <span>{t.label}</span>
            </button>
          ))}
        </div>
        <button className="icon-button" aria-label={`Close tools (${KEYS.tools})`} title={`Close tools (${KEYS.tools})`} onClick={() => useTools.setState({ open: false })}>
          <CloseIcon size={16} />
        </button>
      </div>
      <div className="tools-scroll">
        {tab === "calculator" && <Calculator copy={copy} />}
        {tab === "color" && <ColorTool copy={copy} />}
        {tab === "clipboard" && <ClipboardTool copy={copy} />}
      </div>
      <div className={`tools-toast${copied ? " is-visible" : ""}`} role="status">
        {copied ? (copied.length > 24 ? "Copied" : `Copied ${copied}`) : ""}
      </div>
    </aside>
  );
}
