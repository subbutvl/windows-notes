import { useEffect, useState } from "react";
import { AudioIcon } from "../components/Icons";
import { useNotes } from "../lib/store";
import { baseName, droppedFiles, joinPath, pickFiles, pickFolder, prettyBytes, saveAs, writeFile } from "./media";

const FORMATS = {
  mp3: { label: "MP3", ext: "mp3", mime: "audio/mpeg", lossy: true },
  aac: { label: "AAC", ext: "aac", mime: "audio/aac", lossy: true },
  wav: { label: "WAV", ext: "wav", mime: "audio/wav", lossy: false },
} as const;
type Format = keyof typeof FORMATS;
const BITRATES = [96, 128, 160, 192, 256, 320];

const isAudio = (f: File) => f.type.startsWith("audio/") || /\.(mp3|wav|aac|m4a|ogg|oga|opus|flac|weba|webm|wma|aif|aiff)$/i.test(f.name);

/**
 * Reads the sample rate from a WAV, MP3 or ADTS AAC header, so "Keep" keeps it.
 * The WebView decodes everything else at its own rate (usually 48 kHz).
 */
function headerRate(buf: ArrayBuffer): number | null {
  const b = new Uint8Array(buf);
  const tag = (i: number) => String.fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3]);
  const v = new DataView(buf);
  if (b.length > 12 && tag(0) === "RIFF" && tag(8) === "WAVE") {
    for (let i = 12; i + 16 <= b.length; i += 8 + v.getUint32(i + 4, true) + (v.getUint32(i + 4, true) & 1)) {
      if (tag(i) === "fmt ") return v.getUint32(i + 12, true);
    }
    return null;
  }
  // Skip an ID3 tag, then look for the first frame header.
  let i = b.length > 10 && tag(0).startsWith("ID3") ? 10 + ((b[6] << 21) | (b[7] << 14) | (b[8] << 7) | b[9]) : 0;
  for (const end = Math.min(b.length - 4, i + 65536); i < end; i++) {
    if (b[i] !== 0xff || (b[i + 1] & 0xe0) !== 0xe0) continue;
    if ((b[i + 1] & 0xf6) === 0xf0) {
      const aac = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350][(b[i + 2] >> 2) & 0x0f];
      if (aac) return aac;
      continue;
    }
    const version = (b[i + 1] >> 3) & 3; // 3 = MPEG 1, 2 = MPEG 2, 0 = MPEG 2.5
    const base = [44100, 48000, 32000][(b[i + 2] >> 2) & 3];
    if (version === 1 || ((b[i + 1] >> 1) & 3) === 0 || !base) continue;
    return version === 3 ? base : version === 2 ? base / 2 : base / 4;
  }
  return null;
}

/** Decodes any audio the WebView can play, resampled and mixed to the chosen rate and channels. */
async function decode(file: File, sampleRate: number | null, channels: 1 | 2 | null) {
  const data = await file.arrayBuffer();
  const native = headerRate(data);
  let ctx: AudioContext;
  try {
    ctx = new AudioContext(native ? { sampleRate: native } : undefined);
  } catch {
    ctx = new AudioContext();
  }
  try {
    const decoded = await ctx.decodeAudioData(data);
    const rate = sampleRate ?? decoded.sampleRate;
    const count = channels ?? (Math.min(decoded.numberOfChannels, 2) as 1 | 2);
    if (rate === decoded.sampleRate && count === decoded.numberOfChannels) return decoded;
    const offline = new OfflineAudioContext(count, Math.ceil(decoded.duration * rate), rate);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    return await offline.startRendering();
  } finally {
    void ctx.close();
  }
}

const channelData = (b: AudioBuffer) => Array.from({ length: Math.min(b.numberOfChannels, 2) }, (_, i) => b.getChannelData(i));

function toWav(b: AudioBuffer): Blob {
  const chans = channelData(b);
  const frames = b.length;
  const bytes = frames * chans.length * 2;
  const buf = new ArrayBuffer(44 + bytes);
  const v = new DataView(buf);
  const str = (at: number, s: string) => [...s].forEach((c, i) => v.setUint8(at + i, c.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + bytes, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, chans.length, true);
  v.setUint32(24, b.sampleRate, true);
  v.setUint32(28, b.sampleRate * chans.length * 2, true);
  v.setUint16(32, chans.length * 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, bytes, true);
  let at = 44;
  for (let i = 0; i < frames; i++) {
    for (const c of chans) {
      const s = Math.max(-1, Math.min(1, c[i]));
      v.setInt16(at, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      at += 2;
    }
  }
  return new Blob([buf], { type: "audio/wav" });
}

function toMp3(b: AudioBuffer, kbps: number, onProgress: (p: number) => void): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./mp3.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e) => {
      if (e.data.progress !== undefined) onProgress(e.data.progress);
      if (e.data.done) {
        resolve(new Blob([e.data.done], { type: "audio/mpeg" }));
        worker.terminate();
      }
    };
    worker.onerror = (e) => {
      reject(new Error(e.message || "MP3 encoding failed"));
      worker.terminate();
    };
    // MP3 supports 32, 44.1 and 48 kHz (and lower); other rates are resampled before this.
    worker.postMessage({ channels: channelData(b).map((c) => c.slice()), sampleRate: b.sampleRate, kbps });
  });
}

/** AAC in ADTS frames (.aac) with the WebView's own encoder. */
async function toAac(b: AudioBuffer, kbps: number, onProgress: (p: number) => void): Promise<Blob> {
  if (typeof AudioEncoder === "undefined") throw new Error("this version of WebView2 can't encode AAC");
  const numberOfChannels = Math.min(b.numberOfChannels, 2);
  const config: AudioEncoderConfig & { aac: { format: "adts" } } = { codec: "mp4a.40.2", sampleRate: b.sampleRate, numberOfChannels, bitrate: kbps * 1000, aac: { format: "adts" } };
  const support = await AudioEncoder.isConfigSupported(config);
  if (!support.supported) throw new Error(`AAC at ${b.sampleRate / 1000} kHz isn't supported here; try 44.1 or 48 kHz`);
  const parts: Uint8Array[] = [];
  let failure: Error | null = null;
  const encoder = new AudioEncoder({
    output: (chunk) => {
      const bytes = new Uint8Array(chunk.byteLength);
      chunk.copyTo(bytes);
      parts.push(bytes);
    },
    error: (e) => (failure = e as Error),
  });
  encoder.configure(config);
  const chans = channelData(b);
  const block = 1024 * 32;
  for (let i = 0; i < b.length; i += block) {
    const frames = Math.min(block, b.length - i);
    const planar = new Float32Array(frames * numberOfChannels);
    chans.forEach((c, ch) => planar.set(c.subarray(i, i + frames), ch * frames));
    const data = new AudioData({ format: "f32-planar", sampleRate: b.sampleRate, numberOfFrames: frames, numberOfChannels, timestamp: Math.round((i / b.sampleRate) * 1e6), data: planar });
    encoder.encode(data);
    data.close();
    if ((i / block) % 20 === 0) {
      onProgress(i / b.length);
      await new Promise((r) => setTimeout(r));
    }
  }
  await encoder.flush();
  encoder.close();
  if (failure) throw failure;
  return new Blob(parts as BlobPart[], { type: "audio/aac" });
}

async function convert(file: File, format: Format, kbps: number, rate: number | null, channels: 1 | 2 | null, onProgress: (p: number) => void) {
  // MP3 can't hold rates like 96 kHz; bring them to 48 kHz.
  const sourceRate = rate ?? null;
  const buffer = await decode(file, format === "mp3" && !sourceRate ? null : sourceRate, channels);
  const fixed = format === "mp3" && ![8000, 11025, 12000, 16000, 22050, 24000, 32000, 44100, 48000].includes(buffer.sampleRate) ? await decode(file, 48000, channels) : buffer;
  if (format === "wav") return toWav(fixed);
  if (format === "mp3") return toMp3(fixed, kbps, onProgress);
  return toAac(fixed, kbps, onProgress);
}

const duration = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

/** Converts audio between MP3, AAC and WAV. Anything the WebView can play can be read. */
export function AudioConverter() {
  const [files, setFiles] = useState<File[]>([]);
  const [info, setInfo] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [format, setFormat] = useState<Format>("mp3");
  const [kbps, setKbps] = useState(192);
  const [rate, setRate] = useState<number | null>(null);
  const [channels, setChannels] = useState<1 | 2 | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  const add = async (picked: File[]) => {
    const audio = picked.filter(isAudio);
    if (!audio.length) return;
    setFiles(audio);
    setStatus(null);
    setPreview(audio.length === 1 ? URL.createObjectURL(audio[0]) : null);
    if (audio.length === 1) {
      try {
        const b = await decode(audio[0], null, null);
        setInfo(`${duration(b.duration)} · ${b.sampleRate / 1000} kHz · ${b.numberOfChannels === 1 ? "mono" : "stereo"} · ${prettyBytes(audio[0].size)}`);
      } catch {
        setInfo("This file can't be read.");
      }
    } else setInfo(`${audio.length} files`);
  };

  const run = async () => {
    setBusy(true);
    const f = FORMATS[format];
    const progress = (name: string) => (p: number) => setStatus(`Encoding ${name}… ${Math.round(p * 100)}%`);
    try {
      if (files.length === 1) {
        setStatus("Decoding…");
        const blob = await convert(files[0], format, kbps, rate, channels, progress(files[0].name));
        const path = await saveAs(blob, `${baseName(files[0].name)}.${f.ext}`, { name: f.label, extensions: [f.ext] });
        setStatus(path ? `Saved ${prettyBytes(blob.size)} to ${path}` : null);
      } else {
        const dir = await pickFolder(`Save ${files.length} ${f.label} files to`);
        if (!dir) return setStatus(null);
        for (const file of files) await writeFile(joinPath(dir, `${baseName(file.name)}.${f.ext}`), await convert(file, format, kbps, rate, channels, progress(file.name)));
        setStatus(`Saved ${files.length} files to ${dir}`);
      }
    } catch (e) {
      useNotes.setState({ error: `Couldn't convert: ${e instanceof Error ? e.message : e}` });
      setStatus(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="tool-body">
      <button className="drop-zone" onClick={async () => add(await pickFiles("audio/*,.m4a,.flac,.opus", true))} onDragOver={(e) => e.preventDefault()} onDrop={(e) => add(droppedFiles(e, isAudio))}>
        <AudioIcon size={28} />
        <span>{files.length ? (files.length === 1 ? files[0].name : `${files.length} files`) : "Drop audio here or click to choose"}</span>
        <small>{info ?? "MP3, WAV, AAC, M4A, OGG, OPUS, FLAC, WEBM"}</small>
      </button>
      {preview && <audio className="audio-preview" controls src={preview} />}

      <div className="chip-row" role="group" aria-label="Convert to">
        {(Object.keys(FORMATS) as Format[]).map((k) => (
          <button key={k} className={`chip${format === k ? " is-on" : ""}`} aria-pressed={format === k} onClick={() => setFormat(k)}>
            {FORMATS[k].label}
          </button>
        ))}
      </div>
      <div className="photo-grid">
        <label className="photo-field">
          <span>Bitrate</span>
          <select className="tool-input" value={kbps} disabled={!FORMATS[format].lossy} onChange={(e) => setKbps(Number(e.target.value))}>
            {BITRATES.map((b) => (
              <option key={b} value={b}>
                {b} kbps
              </option>
            ))}
          </select>
        </label>
        <label className="photo-field">
          <span>Sample rate</span>
          <select className="tool-input" value={rate ?? ""} onChange={(e) => setRate(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Keep</option>
            <option value={44100}>44.1 kHz</option>
            <option value={48000}>48 kHz</option>
            <option value={22050}>22.05 kHz</option>
          </select>
        </label>
        <label className="photo-field">
          <span>Channels</span>
          <select className="tool-input" value={channels ?? ""} onChange={(e) => setChannels(e.target.value ? (Number(e.target.value) as 1 | 2) : null)}>
            <option value="">Keep</option>
            <option value={2}>Stereo</option>
            <option value={1}>Mono</option>
          </select>
        </label>
      </div>

      <div className="tool-actions">
        <button className="text-button" disabled={!files.length || busy} onClick={run}>
          {files.length > 1 ? `Convert ${files.length} and Save…` : "Convert and Save…"}
        </button>
      </div>
      {status && <p className="tool-hint">{status}</p>}
      <p className="tool-hint">Everything happens on this PC. Long files use memory while converting and free it when done.</p>
    </div>
  );
}
