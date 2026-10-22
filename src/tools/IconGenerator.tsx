import { useEffect, useState } from "react";
import { AppIconIcon } from "../components/Icons";
import { useNotes } from "../lib/store";
import { canvasOf, droppedFiles, isImage, joinPath, loadImage, pickFiles, pickFolder, toBlob, toIcns, toIco, writeFile } from "./media";

type Source = Awaited<ReturnType<typeof loadImage>>;

interface Style {
  /** Space around the picture, as a share of the icon (0 to 0.3). */
  pad: number;
  /** null keeps transparency. */
  background: string | null;
  /** Corner rounding as a share of the icon (0 square, 0.5 circle). */
  radius: number;
}

/**
 * Draws the source into a square icon. Big reductions go down in halves so
 * small icons stay crisp instead of aliased.
 */
function drawIcon(src: Source, size: number, style: Style, opts: { opaque?: boolean; circle?: boolean } = {}) {
  const { canvas, ctx } = canvasOf(size, size);
  const radius = opts.circle ? size / 2 : style.radius * size;
  if (radius > 0) {
    ctx.beginPath();
    ctx.roundRect(0, 0, size, size, radius);
    ctx.clip();
  }
  const bg = style.background ?? (opts.opaque ? "#ffffff" : null);
  if (bg) {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, size, size);
  }
  const box = size * (1 - 2 * style.pad);
  const scale = Math.min(box / src.width, box / src.height);
  let image: CanvasImageSource = src.image;
  let w = src.width;
  let h = src.height;
  const target = src.width * scale;
  while (w / 2 >= target && w > 2) {
    const step = canvasOf(w / 2, h / 2);
    step.ctx.imageSmoothingQuality = "high";
    step.ctx.drawImage(image, 0, 0, step.canvas.width, step.canvas.height);
    image = step.canvas;
    w = step.canvas.width;
    h = step.canvas.height;
  }
  ctx.imageSmoothingQuality = "high";
  const dw = src.width * scale;
  const dh = src.height * scale;
  ctx.drawImage(image, (size - dw) / 2, (size - dh) / 2, dw, dh);
  return canvas;
}

const png = (src: Source, size: number, style: Style, opts?: { opaque?: boolean; circle?: boolean }) => toBlob(drawIcon(src, size, style, opts), "image/png");
const pngs = (src: Source, sizes: number[], style: Style) => Promise.all(sizes.map(async (size) => ({ size, blob: await png(src, size, style) })));
const text = (s: string) => new Blob([s], { type: "text/plain" });

type Files = [string, Blob][];

const TARGETS: { id: string; label: string; note: string; make(src: Source, style: Style): Promise<Files> }[] = [
  {
    id: "web",
    label: "Website (favicon, PWA)",
    note: "favicon.ico, PNG favicons, Apple touch icon, Android/PWA icons, site.webmanifest",
    async make(src, style) {
      const files: Files = [
        ["favicon.ico", await toIco(await pngs(src, [16, 32, 48], style))],
        ["favicon-16x16.png", await png(src, 16, style)],
        ["favicon-32x32.png", await png(src, 32, style)],
        ["apple-touch-icon.png", await png(src, 180, style, { opaque: true })],
        ["android-chrome-192x192.png", await png(src, 192, style)],
        ["android-chrome-512x512.png", await png(src, 512, style)],
      ];
      files.push([
        "site.webmanifest",
        text(
          JSON.stringify(
            {
              name: "",
              short_name: "",
              icons: [
                { src: "/android-chrome-192x192.png", sizes: "192x192", type: "image/png" },
                { src: "/android-chrome-512x512.png", sizes: "512x512", type: "image/png" },
              ],
              theme_color: style.background ?? "#ffffff",
              background_color: style.background ?? "#ffffff",
              display: "standalone",
            },
            null,
            2,
          ),
        ),
      ]);
      files.push([
        "head-snippet.html",
        text(
          [
            '<link rel="icon" href="/favicon.ico" sizes="48x48">',
            '<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">',
            '<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">',
            '<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">',
            '<link rel="manifest" href="/site.webmanifest">',
            "",
          ].join("\n"),
        ),
      ]);
      return files;
    },
  },
  {
    id: "ios",
    label: "iPhone and iPad app",
    note: "AppIcon-1024.png with Contents.json for Xcode, plus the classic sizes (no transparency)",
    async make(src, style) {
      const files: Files = [["AppIcon.appiconset/AppIcon-1024.png", await png(src, 1024, { ...style, radius: 0 }, { opaque: true })]];
      files.push([
        "AppIcon.appiconset/Contents.json",
        text(JSON.stringify({ images: [{ filename: "AppIcon-1024.png", idiom: "universal", platform: "ios", size: "1024x1024" }], info: { author: "xcode", version: 1 } }, null, 2)),
      ]);
      for (const size of [40, 58, 60, 76, 80, 87, 120, 152, 167, 180]) files.push([`sizes/Icon-${size}.png`, await png(src, size, { ...style, radius: 0 }, { opaque: true })]);
      return files;
    },
  },
  {
    id: "android",
    label: "Android app",
    note: "ic_launcher and ic_launcher_round in every mipmap density, plus the 512 px Play Store icon",
    async make(src, style) {
      const files: Files = [];
      for (const [density, size] of [["mdpi", 48], ["hdpi", 72], ["xhdpi", 96], ["xxhdpi", 144], ["xxxhdpi", 192]] as const) {
        files.push([`mipmap-${density}/ic_launcher.png`, await png(src, size, style)]);
        files.push([`mipmap-${density}/ic_launcher_round.png`, await png(src, size, style, { circle: true })]);
      }
      files.push(["playstore-icon.png", await png(src, 512, style)]);
      return files;
    },
  },
  {
    id: "windows",
    label: "Windows desktop app",
    note: "app.ico with 16 to 256 px inside, plus a 256 px PNG",
    async make(src, style) {
      return [
        ["app.ico", await toIco(await pngs(src, [16, 24, 32, 48, 64, 128, 256], style))],
        ["app-256.png", await png(src, 256, style)],
      ];
    },
  },
  {
    id: "macos",
    label: "macOS app",
    note: "app.icns with 16 to 1024 px inside, plus a 1024 px PNG",
    async make(src, style) {
      return [
        ["app.icns", await toIcns(await pngs(src, [16, 32, 64, 128, 256, 512, 1024], style))],
        ["app-1024.png", await png(src, 1024, style)],
      ];
    },
  },
  {
    id: "electron",
    label: "Electron app",
    note: "build/icon.ico, icon.icns and icon.png for electron-builder, plus Linux sizes in build/icons",
    async make(src, style) {
      const files: Files = [
        ["build/icon.ico", await toIco(await pngs(src, [16, 24, 32, 48, 64, 128, 256], style))],
        ["build/icon.icns", await toIcns(await pngs(src, [16, 32, 64, 128, 256, 512, 1024], style))],
        ["build/icon.png", await png(src, 1024, style)],
      ];
      for (const size of [16, 32, 48, 64, 128, 256, 512]) files.push([`build/icons/${size}x${size}.png`, await png(src, size, style)]);
      return files;
    },
  },
  {
    id: "tauri",
    label: "Tauri app",
    note: "The src-tauri/icons set: PNGs, icon.ico, icon.icns and the Windows Store logos",
    async make(src, style) {
      const files: Files = [
        ["icons/32x32.png", await png(src, 32, style)],
        ["icons/64x64.png", await png(src, 64, style)],
        ["icons/128x128.png", await png(src, 128, style)],
        ["icons/128x128@2x.png", await png(src, 256, style)],
        ["icons/icon.png", await png(src, 512, style)],
        ["icons/icon.ico", await toIco(await pngs(src, [16, 24, 32, 48, 64, 256], style))],
        ["icons/icon.icns", await toIcns(await pngs(src, [16, 32, 64, 128, 256, 512, 1024], style))],
        ["icons/StoreLogo.png", await png(src, 50, style)],
      ];
      for (const size of [30, 44, 71, 89, 107, 142, 150, 284, 310]) files.push([`icons/Square${size}x${size}Logo.png`, await png(src, size, style)]);
      return files;
    },
  },
];

/** Makes icon sets for websites, phones and desktop apps from one picture. */
export function IconGenerator() {
  const [source, setSource] = useState<{ src: Source; name: string } | null>(null);
  const [pad, setPad] = useState(0);
  const [transparent, setTransparent] = useState(true);
  const [background, setBackground] = useState("#ffffff");
  const [radius, setRadius] = useState(0);
  const [targets, setTargets] = useState<string[]>(["web", "windows", "tauri"]);
  const [preview, setPreview] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const style: Style = { pad: pad / 100, background: transparent ? null : background, radius: radius / 100 };

  useEffect(() => () => source?.src.close(), [source]);
  useEffect(() => {
    if (!source) return setPreview(null);
    setPreview(drawIcon(source.src, 256, style).toDataURL());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, pad, transparent, background, radius]);

  const load = async (files: File[]) => {
    const file = files.find(isImage);
    if (!file) return;
    try {
      setSource({ src: await loadImage(file), name: file.name });
      setStatus(null);
    } catch {
      setStatus(`Couldn't read ${file.name}`);
    }
  };

  const generate = async () => {
    if (!source) return;
    const dir = await pickFolder("Save the icons to");
    if (!dir) return;
    setBusy(true);
    try {
      let count = 0;
      for (const t of TARGETS.filter((t) => targets.includes(t.id))) {
        setStatus(`Making ${t.label} icons…`);
        for (const [name, blob] of await t.make(source.src, style)) {
          await writeFile(joinPath(dir, t.id, ...name.split("/")), blob);
          count++;
        }
      }
      setStatus(`Saved ${count} files to ${dir}`);
    } catch (e) {
      useNotes.setState({ error: `Couldn't make the icons: ${e instanceof Error ? e.message : e}` });
      setStatus(null);
    } finally {
      setBusy(false);
    }
  };

  const toggle = (id: string) => setTargets((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const small = source && Math.min(source.src.width, source.src.height) < 512;

  return (
    <div className="tool-body">
      <button className="drop-zone" onClick={async () => load(await pickFiles("image/*,.svg"))} onDragOver={(e) => e.preventDefault()} onDrop={(e) => load(droppedFiles(e, isImage))}>
        {preview ? (
          <div className="icon-previews">
            <img src={preview} alt="" width={96} height={96} />
            <img src={preview} alt="" width={48} height={48} />
            <img src={preview} alt="" width={32} height={32} />
            <img src={preview} alt="" width={16} height={16} />
          </div>
        ) : (
          <AppIconIcon size={28} />
        )}
        <span>{source ? source.name : "Drop a square picture here or click to choose"}</span>
        {!source && <small>Best: SVG or a PNG of 1024 × 1024 px</small>}
      </button>
      {small && <p className="tool-hint is-error">This picture is under 512 px, so large icons will look soft.</p>}

      <label className="tool-field">
        <span>
          Padding <strong>{pad}%</strong>
        </span>
        <input type="range" min={0} max={30} value={pad} onChange={(e) => setPad(Number(e.target.value))} />
      </label>
      <label className="tool-field">
        <span>
          Corner rounding <strong>{radius === 50 ? "circle" : `${radius}%`}</strong>
        </span>
        <input type="range" min={0} max={50} value={radius} onChange={(e) => setRadius(Number(e.target.value))} />
      </label>
      <label className="tool-check">
        <input type="checkbox" checked={transparent} onChange={(e) => setTransparent(e.target.checked)} />
        Transparent background
        {!transparent && <input type="color" value={background} onChange={(e) => setBackground(e.target.value)} />}
      </label>

      <div className="tool-section">
        {TARGETS.map((t) => (
          <label key={t.id} className="tool-check icon-target">
            <input type="checkbox" checked={targets.includes(t.id)} onChange={() => toggle(t.id)} />
            <span>
              {t.label}
              <small>{t.note}</small>
            </span>
          </label>
        ))}
      </div>

      <div className="tool-actions">
        <button className="text-button" disabled={!source || !targets.length || busy} onClick={generate}>
          Make Icons and Save…
        </button>
      </div>
      {status && <p className="tool-hint">{status}</p>}
      <p className="tool-hint">Each set goes in its own folder (web, windows, tauri…) inside the folder you pick.</p>
    </div>
  );
}
