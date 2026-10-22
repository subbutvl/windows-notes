import { invoke } from "@tauri-apps/api/core";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import type { DragEvent } from "react";

/**
 * Shared helpers for the image and audio tools. Everything stays in memory
 * until the user saves a result; nothing is kept after the tool closes.
 */

/** Opens the system file picker and resolves with the chosen files (none if cancelled). */
export function pickFiles(accept: string, multiple = false): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.multiple = multiple;
    input.onchange = () => resolve([...(input.files ?? [])]);
    input.oncancel = () => resolve([]);
    input.click();
  });
}

/** Files dropped on an element, filtered by MIME prefix or extension. */
export function droppedFiles(e: DragEvent, accept: (f: File) => boolean) {
  e.preventDefault();
  return [...e.dataTransfer.files].filter(accept);
}

export const isImage = (f: File) => f.type.startsWith("image/") || /\.(svg|png|jpe?g|webp|gif|bmp|ico|avif)$/i.test(f.name);

/** Decodes an image file (SVG included) into something a canvas can draw. */
export async function loadImage(file: Blob): Promise<{ image: CanvasImageSource; width: number; height: number; close(): void }> {
  const svg = file.type === "image/svg+xml" || (file instanceof File && /\.svg$/i.test(file.name));
  if (!svg) {
    const bitmap = await createImageBitmap(file);
    return { image: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  try {
    await img.decode();
  } catch {
    URL.revokeObjectURL(url);
    throw new Error("couldn't read that SVG");
  }
  // SVGs without a size get 1024 px on the long side.
  const w = img.naturalWidth || 1024;
  const h = img.naturalHeight || 1024;
  return { image: img, width: w, height: h, close: () => URL.revokeObjectURL(url) };
}

export function canvasOf(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return { canvas, ctx: canvas.getContext("2d")! };
}

export function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("couldn't encode the image"))), type, quality));
}

/** 24-bit BMP, which canvases can't write themselves. */
export function toBmp(canvas: HTMLCanvasElement): Blob {
  const { width: w, height: h } = canvas;
  const data = canvas.getContext("2d")!.getImageData(0, 0, w, h).data;
  const row = Math.ceil((w * 3) / 4) * 4;
  const buf = new ArrayBuffer(54 + row * h);
  const v = new DataView(buf);
  v.setUint16(0, 0x4d42, true);
  v.setUint32(2, buf.byteLength, true);
  v.setUint32(10, 54, true);
  v.setUint32(14, 40, true);
  v.setInt32(18, w, true);
  v.setInt32(22, h, true);
  v.setUint16(26, 1, true);
  v.setUint16(28, 24, true);
  v.setUint32(34, row * h, true);
  const out = new Uint8Array(buf);
  for (let y = 0; y < h; y++) {
    const dst = 54 + (h - 1 - y) * row;
    for (let x = 0; x < w; x++) {
      const src = (y * w + x) * 4;
      out[dst + x * 3] = data[src + 2];
      out[dst + x * 3 + 1] = data[src + 1];
      out[dst + x * 3 + 2] = data[src];
    }
  }
  return new Blob([buf], { type: "image/bmp" });
}

/** An .ico holding one PNG per size (Windows Vista and later read PNG icons). */
export async function toIco(pngs: { size: number; blob: Blob }[]): Promise<Blob> {
  const images = await Promise.all(pngs.map(async (p) => ({ size: p.size, bytes: new Uint8Array(await p.blob.arrayBuffer()) })));
  const header = new DataView(new ArrayBuffer(6 + 16 * images.length));
  header.setUint16(2, 1, true);
  header.setUint16(4, images.length, true);
  let offset = header.byteLength;
  images.forEach((img, i) => {
    const at = 6 + i * 16;
    header.setUint8(at, img.size >= 256 ? 0 : img.size);
    header.setUint8(at + 1, img.size >= 256 ? 0 : img.size);
    header.setUint16(at + 4, 1, true);
    header.setUint16(at + 6, 32, true);
    header.setUint32(at + 8, img.bytes.length, true);
    header.setUint32(at + 12, offset, true);
    offset += img.bytes.length;
  });
  return new Blob([header.buffer, ...images.map((i) => i.bytes)], { type: "image/x-icon" });
}

/** A macOS .icns holding PNGs (16 to 1024 px). */
export async function toIcns(pngs: { size: number; blob: Blob }[]): Promise<Blob> {
  const TYPES: Record<number, string[]> = { 16: ["icp4"], 32: ["icp5", "ic11"], 64: ["icp6", "ic12"], 128: ["ic07"], 256: ["ic08", "ic13"], 512: ["ic09", "ic14"], 1024: ["ic10"] };
  const parts: Uint8Array[] = [];
  for (const p of pngs) {
    const bytes = new Uint8Array(await p.blob.arrayBuffer());
    for (const type of TYPES[p.size] ?? []) {
      const head = new Uint8Array(8);
      for (let i = 0; i < 4; i++) head[i] = type.charCodeAt(i);
      new DataView(head.buffer).setUint32(4, bytes.length + 8);
      parts.push(head, bytes);
    }
  }
  const total = 8 + parts.reduce((n, p) => n + p.length, 0);
  const head = new Uint8Array(8);
  head.set([0x69, 0x63, 0x6e, 0x73]);
  new DataView(head.buffer).setUint32(4, total);
  return new Blob([head, ...parts] as BlobPart[], { type: "image/icns" });
}

/** Writes bytes to a full path through the app (folders are made as needed). */
export async function writeFile(path: string, data: Blob | Uint8Array) {
  const bytes = data instanceof Blob ? new Uint8Array(await data.arrayBuffer()) : data;
  await invoke("save_file", bytes, { headers: { path: encodeURIComponent(path) } });
}

/** Asks where to save one file, then writes it. Returns the path, or null if cancelled. */
export async function saveAs(data: Blob, defaultName: string, filter: { name: string; extensions: string[] }) {
  const path = await saveDialog({ defaultPath: defaultName, filters: [filter] });
  if (!path) return null;
  await writeFile(path, data);
  return path;
}

/** Asks for a folder. Returns its path, or null if cancelled. */
export async function pickFolder(title: string) {
  const dir = await openDialog({ directory: true, title });
  return typeof dir === "string" ? dir : null;
}

export const joinPath = (dir: string, ...parts: string[]) => [dir.replace(/[\\/]+$/, ""), ...parts].join("\\");

/** "photo.final.jpg" → "photo.final". */
export const baseName = (name: string) => name.replace(/\.[^.]+$/, "") || "image";

export const prettyBytes = (n: number) => (n < 1024 ? `${n} B` : n < 1024 ** 2 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 ** 2).toFixed(1)} MB`);
