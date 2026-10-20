export type RGB = [number, number, number];

/** "#abc", "abc", "#aabbcc" or "aabbcc" → "#aabbcc"; anything else → null. */
export function normalizeHex(input: string): string | null {
  let h = input.trim().replace(/^#/, "").toLowerCase();
  if (/^[0-9a-f]{3}$/.test(h)) h = [...h].map((c) => c + c).join("");
  return /^[0-9a-f]{6}$/.test(h) ? `#${h}` : null;
}

export const hexToRgb = (hex: string): RGB => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as RGB;

export const rgbToHex = (rgb: RGB) => `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;

export function rgbToHsl([r, g, b]: RGB): RGB {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, Math.round(l * 100)];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [Math.round((h * 60 + 360) % 360), Math.round(s * 100), Math.round(l * 100)];
}

/** Mixes a colour toward another by `amount` (0 to 1). */
const mix = (from: RGB, to: RGB, amount: number) => rgbToHex(from.map((v, i) => v + (to[i] - v) * amount) as RGB);

const STEPS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];

/** The dark theme's note text and background, which dark-mode tints and shades mix toward. */
export const DARK_LIGHTEST = "#f2f2f4";
export const DARK_DARKEST = "#1a1a1c";

/** Tints mix in `light` (white), shades mix in `dark` (black), in 10% steps. */
export function tintsAndShades(hex: string, light = "#ffffff", dark = "#000000") {
  const rgb = hexToRgb(hex);
  return {
    tints: STEPS.map((s) => ({ step: Math.round(s * 100), hex: mix(rgb, hexToRgb(light), s) })),
    shades: STEPS.map((s) => ({ step: Math.round(s * 100), hex: mix(rgb, hexToRgb(dark), s) })),
  };
}

/** Dark or light text, whichever reads better on this background. */
export function readableOn(hex: string) {
  const [r, g, b] = hexToRgb(hex);
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? "#1d1d1f" : "#ffffff";
}

/**
 * True for "#" codes that read as colours rather than #tags: 6 or 8 hex
 * digits, or 3 or 4 with a digit or one repeated letter (#f50, #fff). Words
 * like #cafe or #bad stay tags.
 */
export function isColorHex(word: string) {
  if (/^#(?:[0-9a-f]{6}|[0-9a-f]{8})$/i.test(word)) return true;
  return /^#[0-9a-f]{3,4}$/i.test(word) && (/\d/.test(word) || /^#(.)\1+$/i.test(word));
}

function hslToRgb(h: number, s: number, l: number): RGB {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

const clamp = (v: number, max: number) => Math.min(max, Math.max(0, v));

/** "50%" → 0.5 × scale, "0.5" → 0.5; anything else → NaN. */
const num = (part: string, scale: number) =>
  /^-?\d*\.?\d+%$/.test(part) ? (parseFloat(part) / 100) * scale : /^-?\d*\.?\d+$/.test(part) ? parseFloat(part) : NaN;

/**
 * Parses a colour code written in a note: #hex, rgb()/rgba() or hsl()/hsla().
 * Returns the CSS background and a readable text colour (null when the colour
 * is mostly transparent, so the note's own text colour stays).
 */
export function parseColorCode(code: string): { css: string; fg: string | null } | null {
  let rgb: RGB;
  let alpha = 1;
  if (code.startsWith("#")) {
    if (!isColorHex(code)) return null;
    let h = code.slice(1);
    if (h.length <= 4) h = [...h].map((c) => c + c).join("");
    rgb = hexToRgb(`#${h}`);
    if (h.length === 8) alpha = parseInt(h.slice(6), 16) / 255;
  } else {
    const m = /^(rgba?|hsla?)\(\s*([^()]*?)\s*\)$/i.exec(code);
    if (!m) return null;
    const parts = m[2].split(/\s*[,/]\s*|\s+/);
    if (parts.length < 3 || parts.length > 4) return null;
    if (parts.length === 4) alpha = clamp(num(parts[3], 1), 1);
    if (m[1].toLowerCase().startsWith("rgb")) {
      rgb = parts.slice(0, 3).map((p) => clamp(num(p, 255), 255)) as RGB;
    } else {
      const h = num(parts[0].replace(/deg$/i, ""), 360);
      const s = parts[1].endsWith("%") ? parseFloat(parts[1]) / 100 : NaN;
      const l = parts[2].endsWith("%") ? parseFloat(parts[2]) / 100 : NaN;
      rgb = hslToRgb(((h % 360) + 360) % 360, clamp(s, 1), clamp(l, 1));
    }
    if ([...rgb, alpha].some(Number.isNaN)) return null;
  }
  const css = `rgba(${rgb.map(Math.round).join(", ")}, ${+alpha.toFixed(3)})`;
  return { css, fg: alpha >= 0.5 ? readableOn(rgbToHex(rgb)) : null };
}

/** A colour code from a note as "#rrggbb" (alpha dropped), or null. */
export function colorCodeToHex(code: string): string | null {
  const parsed = parseColorCode(code);
  const m = parsed && /rgba\((\d+), (\d+), (\d+)/.exec(parsed.css);
  return m ? rgbToHex([+m[1], +m[2], +m[3]]) : null;
}
