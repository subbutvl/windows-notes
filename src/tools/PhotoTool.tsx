import { useState, type ReactNode } from "react";
import type { Copy } from "./shared";

/** Sensor sizes in mm; circle of confusion is the diagonal / 1442 (0.030 mm on full frame). */
const SENSORS = [
  { name: "Full frame (35 mm)", w: 36, h: 24 },
  { name: "APS-C (Nikon, Sony, Fuji)", w: 23.5, h: 15.6 },
  { name: "APS-C (Canon)", w: 22.3, h: 14.9 },
  { name: "Micro Four Thirds", w: 17.3, h: 13 },
  { name: "1-inch", w: 13.2, h: 8.8 },
  { name: "Medium format (44×33)", w: 43.8, h: 32.9 },
  { name: "Phone (1/1.3-inch)", w: 9.8, h: 7.4 },
];
const FF_DIAGONAL = Math.hypot(36, 24);
const diagonal = (s: (typeof SENSORS)[number]) => Math.hypot(s.w, s.h);
const cropOf = (s: (typeof SENSORS)[number]) => FF_DIAGONAL / diagonal(s);
const cocOf = (s: (typeof SENSORS)[number]) => diagonal(s) / 1442;

const APERTURES = [1.4, 2, 2.8, 4, 5.6, 8, 11, 16, 22];

const fix = (v: number, digits = 1) => (Number.isFinite(v) ? Number(v.toFixed(digits)).toLocaleString() : "—");
/** 0.004 → "1/250 s", 2.5 → "2.5 s", 150 → "2 min 30 s". */
function shutter(t: number) {
  if (!Number.isFinite(t) || t <= 0) return "—";
  if (t < 0.4) return `1/${Math.round(1 / t)} s`;
  if (t < 60) return `${fix(t, 1)} s`;
  const m = Math.floor(t / 60);
  const s = Math.round(t % 60);
  return t < 3600 ? `${m} min${s ? ` ${s} s` : ""}` : `${fix(t / 3600, 1)} h`;
}
/** "1/250", "0.004", "2" or "2s" → seconds. */
function parseShutter(text: string) {
  const t = text.trim().replace(/\s*s(ec)?$/i, "");
  const m = /^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/.exec(t);
  return m ? Number(m[1]) / Number(m[2]) : Number(t);
}
const metres = (mm: number) => (!Number.isFinite(mm) || mm < 0 ? "∞" : mm >= 1000 ? `${fix(mm / 1000, 2)} m` : `${fix(mm / 10, 1)} cm`);

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="photo-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function NumberInput({ value, onChange, step = "any" }: { value: string; onChange(v: string): void; step?: string }) {
  return <input className="tool-input" inputMode="decimal" type="number" step={step} min="0" value={value} onChange={(e) => onChange(e.target.value)} />;
}

function SensorSelect({ value, onChange }: { value: number; onChange(v: number): void }) {
  return (
    <select className="tool-input" value={value} onChange={(e) => onChange(Number(e.target.value))}>
      {SENSORS.map((s, i) => (
        <option key={s.name} value={i}>
          {s.name}
        </option>
      ))}
    </select>
  );
}

function Results({ rows, copy }: { rows: [string, string][]; copy: Copy }) {
  return (
    <div className="unit-results">
      {rows.map(([label, value]) => (
        <button key={label} className="unit-row" title="Copy" disabled={value === "—"} onClick={() => copy(value)}>
          <span>{label}</span>
          <strong>{value}</strong>
        </button>
      ))}
    </div>
  );
}

function Exposure({ copy }: { copy: Copy }) {
  const [n, setN] = useState("8");
  const [t, setT] = useState("1/125");
  const [iso, setIso] = useState("100");
  const N = Number(n);
  const T = parseShutter(t);
  const ev100 = Math.log2((N * N) / T) - Math.log2(Number(iso) / 100);
  const evAtIso = Math.log2((N * N) / T);
  return (
    <>
      <div className="photo-grid">
        <Field label="Aperture f/">
          <NumberInput value={n} onChange={setN} />
        </Field>
        <Field label="Shutter (1/125, 2)">
          <input className="tool-input" value={t} onChange={(e) => setT(e.target.value)} />
        </Field>
        <Field label="ISO">
          <NumberInput value={iso} onChange={setIso} />
        </Field>
      </div>
      <Results copy={copy} rows={[["Exposure value (EV at ISO 100)", fix(ev100, 1)], ["EV of this aperture and shutter", fix(evAtIso, 1)]]} />
      <h3 className="photo-sub">Same exposure with other apertures</h3>
      <Results copy={copy} rows={APERTURES.map((a): [string, string] => [`f/${a}`, shutter((a * a) / Math.pow(2, evAtIso))])} />
    </>
  );
}

function DepthOfField({ copy }: { copy: Copy }) {
  const [sensor, setSensor] = useState(0);
  const [f, setF] = useState("50");
  const [n, setN] = useState("2.8");
  const [d, setD] = useState("3");
  const F = Number(f);
  const N = Number(n);
  const s = Number(d) * 1000;
  const c = cocOf(SENSORS[sensor]);
  const H = (F * F) / (N * c) + F;
  const near = (s * (H - F)) / (H + s - 2 * F);
  const far = s < H ? (s * (H - F)) / (H - s) : -1;
  return (
    <>
      <Field label="Sensor">
        <SensorSelect value={sensor} onChange={setSensor} />
      </Field>
      <div className="photo-grid">
        <Field label="Focal length (mm)">
          <NumberInput value={f} onChange={setF} />
        </Field>
        <Field label="Aperture f/">
          <NumberInput value={n} onChange={setN} />
        </Field>
        <Field label="Distance (m)">
          <NumberInput value={d} onChange={setD} />
        </Field>
      </div>
      <Results
        copy={copy}
        rows={[
          ["Near limit", metres(near)],
          ["Far limit", metres(far)],
          ["Total depth of field", far < 0 ? "∞" : metres(far - near)],
          ["In front / behind subject", `${metres(s - near)} / ${far < 0 ? "∞" : metres(far - s)}`],
          ["Hyperfocal distance", metres(H)],
          ["Circle of confusion", `${fix(c, 3)} mm`],
        ]}
      />
      <p className="tool-hint">Focus at the hyperfocal distance and everything from half that distance to infinity is acceptably sharp.</p>
    </>
  );
}

function CropFactor({ copy }: { copy: Copy }) {
  const [sensor, setSensor] = useState(1);
  const [f, setF] = useState("35");
  const [n, setN] = useState("1.8");
  const crop = cropOf(SENSORS[sensor]);
  return (
    <>
      <Field label="Sensor">
        <SensorSelect value={sensor} onChange={setSensor} />
      </Field>
      <div className="photo-grid two">
        <Field label="Focal length (mm)">
          <NumberInput value={f} onChange={setF} />
        </Field>
        <Field label="Aperture f/">
          <NumberInput value={n} onChange={setN} />
        </Field>
      </div>
      <Results
        copy={copy}
        rows={[
          ["Crop factor", `${fix(crop, 2)}×`],
          ["Full-frame equivalent focal length", `${fix(Number(f) * crop, 0)} mm`],
          ["Equivalent aperture (depth of field)", `f/${fix(Number(n) * crop, 1)}`],
          ["Sensor size", `${SENSORS[sensor].w} × ${SENSORS[sensor].h} mm`],
        ]}
      />
    </>
  );
}

function FieldOfView({ copy }: { copy: Copy }) {
  const [sensor, setSensor] = useState(0);
  const [f, setF] = useState("50");
  const [d, setD] = useState("10");
  const s = SENSORS[sensor];
  const F = Number(f);
  const angle = (size: number) => (2 * Math.atan(size / (2 * F)) * 180) / Math.PI;
  const span = (size: number) => (Number(d) * size) / F;
  return (
    <>
      <Field label="Sensor">
        <SensorSelect value={sensor} onChange={setSensor} />
      </Field>
      <div className="photo-grid two">
        <Field label="Focal length (mm)">
          <NumberInput value={f} onChange={setF} />
        </Field>
        <Field label="Subject distance (m)">
          <NumberInput value={d} onChange={setD} />
        </Field>
      </div>
      <Results
        copy={copy}
        rows={[
          ["Horizontal angle", `${fix(angle(s.w), 1)}°`],
          ["Vertical angle", `${fix(angle(s.h), 1)}°`],
          ["Diagonal angle", `${fix(angle(diagonal(s)), 1)}°`],
          ["Frame width at that distance", `${fix(span(s.w), 2)} m`],
          ["Frame height at that distance", `${fix(span(s.h), 2)} m`],
        ]}
      />
    </>
  );
}

function Astro({ copy }: { copy: Copy }) {
  const [sensor, setSensor] = useState(0);
  const [f, setF] = useState("20");
  const [n, setN] = useState("2.8");
  const [mp, setMp] = useState("24");
  const s = SENSORS[sensor];
  const crop = cropOf(s);
  const F = Number(f);
  // Pixel pitch in µm from the sensor width and its pixel count across.
  const pixelsAcross = Math.sqrt((Number(mp) * 1e6 * s.w) / s.h);
  const pitch = (s.w / pixelsAcross) * 1000;
  const npf = (35 * Number(n) + 30 * pitch) / F;
  return (
    <>
      <Field label="Sensor">
        <SensorSelect value={sensor} onChange={setSensor} />
      </Field>
      <div className="photo-grid">
        <Field label="Focal length (mm)">
          <NumberInput value={f} onChange={setF} />
        </Field>
        <Field label="Aperture f/">
          <NumberInput value={n} onChange={setN} />
        </Field>
        <Field label="Megapixels">
          <NumberInput value={mp} onChange={setMp} />
        </Field>
      </div>
      <Results
        copy={copy}
        rows={[
          ["NPF rule (sharp stars)", shutter(npf)],
          ["500 rule", shutter(500 / (F * crop))],
          ["300 rule (high-res sensors)", shutter(300 / (F * crop))],
          ["Pixel pitch", `${fix(pitch, 2)} µm`],
        ]}
      />
      <p className="tool-hint">Longest shutter time before stars start to trail. NPF is the stricter, modern rule.</p>
    </>
  );
}

const ND_FILTERS = [
  ["ND2 (1 stop)", 1], ["ND4 (2 stops)", 2], ["ND8 (3 stops)", 3], ["ND16 (4 stops)", 4], ["ND32 (5 stops)", 5], ["ND64 (6 stops)", 6],
  ["ND128 (7 stops)", 7], ["ND256 (8 stops)", 8], ["ND500 (9 stops)", 9], ["ND1000 (10 stops)", 10], ["ND32000 (15 stops)", 15], ["ND100000 (16.6 stops)", 16.6],
] as const;

function NdFilter({ copy }: { copy: Copy }) {
  const [t, setT] = useState("1/125");
  const [stops, setStops] = useState(10);
  const T = parseShutter(t);
  return (
    <>
      <div className="photo-grid two">
        <Field label="Shutter without filter">
          <input className="tool-input" value={t} onChange={(e) => setT(e.target.value)} />
        </Field>
        <Field label="Filter">
          <select className="tool-input" value={stops} onChange={(e) => setStops(Number(e.target.value))}>
            {ND_FILTERS.map(([name, s]) => (
              <option key={name} value={s}>
                {name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Results copy={copy} rows={[["Shutter with filter", shutter(T * Math.pow(2, stops))]]} />
      <h3 className="photo-sub">Every filter at this shutter</h3>
      <Results copy={copy} rows={ND_FILTERS.map(([name, s]): [string, string] => [name, shutter(T * Math.pow(2, s))])} />
    </>
  );
}

function PrintSize({ copy }: { copy: Copy }) {
  const [w, setW] = useState("6000");
  const [h, setH] = useState("4000");
  const [dpi, setDpi] = useState("300");
  const W = Number(w);
  const H = Number(h);
  const size = (d: number) => `${fix(W / d, 1)} × ${fix(H / d, 1)} in · ${fix((W / d) * 2.54, 1)} × ${fix((H / d) * 2.54, 1)} cm`;
  return (
    <>
      <div className="photo-grid">
        <Field label="Width (px)">
          <NumberInput value={w} onChange={setW} step="1" />
        </Field>
        <Field label="Height (px)">
          <NumberInput value={h} onChange={setH} step="1" />
        </Field>
        <Field label="DPI">
          <NumberInput value={dpi} onChange={setDpi} step="1" />
        </Field>
      </div>
      <Results
        copy={copy}
        rows={[
          [`Print size at ${dpi} dpi`, size(Number(dpi))],
          ["Megapixels", `${fix((W * H) / 1e6, 1)} MP`],
          ["Best quality (300 dpi)", size(300)],
          ["Good (240 dpi)", size(240)],
          ["Posters seen from afar (150 dpi)", size(150)],
        ]}
      />
    </>
  );
}

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
const COMMON_RATIOS = [[1, 1], [4, 3], [3, 2], [16, 9], [16, 10], [5, 4], [21, 9], [9, 16], [4, 5], [2, 3]];

function AspectRatio({ copy }: { copy: Copy }) {
  const [w, setW] = useState("1920");
  const [h, setH] = useState("1080");
  const [newW, setNewW] = useState("1280");
  const W = Math.round(Number(w));
  const H = Math.round(Number(h));
  const g = W > 0 && H > 0 ? gcd(W, H) : 0;
  const closest = g ? COMMON_RATIOS.reduce((best, r) => (Math.abs(r[0] / r[1] - W / H) < Math.abs(best[0] / best[1] - W / H) ? r : best)) : null;
  return (
    <>
      <div className="photo-grid two">
        <Field label="Width">
          <NumberInput value={w} onChange={setW} step="1" />
        </Field>
        <Field label="Height">
          <NumberInput value={h} onChange={setH} step="1" />
        </Field>
      </div>
      <Field label="Resize to width">
        <NumberInput value={newW} onChange={setNewW} step="1" />
      </Field>
      <Results
        copy={copy}
        rows={[
          ["Aspect ratio", g ? `${W / g}:${H / g}` : "—"],
          ["Closest common ratio", closest ? `${closest[0]}:${closest[1]}` : "—"],
          ["As a number", g ? fix(W / H, 3) : "—"],
          [`Height at width ${newW}`, g ? `${Math.round((Number(newW) * H) / W)} px` : "—"],
        ]}
      />
    </>
  );
}

const SECTIONS = [
  { name: "Exposure (EV)", render: (copy: Copy) => <Exposure copy={copy} /> },
  { name: "Depth of Field", render: (copy: Copy) => <DepthOfField copy={copy} /> },
  { name: "Crop Factor", render: (copy: Copy) => <CropFactor copy={copy} /> },
  { name: "Field of View", render: (copy: Copy) => <FieldOfView copy={copy} /> },
  { name: "Astro (NPF and 500 rule)", render: (copy: Copy) => <Astro copy={copy} /> },
  { name: "ND Filter", render: (copy: Copy) => <NdFilter copy={copy} /> },
  { name: "Print Size and DPI", render: (copy: Copy) => <PrintSize copy={copy} /> },
  { name: "Aspect Ratio", render: (copy: Copy) => <AspectRatio copy={copy} /> },
];

/** Standard photography calculators. Click a result to copy it. */
export function PhotoTool({ copy }: { copy: Copy }) {
  const [section, setSection] = useState(0);
  return (
    <div className="tool-body">
      <select className="tool-input" aria-label="Calculator" value={section} onChange={(e) => setSection(Number(e.target.value))}>
        {SECTIONS.map((s, i) => (
          <option key={s.name} value={i}>
            {s.name}
          </option>
        ))}
      </select>
      <div className="tool-section" key={section}>
        {SECTIONS[section].render(copy)}
      </div>
    </div>
  );
}
