"use client";
import { useState } from "react";
import { formatBytes } from "@/lib/format";
import { addUsage, remaining } from "@/lib/usage";

interface ImageInfo {
  url: string;
  size: number | null;
  type: string | null;
  flags: string[];
}
interface AssetInfo {
  url: string;
  kind: "script" | "stylesheet";
  size: number | null;
}
interface Report {
  pageUrl: string;
  htmlBytes: number;
  htmlTruncated: boolean;
  compression: string | null;
  counts: { images: number; scripts: number; stylesheets: number };
  totalKnownBytes: number;
  images: ImageInfo[];
  assets: AssetInfo[];
  suggestions: string[];
}

const FLAG_TEXT: Record<string, string> = {
  huge: "over 1 MB",
  large: "over 200 KB",
  "legacy-format": "use WebP/AVIF",
  "no-dimensions": "no width/height",
  "no-alt": "no alt text",
  "not-lazy": "not lazy-loaded",
};

export default function PerformancePage() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] = useState<Report | null>(null);

  async function analyze(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim() || loading) return;
    if (remaining("perf") <= 0) {
      setError("You reached today's free limit for performance scans. It resets tomorrow.");
      return;
    }
    setLoading(true);
    setError("");
    setReport(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = (await res.json().catch(() => null)) as (Report & { error?: string }) | null;
      if (!res.ok || !data || data.error) {
        setError(data?.error ?? "Something went wrong. Please try again.");
      } else {
        setReport(data);
        addUsage("perf");
      }
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <div>
        <h1 className="font-display text-3xl font-bold">Website Performance Check</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Measures page weight and finds oversized images. This is a quick size audit, not a full speed test.
        </p>
      </div>

      <form onSubmit={analyze} className="card flex flex-col gap-3 sm:flex-row">
        <label htmlFor="pu" className="sr-only">
          Website URL
        </label>
        <input
          id="pu"
          className="input"
          type="text"
          inputMode="url"
          placeholder="https://example.com"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          autoComplete="off"
        />
        <button type="submit" className="btn sm:w-40" disabled={loading || !url.trim()}>
          {loading ? "Analyzing…" : "Analyze"}
        </button>
      </form>

      {loading && (
        <div className="card text-sm text-cyan-500" aria-live="polite">
          Analyzing… this can take up to a minute.
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm" role="alert">
          {error}
        </div>
      )}

      {report && (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="card">
              <div className="label">Measured weight</div>
              <div className="font-display text-2xl font-bold">{formatBytes(report.totalKnownBytes)}</div>
            </div>
            <div className="card">
              <div className="label">HTML</div>
              <div className="font-display text-2xl font-bold">{formatBytes(report.htmlBytes)}</div>
            </div>
            <div className="card">
              <div className="label">Images</div>
              <div className="font-display text-2xl font-bold">{report.counts.images}</div>
            </div>
            <div className="card">
              <div className="label">Scripts / CSS</div>
              <div className="font-display text-2xl font-bold">
                {report.counts.scripts} / {report.counts.stylesheets}
              </div>
            </div>
          </div>

          <div className="card">
            <h2 className="font-display text-lg font-semibold">Suggestions</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
              {report.suggestions.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-slate-500">
              Weight counts the HTML plus the images, scripts and stylesheets whose size the server reported (first
              30 images and 20 scripts/CSS). Images loaded by JavaScript or CSS are not included.
            </p>
          </div>

          <div className="card overflow-x-auto !p-0">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase text-slate-500 dark:border-white/10">
                <tr>
                  <th className="px-4 py-3">Image</th>
                  <th className="px-4 py-3">Size</th>
                  <th className="px-4 py-3">Notes</th>
                </tr>
              </thead>
              <tbody>
                {report.images.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-6 text-center text-slate-500">
                      No images found in the HTML.
                    </td>
                  </tr>
                )}
                {report.images.map((i) => (
                  <tr key={i.url} className="border-b border-slate-100 last:border-0 dark:border-white/5">
                    <td className="max-w-[16rem] break-all px-4 py-3 sm:max-w-md">{i.url}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-medium">
                      {i.size === null ? "unknown" : formatBytes(i.size)}
                    </td>
                    <td className="px-4 py-3 text-xs text-amber-600 dark:text-amber-400">
                      {i.flags.map((f) => FLAG_TEXT[f] ?? f).join(" · ") || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  );
}
