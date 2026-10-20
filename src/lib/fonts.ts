import { api } from "./api";

export type FontCategory = "sans-serif" | "serif" | "monospace" | "handwriting" | "display";

/** A short, curated set of Google Fonts that read well in notes. */
export const GOOGLE_FONTS: { name: string; category: FontCategory; weights?: string }[] = [
  { name: "Inter", category: "sans-serif" },
  { name: "Roboto", category: "sans-serif" },
  { name: "Open Sans", category: "sans-serif" },
  { name: "Lato", category: "sans-serif" },
  { name: "Montserrat", category: "sans-serif" },
  { name: "Poppins", category: "sans-serif" },
  { name: "Nunito", category: "sans-serif" },
  { name: "Source Sans 3", category: "sans-serif" },
  { name: "Work Sans", category: "sans-serif" },
  { name: "DM Sans", category: "sans-serif" },
  { name: "Manrope", category: "sans-serif" },
  { name: "Outfit", category: "sans-serif" },
  { name: "Raleway", category: "sans-serif" },
  { name: "IBM Plex Sans", category: "sans-serif" },
  { name: "Noto Sans", category: "sans-serif" },
  { name: "Space Grotesk", category: "sans-serif" },
  { name: "Quicksand", category: "sans-serif" },
  { name: "Merriweather", category: "serif" },
  { name: "Lora", category: "serif" },
  { name: "Playfair Display", category: "serif" },
  { name: "EB Garamond", category: "serif" },
  { name: "Libre Baskerville", category: "serif" },
  { name: "Crimson Pro", category: "serif" },
  { name: "Source Serif 4", category: "serif" },
  { name: "Roboto Slab", category: "serif" },
  { name: "IBM Plex Serif", category: "serif" },
  { name: "Noto Serif", category: "serif" },
  { name: "JetBrains Mono", category: "monospace" },
  { name: "Fira Code", category: "monospace" },
  { name: "IBM Plex Mono", category: "monospace" },
  { name: "Caveat", category: "handwriting" },
  { name: "Kalam", category: "handwriting" },
  { name: "Patrick Hand", category: "handwriting", weights: "400" },
  { name: "Dancing Script", category: "handwriting" },
  { name: "Comfortaa", category: "display" },
];

const GOOGLE_BY_NAME = new Map(GOOGLE_FONTS.map((f) => [f.name, f]));
const GENERIC: Record<FontCategory, string> = {
  "sans-serif": "sans-serif",
  serif: "serif",
  monospace: "monospace",
  handwriting: "cursive",
  display: "sans-serif",
};

const googleCss = (query: string) => `https://fonts.googleapis.com/css2?${query}&display=swap`;
const familyParam = (name: string) => `family=${name.replace(/ /g, "+")}`;

const injected = new Set<string>();
function addStylesheet(href: string) {
  if (injected.has(href)) return;
  injected.add(href);
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
}

/** Loads a Google Font once, only when a note actually uses it. */
export function loadGoogleFont(name: string) {
  const font = GOOGLE_BY_NAME.get(name);
  if (font) addStylesheet(googleCss(`${familyParam(name)}:wght@${font.weights ?? "400;700"}`));
}

/**
 * Loads just the letters of each font's own name, so the picker can preview
 * every font for a few hundred bytes instead of downloading them all.
 */
export function loadGooglePreviews() {
  const families = GOOGLE_FONTS.map((f) => familyParam(f.name)).join("&");
  const letters = [...new Set(GOOGLE_FONTS.map((f) => f.name).join(""))].join("");
  addStylesheet(googleCss(`${families}&text=${encodeURIComponent(letters)}`));
}

/** The CSS font-family value stored on the text, with a sensible fallback. */
export function fontStack(name: string): string {
  const fallback = GOOGLE_BY_NAME.get(name)?.category;
  return `"${name}", ${fallback ? GENERIC[fallback] : "sans-serif"}`;
}

/** The family name back out of a stored stack (`"Inter", sans-serif` → Inter). */
export function fontName(stack: string | null | undefined): string | null {
  if (!stack) return null;
  return stack.split(",")[0].trim().replace(/^["']|["']$/g, "") || null;
}

/** Makes sure every Google Font used anywhere in a note's content is loaded. */
export function loadFontsIn(content: unknown) {
  const visit = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const n = node as { marks?: { attrs?: { fontFamily?: string } }[]; content?: unknown[] };
    for (const m of n.marks ?? []) {
      const name = fontName(m.attrs?.fontFamily);
      if (name) loadGoogleFont(name);
    }
    n.content?.forEach(visit);
  };
  visit(content);
}

let systemFonts: Promise<string[]> | null = null;
/** Fonts installed on this PC, read once per session. */
export const listSystemFonts = () => (systemFonts ??= api.systemFonts().catch(() => []));
