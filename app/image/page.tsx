"use client";
import { useEffect, useRef, useState } from "react";
import JSZip from "jszip";
import Dropzone from "@/components/Dropzone";
import { downloadBlob, formatBytes, savedPercent } from "@/lib/format";
import { addUsage, remaining } from "@/lib/usage";

type Fmt = "image/webp" | "image/jpeg" | "image/png" | "image/avif";
type OutFmt = Fmt | "original";

const EXT: Record<Fmt, string> = {
  "image/webp": "webp",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/avif": "avif",
};
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/avif"];
const MAX_BYTES = 25 * 1024 * 1024;
const MAX_FILES = 30;

interface Item {
  id: string;
  file: File;
  origUrl: string;
  out?: Blob;
  outUrl?: string;
  outName?: string;
  status: "ready" | "working" | "done" | "error";
  error?: string;
  note?: string;
}

async function compressImage(file: File, fmt: Fmt, quality: number, maxW: number): Promise<Blob> {
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file);
  } catch {
    throw new Error("This file could not be read as an image (corrupted or unsupported).");
  }
  let w = bmp.width;
  let h = bmp.height;
  if (maxW > 0 && w > maxW) {
    h = Math.round((h * maxW) / w);
    w = maxW;
  }
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bmp.close();
    throw new Error("Canvas is not available in this browser.");
  }
  if (fmt === "image/jpeg") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
  }
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  if (fmt === "image/png") {
    // Smart PNG: reduce the number of colors (like TinyPNG) to shrink the file.
    const data = ctx.getImageData(0, 0, w, h);
    const UPNG = (await import("upng-js")).default;
    const cnum = quality >= 0.95 ? 0 : Math.min(256, Math.max(16, Math.round(quality * 256)));
    const buf = UPNG.encode([data.data.buffer as ArrayBuffer], w, h, cnum);
    canvas.width = 0;
    canvas.height = 0;
    return new Blob([buf], { type: "image/png" });
  }
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, fmt, quality));
  canvas.width = 0;
  canvas.height = 0;
  if (!blob) throw new Error("Compression failed.");
  if (blob.type !== fmt) {
    throw new Error(`Your browser cannot create ${EXT[fmt].toUpperCase()} files. Choose WebP or JPG.`);
  }
  return blob;
}

export default function ImagePage() {
  const [items, setItems] = useState<Item[]>([]);
  const [fmt, setFmt] = useState<OutFmt>("original");
  const [quality, setQuality] = useState(75);
  const [maxW, setMaxW] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const itemsRef = useRef<Item[]>([]);
  itemsRef.current = items;

  useEffect(() => {
    return () => {
      itemsRef.current.forEach((i) => {
        URL.revokeObjectURL(i.origUrl);
        if (i.outUrl) URL.revokeObjectURL(i.outUrl);
      });
    };
  }, []);

  function patch(id: string, p: Partial<Item>) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...p } : i)));
  }

  function addFiles(files: File[]) {
    setNotice("");
    const msgs: string[] = [];
    const accepted: Item[] = [];
    const room = MAX_FILES - items.length;
    for (const f of files) {
      if (!ALLOWED.includes(f.type)) {
        msgs.push(`"${f.name}": unsupported format (use JPG, PNG, WebP or AVIF).`);
        continue;
      }
      if (f.size > MAX_BYTES) {
        msgs.push(`"${f.name}": larger than ${formatBytes(MAX_BYTES)}.`);
        continue;
      }
      if (accepted.length >= room) {
        msgs.push(`Maximum ${MAX_FILES} images at a time.`);
        break;
      }
      accepted.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        file: f,
        origUrl: URL.createObjectURL(f),
        status: "ready",
      });
    }
    if (accepted.length) setItems((prev) => [...prev, ...accepted]);
    if (msgs.length) setNotice(Array.from(new Set(msgs)).join(" "));
  }

  function removeItem(id: string) {
    const it = items.find((i) => i.id === id);
    if (it) {
      URL.revokeObjectURL(it.origUrl);
      if (it.outUrl) URL.revokeObjectURL(it.outUrl);
    }
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  function clearAll() {
    items.forEach((i) => {
      URL.revokeObjectURL(i.origUrl);
      if (i.outUrl) URL.revokeObjectURL(i.outUrl);
    });
    setItems([]);
    setNotice("");
  }

  async function run() {
    setBusy(true);
    setNotice("");
    let left = remaining("image");
    if (left <= 0) {
      setNotice("You reached today's free limit for image compression. It resets tomorrow.");
      setBusy(false);
      return;
    }
    let skipped = 0;
    for (const it of items) {
      if (left <= 0) {
        skipped++;
        continue;
      }
      patch(it.id, { status: "working", error: undefined, note: undefined });
      try {
        const effFmt: Fmt =
          fmt === "original"
            ? it.file.type === "image/avif"
              ? "image/webp"
              : (it.file.type as Fmt)
            : fmt;
        let blob: Blob = await compressImage(it.file, effFmt, quality / 100, maxW);
        let note: string | undefined;
        if (blob.size >= it.file.size && effFmt === it.file.type && maxW === 0) {
          blob = it.file;
          note = "Already well optimized, so the original was kept.";
        } else if (fmt === "original" && it.file.type === "image/avif") {
          note = "AVIF input was saved as WebP.";
        }
        if (it.outUrl) URL.revokeObjectURL(it.outUrl);
        const base = it.file.name.replace(/\.[^.]+$/, "") || "image";
        patch(it.id, {
          out: blob,
          outUrl: URL.createObjectURL(blob),
          outName: `${base}-linkpilot.${EXT[effFmt]}`,
          status: "done",
          note,
        });
        addUsage("image");
        left--;
      } catch (e) {
        patch(it.id, { status: "error", error: e instanceof Error ? e.message : "Failed" });
      }
    }
    if (skipped) setNotice(`${skipped} image(s) skipped: daily free limit reached.`);
    setBusy(false);
  }

  async function downloadZip() {
    const zip = new JSZip();
    const used = new Set<string>();
    for (const it of items) {
      if (!it.out || !it.outName) continue;
      let name = it.outName;
      let n = 1;
      while (used.has(name)) {
        name = it.outName.replace(/(\.[^.]+)$/, `-${n++}$1`);
      }
      used.add(name);
      zip.file(name, it.out);
    }
    const blob = await zip.generateAsync({ type: "blob" });
    downloadBlob(blob, "linkpilot-images.zip");
  }

  const done = items.filter((i) => i.status === "done" && i.out);
  const origTotal = done.reduce((s, i) => s + i.file.size, 0);
  const outTotal = done.reduce((s, i) => s + (i.out?.size ?? 0), 0);

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <div>
        <h1 className="font-display text-3xl font-bold">Image Compressor</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Runs entirely in your browser. Your images are never uploaded.
        </p>
      </div>

      <Dropzone
        accept="image/jpeg,image/png,image/webp,image/avif"
        multiple
        onFiles={addFiles}
        title="Drop images here or tap to choose"
        hint={`JPG, PNG, WebP, AVIF · up to ${MAX_FILES} files · max ${formatBytes(MAX_BYTES)} each`}
      />

      {notice && (
        <div className="rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 text-sm" role="alert">
          {notice}
        </div>
      )}

      {items.length > 0 && (
        <>
          <div className="card grid gap-4 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor="fmt">
                Output format
              </label>
              <select id="fmt" className="input" value={fmt} onChange={(e) => setFmt(e.target.value as OutFmt)}>
                <option value="original">Same as original (smart, like TinyPNG)</option>
                <option value="image/webp">WebP (smallest for web)</option>
                <option value="image/jpeg">JPG</option>
                <option value="image/png">PNG (smart color reduction)</option>
                <option value="image/avif">AVIF (only some browsers)</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="q">
                Quality: {quality}%
              </label>
              <input
                id="q"
                type="range"
                min={10}
                max={100}
                value={quality}
                onChange={(e) => setQuality(Number(e.target.value))}
                className="w-full accent-cyan-500"
              />
              <div className="text-xs text-slate-500">
                {fmt === "image/png" || fmt === "original"
                  ? "PNG: lower quality = fewer colors = smaller file. 95%+ keeps PNG lossless."
                  : "Lower quality = smaller file."}
              </div>
            </div>
            <div>
              <label className="label" htmlFor="mw">
                Max width
              </label>
              <select id="mw" className="input" value={maxW} onChange={(e) => setMaxW(Number(e.target.value))}>
                <option value={0}>Original size</option>
                <option value={3840}>3840 px (4K)</option>
                <option value={1920}>1920 px (Full HD)</option>
                <option value={1280}>1280 px</option>
                <option value={1024}>1024 px</option>
                <option value={800}>800 px</option>
                <option value={480}>480 px</option>
              </select>
            </div>
            <div className="flex flex-wrap gap-2 sm:col-span-3">
              <button type="button" className="btn" onClick={run} disabled={busy}>
                {busy ? "Compressing…" : "Compress"}
              </button>
              <button type="button" className="btn-ghost" onClick={downloadZip} disabled={done.length === 0 || busy}>
                Download ZIP ({done.length})
              </button>
              <button type="button" className="btn-ghost" onClick={clearAll} disabled={busy}>
                Clear all
              </button>
            </div>
          </div>

          {done.length > 0 && (
            <div className="card flex flex-wrap items-center gap-x-8 gap-y-2" aria-live="polite">
              <div>
                <div className="label">Total saved</div>
                <div className="font-display text-2xl font-bold text-emerald-500">
                  {formatBytes(Math.max(0, origTotal - outTotal))} ({savedPercent(origTotal, outTotal)}%)
                </div>
              </div>
              <div className="text-sm text-slate-600 dark:text-slate-400">
                {formatBytes(origTotal)} → {formatBytes(outTotal)} across {done.length} image(s)
              </div>
            </div>
          )}

          <ul className="space-y-3">
            {items.map((it) => (
              <li key={it.id} className="card">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{it.file.name}</div>
                    <div className="text-xs text-slate-500">
                      {formatBytes(it.file.size)}
                      {it.out && (
                        <>
                          {" → "}
                          <strong>{formatBytes(it.out.size)}</strong>{" "}
                          {it.out.size < it.file.size ? (
                            <span className="text-emerald-500">
                              (saved {savedPercent(it.file.size, it.out.size)}%)
                            </span>
                          ) : (
                            <span className="text-amber-500">(larger — keep the original)</span>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {it.status === "done" && it.outUrl && it.outName && (
                      <a href={it.outUrl} download={it.outName} className="btn-ghost !px-3 !py-1.5">
                        Download
                      </a>
                    )}
                    <button
                      type="button"
                      className="btn-ghost !px-3 !py-1.5"
                      onClick={() => removeItem(it.id)}
                      disabled={it.status === "working"}
                      aria-label={`Remove ${it.file.name}`}
                    >
                      ✕
                    </button>
                  </div>
                </div>
                {it.status === "working" && <div className="mt-2 text-sm text-cyan-500">Compressing…</div>}
                {it.note && <div className="mt-2 text-xs text-slate-500">{it.note}</div>}
                {it.status === "error" && (
                  <div className="mt-2 text-sm text-red-500" role="alert">
                    {it.error}
                  </div>
                )}
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <figure>
                    <figcaption className="label">Before</figcaption>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={it.origUrl} alt={`Original ${it.file.name}`} className="h-40 w-full rounded-lg bg-slate-200 object-contain dark:bg-white/5" />
                  </figure>
                  <figure>
                    <figcaption className="label">After</figcaption>
                    {it.outUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={it.outUrl} alt={`Compressed ${it.file.name}`} className="h-40 w-full rounded-lg bg-slate-200 object-contain dark:bg-white/5" />
                    ) : (
                      <div className="flex h-40 items-center justify-center rounded-lg bg-slate-200 text-xs text-slate-500 dark:bg-white/5">
                        Not compressed yet
                      </div>
                    )}
                  </figure>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
