"use client";
import { useEffect, useRef, useState } from "react";
import type { FFmpeg } from "@ffmpeg/ffmpeg";
import Dropzone from "@/components/Dropzone";
import { downloadBlob, formatBytes, savedPercent } from "@/lib/format";
import { addUsage, remaining } from "@/lib/usage";

const CORE_BASE = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";
const EXTS = ["mp4", "mov", "webm"];

type Status = "idle" | "loading" | "running" | "done" | "error";

export default function VideoPage() {
  const [file, setFile] = useState<File | null>(null);
  const [height, setHeight] = useState(720);
  const [crf, setCrf] = useState(28);
  const [maxKbps, setMaxKbps] = useState(0);
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ url: string; size: number } | null>(null);
  const [limitBytes, setLimitBytes] = useState(300 * 1024 * 1024);
  const [isMobile, setIsMobile] = useState(false);

  const ffmpegRef = useRef<FFmpeg | null>(null);
  const cancelledRef = useRef(false);
  const resultUrlRef = useRef<string | null>(null);

  useEffect(() => {
    const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    setIsMobile(mobile);
    setLimitBytes(mobile ? 100 * 1024 * 1024 : 300 * 1024 * 1024);
    return () => {
      ffmpegRef.current?.terminate();
      ffmpegRef.current = null;
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    };
  }, []);

  function onFiles(files: File[]) {
    const f = files[0];
    setError("");
    const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
    const okType = ["video/mp4", "video/quicktime", "video/webm"].includes(f.type) || (f.type === "" && EXTS.includes(ext));
    if (!okType || !EXTS.includes(ext)) {
      setError("Unsupported format. Please choose an MP4, MOV or WebM video.");
      return;
    }
    if (f.size > limitBytes) {
      setError(
        `This file is ${formatBytes(f.size)}. The limit on ${isMobile ? "phones" : "this device"} is ${formatBytes(limitBytes)} to avoid running out of memory.`
      );
      return;
    }
    if (resultUrlRef.current) {
      URL.revokeObjectURL(resultUrlRef.current);
      resultUrlRef.current = null;
    }
    setResult(null);
    setProgress(0);
    setStatus("idle");
    setFile(f);
  }

  async function getFFmpeg(): Promise<FFmpeg> {
    if (ffmpegRef.current) return ffmpegRef.current;
    const [{ FFmpeg }, { toBlobURL }] = await Promise.all([import("@ffmpeg/ffmpeg"), import("@ffmpeg/util")]);
    const ff = new FFmpeg();
    ff.on("progress", ({ progress: p }) => {
      setProgress(Math.min(100, Math.max(0, Math.round(p * 100))));
    });
    await ff.load({
      coreURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, "application/wasm"),
    });
    ffmpegRef.current = ff;
    return ff;
  }

  async function run() {
    if (!file) return;
    if (typeof WebAssembly === "undefined") {
      setError("This browser does not support WebAssembly. Please use a recent Chrome.");
      return;
    }
    if (remaining("video") <= 0) {
      setError("You reached today's free limit for video compression. It resets tomorrow.");
      return;
    }
    cancelledRef.current = false;
    setError("");
    setResult(null);
    setProgress(0);
    let ff: FFmpeg | null = null;
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "mp4";
    const inName = `input.${EXTS.includes(ext) ? ext : "mp4"}`;
    try {
      setStatus("loading");
      ff = await getFFmpeg();
      if (cancelledRef.current) return;
      setStatus("running");
      const { fetchFile } = await import("@ffmpeg/util");
      await ff.writeFile(inName, await fetchFile(file));
      const args = [
        "-i", inName,
        "-vf", `scale=-2:'min(ih,${height})'`,
        "-c:v", "libx264",
        "-crf", String(crf),
        "-preset", "veryfast",
        ...(maxKbps > 0 ? ["-maxrate", `${maxKbps}k`, "-bufsize", `${maxKbps * 2}k`] : []),
        "-c:a", "aac",
        "-b:a", "128k",
        "-movflags", "+faststart",
        "-y", "output.mp4",
      ];
      const code = await ff.exec(args);
      if (cancelledRef.current) return;
      if (code !== 0) {
        throw new Error("The video could not be processed. The file may be damaged or use an unsupported codec.");
      }
      const data = await ff.readFile("output.mp4");
      const blob = new Blob([data as unknown as BlobPart], { type: "video/mp4" });
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
      const url = URL.createObjectURL(blob);
      resultUrlRef.current = url;
      setResult({ url, size: blob.size });
      setProgress(100);
      setStatus("done");
      addUsage("video");
    } catch (e) {
      if (cancelledRef.current) {
        setStatus("idle");
        return;
      }
      setStatus("error");
      setError(e instanceof Error ? e.message : "Compression failed.");
    } finally {
      if (ff && !cancelledRef.current && ffmpegRef.current) {
        try {
          await ff.deleteFile(inName);
        } catch {
          /* ignore */
        }
        try {
          await ff.deleteFile("output.mp4");
        } catch {
          /* ignore */
        }
      }
    }
  }

  function cancel() {
    cancelledRef.current = true;
    ffmpegRef.current?.terminate();
    ffmpegRef.current = null;
    setStatus("idle");
    setProgress(0);
  }

  const working = status === "loading" || status === "running";
  const outName = file ? `${file.name.replace(/\.[^.]+$/, "") || "video"}-linkpilot.mp4` : "video.mp4";

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <div>
        <h1 className="font-display text-3xl font-bold">Video Compressor</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Compressed on your device with FFmpeg (WebAssembly). Videos are never uploaded.
        </p>
      </div>

      <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-3 text-sm">
        Limit: {formatBytes(limitBytes)} per video{isMobile ? " on phones" : ""}. Compression is slow on phones —
        keep the screen on and keep this tab open. The first run downloads about 30 MB of the video engine.
      </div>

      <Dropzone
        accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm"
        onFiles={onFiles}
        title="Drop a video here or tap to choose"
        hint="MP4, MOV, WebM"
      />

      {error && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm" role="alert">
          {error}
        </div>
      )}

      {file && (
        <div className="card space-y-4">
          <div>
            <div className="truncate font-medium">{file.name}</div>
            <div className="text-xs text-slate-500">Original: {formatBytes(file.size)}</div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor="res">
                Resolution
              </label>
              <select id="res" className="input" value={height} disabled={working} onChange={(e) => setHeight(Number(e.target.value))}>
                <option value={1080}>1080p</option>
                <option value={720}>720p (recommended)</option>
                <option value={480}>480p</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="crf">
                Quality ({crf <= 24 ? "high" : crf <= 29 ? "balanced" : "small file"})
              </label>
              <input
                id="crf"
                type="range"
                min={20}
                max={36}
                value={crf}
                disabled={working}
                onChange={(e) => setCrf(Number(e.target.value))}
                className="w-full accent-cyan-500"
              />
              <div className="text-xs text-slate-500">CRF {crf} (lower = better quality, bigger file)</div>
            </div>
            <div>
              <label className="label" htmlFor="br">
                Max bitrate
              </label>
              <select id="br" className="input" value={maxKbps} disabled={working} onChange={(e) => setMaxKbps(Number(e.target.value))}>
                <option value={0}>Automatic</option>
                <option value={4000}>4000 kbps</option>
                <option value={2500}>2500 kbps</option>
                <option value={1500}>1500 kbps</option>
                <option value={800}>800 kbps</option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn" onClick={run} disabled={working}>
              {status === "loading" ? "Loading engine…" : status === "running" ? "Compressing…" : "Compress video"}
            </button>
            {working && (
              <button type="button" className="btn-ghost" onClick={cancel}>
                Cancel
              </button>
            )}
          </div>

          {working && (
            <div aria-live="polite">
              <div className="h-3 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-indigo-500 transition-all"
                  style={{ width: `${status === "loading" ? 5 : progress}%` }}
                />
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {status === "loading" ? "Downloading the video engine (first time only)…" : `${progress}%`}
              </div>
            </div>
          )}
        </div>
      )}

      {result && file && (
        <div className="card space-y-3" aria-live="polite">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <div className="label">Original</div>
              <div className="font-display text-xl font-bold">{formatBytes(file.size)}</div>
            </div>
            <div>
              <div className="label">Compressed</div>
              <div className="font-display text-xl font-bold">{formatBytes(result.size)}</div>
            </div>
            <div>
              <div className="label">Saved</div>
              <div
                className={`font-display text-xl font-bold ${result.size < file.size ? "text-emerald-500" : "text-amber-500"}`}
              >
                {result.size < file.size ? `${savedPercent(file.size, result.size)}%` : "No saving — keep original"}
              </div>
            </div>
          </div>
          <video src={result.url} controls playsInline className="w-full rounded-xl bg-black" />
          <button
            type="button"
            className="btn"
            onClick={async () => {
              const blob = await (await fetch(result.url)).blob();
              downloadBlob(blob, outName);
            }}
          >
            Download compressed video
          </button>
        </div>
      )}
    </main>
  );
}
