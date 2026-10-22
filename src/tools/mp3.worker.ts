/// <reference lib="webworker" />
import { Mp3Encoder } from "@breezystack/lamejs";

/** Encodes PCM to MP3 off the main thread so the app stays responsive. */
self.onmessage = (e: MessageEvent<{ channels: Float32Array[]; sampleRate: number; kbps: number }>) => {
  const { channels, sampleRate, kbps } = e.data;
  const toInt16 = (f: Float32Array) => {
    const out = new Int16Array(f.length);
    for (let i = 0; i < f.length; i++) {
      const s = Math.max(-1, Math.min(1, f[i]));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return out;
  };
  const left = toInt16(channels[0]);
  const right = channels[1] ? toInt16(channels[1]) : undefined;
  const encoder = new Mp3Encoder(channels.length, sampleRate, kbps);
  const parts: Uint8Array[] = [];
  const block = 1152 * 20;
  for (let i = 0; i < left.length; i += block) {
    const chunk = right ? encoder.encodeBuffer(left.subarray(i, i + block), right.subarray(i, i + block)) : encoder.encodeBuffer(left.subarray(i, i + block));
    if (chunk.length) parts.push(new Uint8Array(chunk));
    if ((i / block) % 20 === 0) self.postMessage({ progress: i / left.length });
  }
  const end = encoder.flush();
  if (end.length) parts.push(new Uint8Array(end));
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  self.postMessage({ done: out }, [out.buffer]);
};
