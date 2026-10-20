import { useState } from "react";
import { api } from "../lib/api";

/** Opens the full-screen measure overlay. The overlay is its own window, made only while measuring. */
export function MeasureTool() {
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="tool-body">
      <button className="text-button primary picker-button" onClick={() => api.openMeasure().then(() => setError(null), (e) => setError(String(e)))}>
        Measure the Screen
      </button>
      {error && <p className="tool-hint is-error">{error}</p>}
      <ul className="tool-list">
        <li>Drag anywhere to draw a measuring line; its length shows on it. Hold Shift to keep it straight.</li>
        <li>Ruler shows rulers along the edges and a crosshair with the pointer position. Grid covers the screen at the spacing you pick.</li>
        <li>Switch between pixels, centimetres and inches, and pick the line and grid colors on the overlay's bar.</li>
        <li>Backspace removes the last line, C clears them all, G and R toggle grid and ruler, Esc closes.</li>
      </ul>
      <p className="tool-hint">Pixels are real screen pixels. Centimetres and inches use the size your monitor reports, so check one against a real ruler before relying on it.</p>
    </div>
  );
}
