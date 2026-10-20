import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { CopyIcon, InsertIcon } from "../components/Icons";
import { hexToRgb, normalizeHex, readableOn, rgbToHsl, tintsAndShades } from "../lib/color";
import { SEPARATOR, openContextMenu } from "../lib/menu";
import { insertIntoNote, useTools } from "../lib/tools";
import { IconAction, useCanInsert, type Copy } from "./shared";

export function ColorTool({ copy }: { copy: Copy }) {
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

  const column = (title: string, list: { step: number; hex: string }[]) => (
    <section className="color-column" aria-label={title}>
      <h3>{title}</h3>
      {list.map((c) => (
        <button
          key={c.step}
          className="color-row"
          style={{ background: c.hex, color: readableOn(c.hex) }}
          title={`${title} ${c.step}%: ${c.hex.toUpperCase()} (click to copy)`}
          onClick={() => copy(c.hex.toUpperCase())}
          onContextMenu={(e) => swatchMenu(e, c.hex)}
        >
          <span className="color-row-step">{c.step}%</span>
          <span className="color-row-hex">{c.hex.toUpperCase()}</span>
        </button>
      ))}
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

      <div className="color-columns">
        {column("Tints", tints)}
        {column("Shades", shades)}
      </div>
      <p className="tool-hint">Tints mix in white and shades mix in black, 10% at a time. Click a row to copy its code, or right-click for more.</p>
    </div>
  );
}
