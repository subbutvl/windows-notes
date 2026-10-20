import { useState } from "react";
import { CopyIcon, InsertIcon } from "../components/Icons";
import { hexToRgb, readableOn, rgbToHsl } from "../lib/color";
import { insertIntoNote, pickScreenColor, useTools } from "../lib/tools";
import { IconAction, useCanInsert, type Copy } from "./shared";

/** Picks colours from anywhere on screen with the system eyedropper. Picks stay only while the tool is open. */
export function PickerTool({ copy }: { copy: Copy }) {
  const canInsert = useCanInsert();
  const [picks, setPicks] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const pick = async () => {
    setError(null);
    try {
      const hex = await pickScreenColor();
      if (hex) setPicks((p) => [hex, ...p.filter((x) => x !== hex)].slice(0, 12));
    } catch (e) {
      setError(String(e));
    }
  };

  const current = picks[0];
  const formats = (hex: string) => {
    const rgb = hexToRgb(hex);
    const hsl = rgbToHsl(rgb);
    return [
      ["HEX", hex.toUpperCase()],
      ["RGB", `rgb(${rgb.join(", ")})`],
      ["HSL", `hsl(${hsl[0]}, ${hsl[1]}%, ${hsl[2]}%)`],
    ];
  };

  return (
    <div className="tool-body">
      <button className="text-button primary picker-button" onClick={pick}>
        Pick a Color from the Screen
      </button>
      {error && <p className="tool-hint is-error">{error}</p>}
      {current ? (
        <>
          <div className="color-hero" style={{ background: current, color: readableOn(current) }}>
            {current.toUpperCase()}
          </div>
          <div className="color-formats">
            {formats(current).map(([k, v]) => (
              <button key={k} className="color-format" title="Click to copy" onClick={() => copy(v)}>
                <span className="color-format-key">{k}</span>
                <span className="color-format-value">{v}</span>
                <CopyIcon size={14} />
              </button>
            ))}
          </div>
          <div className="picker-actions">
            <IconAction label="Insert hex into note" disabled={!canInsert} onClick={() => insertIntoNote(current.toUpperCase())}>
              <InsertIcon size={16} />
            </IconAction>
            <button className="text-button" onClick={() => useTools.setState({ color: current, tool: "color" })}>
              Open in Color Codes
            </button>
          </div>
          {picks.length > 1 && (
            <div className="picker-history" aria-label="Earlier picks">
              {picks.slice(1).map((hex) => (
                <button
                  key={hex}
                  className="picker-chip"
                  style={{ background: hex }}
                  title={`${hex.toUpperCase()} (click to copy)`}
                  onClick={() => copy(hex.toUpperCase())}
                />
              ))}
            </div>
          )}
        </>
      ) : (
        <p className="tool-hint">Click the button, then click anywhere on any screen: another app, a browser, a picture. Esc cancels.</p>
      )}
      <p className="tool-hint">Picks are kept only while this tool is open.</p>
    </div>
  );
}
