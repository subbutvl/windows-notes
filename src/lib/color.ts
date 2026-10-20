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

/** Tints mix in white, shades mix in black, in 10% steps. */
export function tintsAndShades(hex: string) {
  const rgb = hexToRgb(hex);
  return {
    tints: STEPS.map((s) => ({ step: Math.round(s * 100), hex: mix(rgb, [255, 255, 255], s) })),
    shades: STEPS.map((s) => ({ step: Math.round(s * 100), hex: mix(rgb, [0, 0, 0], s) })),
  };
}

/** Dark or light text, whichever reads better on this background. */
export function readableOn(hex: string) {
  const [r, g, b] = hexToRgb(hex);
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? "#1d1d1f" : "#ffffff";
}
