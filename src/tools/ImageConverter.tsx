import { useEffect, useState } from "react";
import { ImageIcon } from "../components/Icons";
import { useNotes } from "../lib/store";
import { baseName, canvasOf, droppedFiles, isImage, joinPath, loadImage, pickFiles, pickFolder, prettyBytes, saveAs, toBlob, toBmp, writeFile } from "./media";

const FORMATS = {
  png: { label: "PNG", mime: "image/png", ext: "png", lossy: false, opaque: false },
  jpg: { label: "JPG", mime: "image/jpeg", ext: "jpg", lossy: true, opaque: true },
  webp: { label: "WebP", mime: "image/webp", ext: "webp", lossy: true, opaque: false },
  bmp: { label: "BMP", mime: "image/bmp", ext: "bmp", lossy: false, opaque: true },
  svg: { label: "SVG", mime: "image/svg+xml", ext: "svg", lossy: false, opaque: false },
} as const;
type Format = keyof typeof FORMATS;

interface Picked {
  file: File;
  width: number;
  height: number;
  preview: string;
}

/** Draws a picture at the chosen size and encodes it in the chosen format. */
async function convert(file: File, format: Format, quality: number, maxSide: number | null, background: string): Promise<Blob> {
  const img = await loadImage(file);
  try {
    const scale = maxSide && Math.max(img.width, img.height) > maxSide ? maxSide / Math.max(img.width, img.height) : 1;
    const { canvas, ctx } = canvasOf(img.width * scale, img.height * scale);
    const f = FORMATS[format];
    if (f.opaque) {
      // JPG and BMP have no transparency: fill behind the picture.
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img.image, 0, 0, canvas.width, canvas.height);
    if (format === "bmp") return toBmp(canvas);
    if (format === "svg") {
      // An SVG wrapper around a PNG: opens anywhere SVG does, but isn't traced into shapes.
      const png = await toBlob(canvas, "image/png");
      const data = await new Promise<string>((resolve) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.readAsDataURL(png);
      });
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}" viewBox="0 0 ${canvas.width} ${canvas.height}"><image href="${data}" width="${canvas.width}" height="${canvas.height}"/></svg>`;
      return new Blob([svg], { type: f.mime });
    }
    return await toBlob(canvas, f.mime, f.lossy ? quality / 100 : undefined);
  } finally {
    img.close();
  }
}

/** Converts pictures between PNG, JPG, WebP, BMP and SVG, one or many at a time. */
export function ImageConverter() {
  const [picked, setPicked] = useState<Picked[]>([]);
  const [format, setFormat] = useState<Format>("jpg");
  const [quality, setQuality] = useState(90);
  const [resize, setResize] = useState(false);
  const [maxSide, setMaxSide] = useState("1920");
  const [background, setBackground] = useState("#ffffff");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Previews are object URLs; free them when the list changes or the tool closes.
  useEffect(() => () => picked.forEach((p) => URL.revokeObjectURL(p.preview)), [picked]);

  const add = async (files: File[]) => {
    const next: Picked[] = [];
    for (const file of files.filter(isImage)) {
      try {
        const img = await loadImage(file);
        next.push({ file, width: img.width, height: img.height, preview: URL.createObjectURL(file) });
        img.close();
      } catch {
        setStatus(`Couldn't read ${file.name}`);
      }
    }
    if (next.length) setPicked(next);
  };

  const run = async () => {
    setBusy(true);
    setStatus(null);
    const f = FORMATS[format];
    const side = resize ? Number(maxSide) || null : null;
    try {
      if (picked.length === 1) {
        const blob = await convert(picked[0].file, format, quality, side, background);
        const path = await saveAs(blob, `${baseName(picked[0].file.name)}.${f.ext}`, { name: f.label, extensions: [f.ext] });
        if (path) setStatus(`Saved ${prettyBytes(blob.size)} to ${path}`);
      } else {
        const dir = await pickFolder(`Save ${picked.length} ${f.label} files to`);
        if (!dir) return;
        for (const [i, p] of picked.entries()) {
          setStatus(`Converting ${i + 1} of ${picked.length}…`);
          await writeFile(joinPath(dir, `${baseName(p.file.name)}.${f.ext}`), await convert(p.file, format, quality, side, background));
        }
        setStatus(`Saved ${picked.length} files to ${dir}`);
      }
    } catch (e) {
      useNotes.setState({ error: `Couldn't convert: ${e instanceof Error ? e.message : e}` });
      setStatus(null);
    } finally {
      setBusy(false);
    }
  };

  const one = picked[0];
  return (
    <div className="tool-body">
      <button
        className="drop-zone"
        onClick={async () => add(await pickFiles("image/*,.svg", true))}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => add(droppedFiles(e, isImage))}
      >
        {one ? (
          <>
            <img src={one.preview} alt="" />
            <span>
              {picked.length === 1 ? `${one.file.name} · ${one.width} × ${one.height} · ${prettyBytes(one.file.size)}` : `${picked.length} pictures`}
            </span>
          </>
        ) : (
          <>
            <ImageIcon size={28} />
            <span>Drop pictures here or click to choose</span>
            <small>PNG, JPG, WebP, GIF, BMP, SVG, ICO, AVIF</small>
          </>
        )}
      </button>

      <div className="chip-row" role="group" aria-label="Convert to">
        {(Object.keys(FORMATS) as Format[]).map((k) => (
          <button key={k} className={`chip${format === k ? " is-on" : ""}`} aria-pressed={format === k} onClick={() => setFormat(k)}>
            {FORMATS[k].label}
          </button>
        ))}
      </div>

      {FORMATS[format].lossy && (
        <label className="tool-field">
          <span>
            Quality <strong>{quality}</strong>
          </span>
          <input type="range" min={10} max={100} value={quality} onChange={(e) => setQuality(Number(e.target.value))} />
        </label>
      )}
      {FORMATS[format].opaque && (
        <label className="tool-check">
          <input type="color" value={background} onChange={(e) => setBackground(e.target.value)} />
          Background for transparent areas
        </label>
      )}
      <label className="tool-check">
        <input type="checkbox" checked={resize} onChange={(e) => setResize(e.target.checked)} />
        Shrink so the longest side is at most
        <input className="tool-input inline-number" type="number" min={16} value={maxSide} disabled={!resize} onChange={(e) => setMaxSide(e.target.value)} />
        px
      </label>
      {format === "svg" && <p className="tool-hint">SVG wraps the picture as is; it isn't traced into shapes.</p>}

      <div className="tool-actions">
        <button className="text-button" disabled={!picked.length || busy} onClick={run}>
          {picked.length > 1 ? `Convert ${picked.length} and Save…` : "Convert and Save…"}
        </button>
      </div>
      {status && <p className="tool-hint">{status}</p>}
    </div>
  );
}
