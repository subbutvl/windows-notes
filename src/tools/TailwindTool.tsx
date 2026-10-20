import { useState, type MouseEvent } from "react";
import { CopyIcon, InsertIcon } from "../components/Icons";
import { hexToRgb, readableOn, rgbToHsl } from "../lib/color";
import { SEPARATOR, openContextMenu } from "../lib/menu";
import { TAILWIND_COLORS, TAILWIND_SHADES } from "../lib/tailwind";
import { insertIntoNote } from "../lib/tools";
import { IconAction, useCanInsert, type Copy } from "./shared";

const FAMILIES = Object.keys(TAILWIND_COLORS);

type Pick = { name: string; hex: string; oklch: string };

function formatsOf(p: Pick) {
  const rgb = hexToRgb(p.hex);
  const hsl = rgbToHsl(rgb);
  return [
    ["Class", p.name],
    ["HEX", p.hex.toUpperCase()],
    ["OKLCH", p.oklch],
    ["RGB", `rgb(${rgb.join(", ")})`],
    ["HSL", `hsl(${hsl[0]}, ${hsl[1]}%, ${hsl[2]}%)`],
  ];
}

/** The Tailwind CSS v4 palette (tailwindcolor.com), built in so it works offline. */
export function TailwindTool({ copy }: { copy: Copy }) {
  const canInsert = useCanInsert();
  const [filter, setFilter] = useState("");
  const [picked, setPicked] = useState<Pick>({ name: "blue-500", hex: TAILWIND_COLORS.blue[5][0], oklch: TAILWIND_COLORS.blue[5][1] });

  const q = filter.trim().toLowerCase();
  const families = FAMILIES.filter((f) => f.includes(q));

  const swatchMenu = (e: MouseEvent, p: Pick) =>
    openContextMenu(e, [
      ...formatsOf(p).map(([k, v]) => ({ label: `Copy ${k}  ${v}`, onSelect: () => copy(v) })),
      SEPARATOR,
      { label: "Insert Hex into Note", disabled: !canInsert, onSelect: () => insertIntoNote(p.hex.toUpperCase()) },
    ]);

  return (
    <div className="tool-body">
      <div className="color-hero" style={{ background: picked.hex, color: readableOn(picked.hex) }} onContextMenu={(e) => swatchMenu(e, picked)}>
        {picked.name}
      </div>
      <div className="color-formats">
        {formatsOf(picked).map(([k, v]) => (
          <button key={k} className="color-format" title="Click to copy" onClick={() => copy(v)}>
            <span className="color-format-key">{k}</span>
            <span className="color-format-value">{v}</span>
            <CopyIcon size={14} />
          </button>
        ))}
      </div>
      <div className="color-input-row">
        <input className="tool-input" placeholder="Filter colors, e.g. blue" aria-label="Filter colors" value={filter} spellCheck={false} onChange={(e) => setFilter(e.target.value)} />
        <IconAction label="Insert hex into note" disabled={!canInsert} onClick={() => insertIntoNote(picked.hex.toUpperCase())}>
          <InsertIcon size={16} />
        </IconAction>
      </div>

      <div className="tw-grid" role="grid" aria-label="Tailwind colors">
        <div className="tw-row tw-head" role="row">
          <span />
          {TAILWIND_SHADES.map((s) => (
            <span key={s} role="columnheader">
              {s}
            </span>
          ))}
        </div>
        {families.map((f) => (
          <div key={f} className="tw-row" role="row">
            <span className="tw-name">{f}</span>
            {TAILWIND_COLORS[f].map(([hex, oklch], i) => {
              const p = { name: `${f}-${TAILWIND_SHADES[i]}`, hex, oklch };
              return (
                <button
                  key={i}
                  role="gridcell"
                  className={`tw-swatch${picked.name === p.name ? " is-picked" : ""}`}
                  style={{ background: hex }}
                  aria-label={`${p.name} ${hex}`}
                  title={`${p.name}  ${hex.toUpperCase()}`}
                  onClick={() => setPicked(p)}
                  onDoubleClick={() => copy(hex.toUpperCase())}
                  onContextMenu={(e) => swatchMenu(e, p)}
                />
              );
            })}
          </div>
        ))}
        {families.length === 0 && <p className="tool-hint">No Tailwind color is called "{filter}".</p>}
      </div>
      <p className="tool-hint">Tailwind CSS v4 colors. Click a swatch to see its codes, double-click to copy its hex, or right-click for every format.</p>
    </div>
  );
}
