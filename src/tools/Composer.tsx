import { useEffect, useRef, useState } from "react";
import { ImageIcon } from "../components/Icons";
import { useNotes } from "../lib/store";
import { canvasOf, droppedFiles, isImage, loadImage, pickFiles, saveAs, toBlob } from "./media";

/**
 * One canvas layout shared by the Splash Screen and Thumbnail generators:
 * a background (colour, gradient or picture), an optional picture or logo on
 * top, and a title with a subtitle.
 */

export interface Preset {
  group: string;
  name: string;
  w: number;
  h: number;
  /** Profile pictures are shown in a circle on most sites. */
  round?: boolean;
}

export interface ComposerDefaults {
  background: "solid" | "gradient" | "picture";
  usePicture: boolean;
  title: string;
  subtitle: string;
  textPlace: "top" | "middle" | "bottom";
  align: "left" | "center";
  darken: number;
  pictureSize: number;
  pictureY: number;
}

type Source = Awaited<ReturnType<typeof loadImage>>;

const FONT = '"Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif';

/** Breaks text into lines that fit `max` px wide. */
function wrap(ctx: CanvasRenderingContext2D, text: string, max: number) {
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width > max && line) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    lines.push(line);
  }
  return lines;
}

/** Draws `src` to cover (or fit inside) a box, zoomed and shifted by the given amounts. */
function drawPicture(ctx: CanvasRenderingContext2D, src: Source, x: number, y: number, w: number, h: number, cover: boolean, zoom = 1, shiftX = 0.5, shiftY = 0.5) {
  const scale = (cover ? Math.max(w / src.width, h / src.height) : Math.min(w / src.width, h / src.height)) * zoom;
  const dw = src.width * scale;
  const dh = src.height * scale;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src.image, x + (w - dw) * shiftX, y + (h - dh) * shiftY, dw, dh);
}

interface State {
  background: ComposerDefaults["background"];
  color1: string;
  color2: string;
  angle: number;
  bgPicture: Source | null;
  zoom: number;
  focusX: number;
  focusY: number;
  darken: number;
  picture: Source | null;
  usePicture: boolean;
  pictureSize: number;
  pictureY: number;
  title: string;
  subtitle: string;
  textColor: string;
  textSize: number;
  textPlace: ComposerDefaults["textPlace"];
  align: ComposerDefaults["align"];
  shadow: boolean;
}

function render(canvas: HTMLCanvasElement, w: number, h: number, s: State) {
  canvas.width = Math.round(w);
  canvas.height = Math.round(h);
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, w, h);

  // Background
  if (s.background === "picture" && s.bgPicture) {
    ctx.fillStyle = s.color1;
    ctx.fillRect(0, 0, w, h);
    drawPicture(ctx, s.bgPicture, 0, 0, w, h, true, s.zoom, s.focusX, s.focusY);
  } else if (s.background === "gradient") {
    const a = (s.angle * Math.PI) / 180;
    const r = Math.abs(w * Math.cos(a)) / 2 + Math.abs(h * Math.sin(a)) / 2;
    const g = ctx.createLinearGradient(w / 2 - Math.cos(a) * r, h / 2 - Math.sin(a) * r, w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r);
    g.addColorStop(0, s.color1);
    g.addColorStop(1, s.color2);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  } else {
    ctx.fillStyle = s.color1;
    ctx.fillRect(0, 0, w, h);
  }
  if (s.darken > 0) {
    ctx.fillStyle = `rgba(0,0,0,${s.darken / 100})`;
    ctx.fillRect(0, 0, w, h);
  }

  // Picture or logo, centred, sized by share of the shorter side.
  const short = Math.min(w, h);
  if (s.usePicture && s.picture) {
    const box = (short * s.pictureSize) / 100;
    drawPicture(ctx, s.picture, (w - box) / 2, (h - box) * (s.pictureY / 100), box, box, false);
  }

  // Text
  const lines: { text: string; size: number; weight: number }[] = [];
  const titleSize = (short * s.textSize) / 100;
  const pad = short * 0.07;
  const maxWidth = w - pad * 2;
  ctx.font = `700 ${titleSize}px ${FONT}`;
  for (const t of s.title.trim() ? wrap(ctx, s.title, maxWidth) : []) lines.push({ text: t, size: titleSize, weight: 700 });
  const subSize = titleSize * 0.45;
  ctx.font = `400 ${subSize}px ${FONT}`;
  for (const t of s.subtitle.trim() ? wrap(ctx, s.subtitle, maxWidth) : []) lines.push({ text: t, size: subSize, weight: 400 });
  if (!lines.length) return;

  const lineHeight = (l: (typeof lines)[number]) => l.size * 1.2;
  const blockHeight = lines.reduce((n, l) => n + lineHeight(l), 0);
  let y = s.textPlace === "top" ? pad : s.textPlace === "bottom" ? h - pad - blockHeight : (h - blockHeight) / 2;
  ctx.fillStyle = s.textColor;
  ctx.textAlign = s.align;
  ctx.textBaseline = "top";
  if (s.shadow) {
    ctx.shadowColor = "rgba(0,0,0,0.45)";
    ctx.shadowBlur = titleSize * 0.15;
    ctx.shadowOffsetY = titleSize * 0.04;
  }
  const x = s.align === "center" ? w / 2 : pad;
  for (const l of lines) {
    ctx.font = `${l.weight} ${l.size}px ${FONT}`;
    ctx.fillText(l.text, x, y + (lineHeight(l) - l.size) / 2);
    y += lineHeight(l);
  }
  ctx.shadowColor = "transparent";
}

function PicturePicker({ label, value, onChange }: { label: string; value: Source | null; onChange(v: Source | null): void }) {
  const load = async (files: File[]) => {
    const file = files.find(isImage);
    if (!file) return;
    try {
      onChange(await loadImage(file));
    } catch {
      useNotes.setState({ error: `Couldn't read ${file.name}` });
    }
  };
  return (
    <div className="composer-picker">
      <button className="text-button" onClick={async () => load(await pickFiles("image/*,.svg"))} onDragOver={(e) => e.preventDefault()} onDrop={(e) => load(droppedFiles(e, isImage))}>
        <ImageIcon size={16} /> {value ? `Change ${label}` : `Choose ${label}…`}
      </button>
      {value && (
        <button className="text-button" onClick={() => onChange(null)}>
          Remove
        </button>
      )}
    </div>
  );
}

function Slider({ label, value, min, max, onChange, suffix = "" }: { label: string; value: number; min: number; max: number; onChange(v: number): void; suffix?: string }) {
  return (
    <label className="tool-field">
      <span>
        {label} <strong>{value}{suffix}</strong>
      </span>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

export function Composer({ presets, defaults, pictureLabel, fileName }: { presets: Preset[]; defaults: ComposerDefaults; pictureLabel: string; fileName: string }) {
  const [preset, setPreset] = useState(0);
  const [custom, setCustom] = useState({ w: "1200", h: "630" });
  const [s, setS] = useState<State>({
    background: defaults.background,
    color1: "#1f2937",
    color2: "#d9a400",
    angle: 135,
    bgPicture: null,
    zoom: 100,
    focusX: 50,
    focusY: 50,
    darken: defaults.darken,
    picture: null,
    usePicture: defaults.usePicture,
    pictureSize: defaults.pictureSize,
    pictureY: defaults.pictureY,
    title: defaults.title,
    subtitle: defaults.subtitle,
    textColor: "#ffffff",
    textSize: 12,
    textPlace: defaults.textPlace,
    align: defaults.align,
    shadow: true,
  });
  const [format, setFormat] = useState<"png" | "jpg">("png");
  const [status, setStatus] = useState<string | null>(null);
  const preview = useRef<HTMLCanvasElement>(null);
  const set = <K extends keyof State>(k: K, v: State[K]) => setS((cur) => ({ ...cur, [k]: v }));

  const isCustom = preset === presets.length;
  const size = isCustom ? { w: Math.max(16, Number(custom.w) || 0), h: Math.max(16, Number(custom.h) || 0), round: false } : presets[preset];

  // Pictures hold decoded bitmaps; free them when replaced or when the tool closes.
  useEffect(() => () => s.bgPicture?.close(), [s.bgPicture]);
  useEffect(() => () => s.picture?.close(), [s.picture]);

  useEffect(() => {
    const canvas = preview.current;
    if (!canvas) return;
    // Preview at most 800 px wide; the saved file is drawn again at full size.
    const scale = Math.min(1, 800 / size.w, 600 / size.h);
    render(canvas, size.w * scale, size.h * scale, { ...s, textSize: s.textSize });
  }, [s, size.w, size.h]);

  const save = async () => {
    try {
      const { canvas } = canvasOf(size.w, size.h);
      render(canvas, size.w, size.h, s);
      const blob = await toBlob(canvas, format === "png" ? "image/png" : "image/jpeg", 0.92);
      const name = isCustom ? `${fileName}-${size.w}x${size.h}` : `${fileName}-${presets[preset].name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
      const path = await saveAs(blob, `${name}.${format}`, { name: format.toUpperCase(), extensions: [format] });
      if (path) setStatus(`Saved ${size.w} × ${size.h} to ${path}`);
    } catch (e) {
      useNotes.setState({ error: `Couldn't save the image: ${e instanceof Error ? e.message : e}` });
    }
  };

  const groups = [...new Set(presets.map((p) => p.group))];
  return (
    <div className="tool-body">
      <select className="tool-input" aria-label="Size" value={preset} onChange={(e) => setPreset(Number(e.target.value))}>
        {groups.map((g) => (
          <optgroup key={g} label={g}>
            {presets.map((p, i) =>
              p.group === g ? (
                <option key={p.name} value={i}>
                  {p.name} ({p.w} × {p.h})
                </option>
              ) : null,
            )}
          </optgroup>
        ))}
        <option value={presets.length}>Custom size…</option>
      </select>
      {isCustom && (
        <div className="photo-grid two">
          <input className="tool-input" type="number" min={16} aria-label="Width" value={custom.w} onChange={(e) => setCustom({ ...custom, w: e.target.value })} />
          <input className="tool-input" type="number" min={16} aria-label="Height" value={custom.h} onChange={(e) => setCustom({ ...custom, h: e.target.value })} />
        </div>
      )}

      <div className={`composer-preview${size.round ? " is-round" : ""}`}>
        <canvas ref={preview} />
      </div>

      <h3 className="photo-sub">Background</h3>
      <div className="chip-row" role="group" aria-label="Background">
        {(["solid", "gradient", "picture"] as const).map((b) => (
          <button key={b} className={`chip${s.background === b ? " is-on" : ""}`} aria-pressed={s.background === b} onClick={() => set("background", b)}>
            {b === "solid" ? "Colour" : b === "gradient" ? "Gradient" : "Picture"}
          </button>
        ))}
      </div>
      {s.background !== "picture" ? (
        <label className="tool-check">
          <input type="color" value={s.color1} onChange={(e) => set("color1", e.target.value)} />
          {s.background === "gradient" && <input type="color" value={s.color2} onChange={(e) => set("color2", e.target.value)} />}
          {s.background === "gradient" ? "Gradient colours" : "Background colour"}
        </label>
      ) : (
        <>
          <PicturePicker label="background picture" value={s.bgPicture} onChange={(v) => set("bgPicture", v)} />
          {s.bgPicture && (
            <>
              <Slider label="Zoom" value={s.zoom} min={100} max={300} suffix="%" onChange={(v) => set("zoom", v)} />
              <Slider label="Move left / right" value={s.focusX} min={0} max={100} suffix="%" onChange={(v) => set("focusX", v)} />
              <Slider label="Move up / down" value={s.focusY} min={0} max={100} suffix="%" onChange={(v) => set("focusY", v)} />
            </>
          )}
        </>
      )}
      {s.background === "gradient" && <Slider label="Gradient angle" value={s.angle} min={0} max={360} suffix="°" onChange={(v) => set("angle", v)} />}
      <Slider label="Darken" value={s.darken} min={0} max={80} suffix="%" onChange={(v) => set("darken", v)} />

      <h3 className="photo-sub">{pictureLabel[0].toUpperCase() + pictureLabel.slice(1)}</h3>
      <label className="tool-check">
        <input type="checkbox" checked={s.usePicture} onChange={(e) => set("usePicture", e.target.checked)} />
        Show a {pictureLabel}
      </label>
      {s.usePicture && (
        <>
          <PicturePicker label={pictureLabel} value={s.picture} onChange={(v) => set("picture", v)} />
          <Slider label="Size" value={s.pictureSize} min={10} max={100} suffix="%" onChange={(v) => set("pictureSize", v)} />
          <Slider label="Up / down" value={s.pictureY} min={0} max={100} suffix="%" onChange={(v) => set("pictureY", v)} />
        </>
      )}

      <h3 className="photo-sub">Text</h3>
      <input className="tool-input" placeholder="Title" value={s.title} onChange={(e) => set("title", e.target.value)} />
      <input className="tool-input" placeholder="Subtitle" value={s.subtitle} onChange={(e) => set("subtitle", e.target.value)} />
      <Slider label="Text size" value={s.textSize} min={3} max={30} onChange={(v) => set("textSize", v)} />
      <div className="chip-row" role="group" aria-label="Text position">
        {(["top", "middle", "bottom"] as const).map((p) => (
          <button key={p} className={`chip${s.textPlace === p ? " is-on" : ""}`} aria-pressed={s.textPlace === p} onClick={() => set("textPlace", p)}>
            {p[0].toUpperCase() + p.slice(1)}
          </button>
        ))}
        {(["left", "center"] as const).map((a) => (
          <button key={a} className={`chip${s.align === a ? " is-on" : ""}`} aria-pressed={s.align === a} onClick={() => set("align", a)}>
            {a === "left" ? "Left" : "Centre"}
          </button>
        ))}
      </div>
      <label className="tool-check">
        <input type="color" value={s.textColor} onChange={(e) => set("textColor", e.target.value)} />
        Text colour
        <input type="checkbox" checked={s.shadow} onChange={(e) => set("shadow", e.target.checked)} />
        Shadow
      </label>

      <div className="tool-actions">
        <div className="chip-row composer-format" role="group" aria-label="File type">
          {(["png", "jpg"] as const).map((f) => (
            <button key={f} className={`chip${format === f ? " is-on" : ""}`} aria-pressed={format === f} onClick={() => setFormat(f)}>
              {f.toUpperCase()}
            </button>
          ))}
        </div>
        <button className="text-button" onClick={save}>
          Save {size.w} × {size.h}…
        </button>
      </div>
      {status && <p className="tool-hint">{status}</p>}
    </div>
  );
}
