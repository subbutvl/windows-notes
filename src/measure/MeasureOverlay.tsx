import { useEffect, useRef, useState, type PointerEvent } from "react";
import { api } from "../lib/api";
import type { ScreenInfo } from "../lib/types";

type Unit = "px" | "cm" | "in";
type Pt = { x: number; y: number };
type Line = { a: Pt; b: Pt };

const UNITS: Unit[] = ["px", "cm", "in"];
const DEFAULT_SPACING: Record<Unit, number> = { px: 50, cm: 1, in: 0.5 };
/** Ruler ticks: smallest step in the unit, and how many steps make a mid and a labelled tick. */
const TICKS: Record<Unit, { step: number; mid: number; major: number }> = {
  px: { step: 10, mid: 5, major: 10 },
  cm: { step: 0.1, mid: 5, major: 10 },
  in: { step: 0.125, mid: 4, major: 8 },
};
const RULER = 26;
const close = () => void api.closeMeasure();

/**
 * Full-screen measuring overlay, in its own transparent window. Lines, rulers
 * and grid are drawn on one canvas; nothing is kept once it closes.
 */
export function MeasureOverlay() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [info, setInfo] = useState<ScreenInfo>({ rawDpi: null, scale: window.devicePixelRatio });
  const [unit, setUnit] = useState<Unit>("px");
  const [ruler, setRuler] = useState(true);
  const [grid, setGrid] = useState(false);
  const [spacing, setSpacing] = useState(DEFAULT_SPACING.px);
  const [lineColor, setLineColor] = useState("#ff3b30");
  const [gridColor, setGridColor] = useState("#0a84ff");
  const [lines, setLines] = useState<Line[]>([]);
  const [barTop, setBarTop] = useState(false);
  // Pointer state changes on every mouse move, so it lives in refs and only triggers a redraw.
  const drag = useRef<Line | null>(null);
  const mouse = useRef<Pt | null>(null);
  const frame = useRef(0);

  useEffect(() => {
    api.screenInfo().then(setInfo, () => {});
  }, []);

  const dpr = window.devicePixelRatio;
  const physPerInch = info.rawDpi ?? 96 * info.scale;
  /** CSS pixels → the chosen unit. Pixels are real screen pixels, not scaled ones. */
  const toUnit = (css: number) => (unit === "px" ? css * dpr : ((css * dpr) / physPerInch) * (unit === "cm" ? 2.54 : 1));
  const fromUnit = (v: number) => (unit === "px" ? v / dpr : ((unit === "cm" ? v / 2.54 : v) * physPerInch) / dpr);
  const fmt = (v: number) => (unit === "px" ? `${Math.round(v)} px` : `${v.toFixed(2)} ${unit}`);

  const draw = () => {
    const c = canvas.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }
    const crisp = (v: number) => Math.round(v * dpr) / dpr + 0.5 / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    // A faint tint, so the overlay is visible and every pixel takes the mouse.
    ctx.fillStyle = "rgba(0, 0, 0, 0.06)";
    ctx.fillRect(0, 0, w, h);

    if (grid) {
      const step = fromUnit(spacing);
      if (step >= 4) {
        ctx.beginPath();
        for (let x = step; x < w; x += step) (ctx.moveTo(crisp(x), 0), ctx.lineTo(crisp(x), h));
        for (let y = step; y < h; y += step) (ctx.moveTo(0, crisp(y)), ctx.lineTo(w, crisp(y)));
        ctx.strokeStyle = gridColor;
        ctx.globalAlpha = 0.55;
        ctx.lineWidth = 1 / dpr;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    if (ruler) drawRulers(ctx, w, h, crisp);

    for (const l of drag.current ? [...lines, drag.current] : lines) drawLine(ctx, l);

    const m = mouse.current;
    if (m && ruler && !drag.current) {
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(crisp(m.x), RULER);
      ctx.lineTo(crisp(m.x), h);
      ctx.moveTo(RULER, crisp(m.y));
      ctx.lineTo(w, crisp(m.y));
      ctx.stroke();
      ctx.setLineDash([]);
      label(ctx, `${fmtShort(toUnit(m.x))}, ${fmtShort(toUnit(m.y))} ${unit}`, m.x + 14, m.y + 22);
    }
  };

  const fmtShort = (v: number) => (unit === "px" ? String(Math.round(v)) : v.toFixed(2));

  const drawRulers = (ctx: CanvasRenderingContext2D, w: number, h: number, crisp: (v: number) => number) => {
    const t = TICKS[unit];
    ctx.fillStyle = "rgba(250, 250, 250, 0.92)";
    ctx.fillRect(0, 0, w, RULER);
    ctx.fillRect(0, RULER, RULER, h - RULER);
    ctx.strokeStyle = "#1d1d1f";
    ctx.fillStyle = "#1d1d1f";
    ctx.lineWidth = 1 / dpr;
    ctx.font = "10px 'Segoe UI', sans-serif";
    const gap = fromUnit(t.step);
    // Thin out ticks that would sit closer than 4 CSS pixels.
    const every = Math.max(1, Math.ceil(4 / gap));
    ctx.beginPath();
    for (let i = every; ; i += every) {
      const p = fromUnit(i * t.step);
      if (p > Math.max(w, h)) break;
      const size = i % t.major === 0 ? 14 : i % t.mid === 0 ? 9 : 5;
      if (p < w) (ctx.moveTo(crisp(p), RULER), ctx.lineTo(crisp(p), RULER - size));
      if (p < h) (ctx.moveTo(RULER, crisp(p)), ctx.lineTo(RULER - size, crisp(p)));
      if (i % t.major === 0) {
        const text = unit === "px" ? String(Math.round(i * t.step)) : String(+(i * t.step).toFixed(2));
        if (p < w) ctx.fillText(text, p + 3, 10);
        if (p < h) {
          ctx.save();
          ctx.translate(10, p + 3);
          ctx.rotate(Math.PI / 2);
          ctx.fillText(text, 0, 0);
          ctx.restore();
        }
      }
    }
    ctx.stroke();
  };

  const label = (ctx: CanvasRenderingContext2D, text: string, x: number, y: number) => {
    ctx.font = "600 12px 'Segoe UI', sans-serif";
    const width = ctx.measureText(text).width + 12;
    const bx = Math.min(x, window.innerWidth - width - 4);
    const by = Math.min(y, window.innerHeight - 24);
    ctx.fillStyle = "rgba(29, 29, 31, 0.9)";
    ctx.beginPath();
    ctx.roundRect(bx, by - 15, width, 20, 5);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.fillText(text, bx + 6, by);
  };

  const drawLine = (ctx: CanvasRenderingContext2D, { a, b }: Line) => {
    ctx.strokeStyle = lineColor;
    ctx.fillStyle = lineColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    for (const p of [a, b]) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    const dx = Math.abs(b.x - a.x);
    const dy = Math.abs(b.y - a.y);
    let text = fmt(toUnit(Math.hypot(dx, dy)));
    if (dx > 0.5 && dy > 0.5) text += `  (${fmtShort(toUnit(dx))} × ${fmtShort(toUnit(dy))})`;
    label(ctx, text, (a.x + b.x) / 2 + 10, (a.y + b.y) / 2 - 8);
  };

  const redraw = () => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(draw);
  };

  // Redraw whenever a setting changes; `draw` reads the latest values.
  useEffect(redraw);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement && e.target.type === "number";
      if (e.key === "Escape") close();
      else if (typing) return;
      else if (e.key === "Backspace" || e.key === "Delete" || (e.ctrlKey && e.key.toLowerCase() === "z")) setLines((l) => l.slice(0, -1));
      else if (e.key.toLowerCase() === "c") setLines([]);
      else if (e.key.toLowerCase() === "g") setGrid((g) => !g);
      else if (e.key.toLowerCase() === "r") setRuler((r) => !r);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", redraw);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", redraw);
    };
  });

  const point = (e: PointerEvent): Pt => ({ x: e.clientX, y: e.clientY });

  return (
    <div className="measure-root">
      <canvas
        ref={canvas}
        className="measure-canvas"
        onContextMenu={(e) => e.preventDefault()}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { a: point(e), b: point(e) };
          redraw();
        }}
        onPointerMove={(e) => {
          mouse.current = point(e);
          const d = drag.current;
          if (d) {
            const b = point(e);
            // Shift keeps the line straight across or straight down.
            if (e.shiftKey) Math.abs(b.x - d.a.x) > Math.abs(b.y - d.a.y) ? (b.y = d.a.y) : (b.x = d.a.x);
            d.b = b;
          }
          redraw();
        }}
        onPointerUp={() => {
          const d = drag.current;
          drag.current = null;
          if (d && Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y) >= 3) setLines((l) => [...l, d]);
          else redraw();
        }}
        onPointerLeave={() => ((mouse.current = null), redraw())}
      />

      <div className={`measure-bar${barTop ? " is-top" : ""}`} onPointerDown={(e) => e.stopPropagation()}>
        <div className="measure-row">
          <button className={ruler ? "is-on" : ""} onClick={() => setRuler(!ruler)} title="Rulers and crosshair (R)">
            Ruler
          </button>
          <button className={grid ? "is-on" : ""} onClick={() => setGrid(!grid)} title="Grid (G)">
            Grid
          </button>
          <label title="Grid spacing">
            every
            <input
              type="number"
              min={unit === "px" ? 2 : 0.05}
              step={unit === "px" ? 1 : 0.05}
              value={spacing}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (v > 0) setSpacing(v);
              }}
            />
          </label>
          <div className="measure-units" role="radiogroup" aria-label="Unit">
            {UNITS.map((u) => (
              <button
                key={u}
                role="radio"
                aria-checked={unit === u}
                className={unit === u ? "is-on" : ""}
                onClick={() => {
                  setUnit(u);
                  setSpacing(DEFAULT_SPACING[u]);
                }}
              >
                {u}
              </button>
            ))}
          </div>
          <label title="Line color">
            Line
            <input type="color" value={lineColor} onChange={(e) => setLineColor(e.target.value)} />
          </label>
          <label title="Grid color">
            Grid
            <input type="color" value={gridColor} onChange={(e) => setGridColor(e.target.value)} />
          </label>
          <button onClick={() => setLines([])} disabled={!lines.length} title="Remove all lines (C)">
            Clear
          </button>
          <button onClick={() => setBarTop(!barTop)} title="Move this bar to the other edge">
            {barTop ? "↓" : "↑"}
          </button>
          <button className="measure-close" onClick={close} title="Close (Esc)">
            Close
          </button>
        </div>
        <p className="measure-hint">
          Drag to measure. Shift keeps the line straight, Backspace removes the last line, Esc closes.
          {unit !== "px" && !info.rawDpi && " This screen doesn't report its size, so cm and inches are approximate."}
        </p>
      </div>
    </div>
  );
}
