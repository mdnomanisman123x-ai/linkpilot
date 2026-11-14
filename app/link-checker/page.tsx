"use client";
import { useState } from "react";
import { csvEscape, downloadBlob } from "@/lib/format";
import { addUsage, remaining } from "@/lib/usage";

interface LinkResult {
  url: string;
  kind: "internal" | "external";
  status: number | null;
  ok: boolean;
  redirected: boolean;
  redirectStatus: number | null;
  finalUrl: string | null;
  error: string | null;
}
interface Report {
  pageUrl: string;
  totalFound: number;
  checked: number;
  truncated: boolean;
  summary: { broken: number; redirects: number; internal: number; external: number };
  results: LinkResult[];
}

type Filter = "all" | "broken" | "redirects" | "internal" | "external";

export default function LinkCheckerPage() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  async function scan(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim() || loading) return;
    if (remaining("link") <= 0) {
      setError("You reached today's free limit for link scans. It resets tomorrow.");
      return;
    }
    setLoading(true);
    setError("");
    setReport(null);
    try {
      const res = await fetch("/api/link-check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = (await res.json().catch(() => null)) as (Report & { error?: string }) | null;
      if (!res.ok || !data || data.error) {
        setError(data?.error ?? "Something went wrong. Please try again.");
      } else {
        setReport(data);
        setFilter("all");
        addUsage("link");
      }
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  function statusLabel(r: LinkResult): string {
    if (r.error) return r.error;
    if (r.redirected) return `${r.redirectStatus ?? 301} → ${r.status}`;
    return String(r.status);
  }

  const rows = (report?.results ?? []).filter((r) => {
    if (filter === "broken") return !r.ok;
    if (filter === "redirects") return r.redirected;
    if (filter === "internal") return r.kind === "internal";
    if (filter === "external") return r.kind === "external";
    return true;
  });

  function exportCsv() {
    if (!report) return;
    const head = ["url", "type", "status", "redirect_to", "error"].map(csvEscape).join(",");
    const lines = report.results.map((r) =>
      [r.url, r.kind, r.status, r.finalUrl, r.error].map(csvEscape).join(",")
    );
    downloadBlob(new Blob([[head, ...lines].join("\n")], { type: "text/csv" }), "linkpilot-link-report.csv");
  }

  function exportJson() {
    if (!report) return;
    downloadBlob(
      new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }),
      "linkpilot-link-report.json"
    );
  }

  const tabs: { id: Filter; label: string; count: number }[] = report
    ? [
        { id: "all", label: "All", count: report.checked },
        { id: "broken", label: "Broken", count: report.summary.broken },
        { id: "redirects", label: "Redirects", count: report.summary.redirects },
        { id: "internal", label: "Internal", count: report.summary.internal },
        { id: "external", label: "External", count: report.summary.external },
      ]
    : [];

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <div>
        <h1 className="font-display text-3xl font-bold">Website Link Checker</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Enter a page URL. LinkPilot checks the links found on that page (up to 60).
        </p>
      </div>

      <form onSubmit={scan} className="card flex flex-col gap-3 sm:flex-row">
        <label htmlFor="u" className="sr-only">
          Website URL
        </label>
        <input
          id="u"
          className="input"
          type="text"
          inputMode="url"
          placeholder="https://example.com"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          autoComplete="off"
        />
        <button type="submit" className="btn sm:w-40" disabled={loading || !url.trim()}>
          {loading ? "Scanning…" : "Check links"}
        </button>
      </form>

      {loading && (
        <div className="card text-sm text-cyan-500" aria-live="polite">
          Scanning… this can take up to a minute for pages with many links.
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm" role="alert">
          {error}
        </div>
      )}

      {report && (
        <>
          <div className="card space-y-1 text-sm">
            <div>
              Page: <span className="break-all font-medium">{report.pageUrl}</span>
            </div>
            <div className="text-slate-500">
              Found {report.totalFound} link(s), checked {report.checked}.
              {report.truncated && " Only the first 60 were checked in this free version."}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setFilter(t.id)}
                className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                  filter === t.id
                    ? "bg-cyan-500 text-white"
                    : "bg-slate-200/70 dark:bg-white/10"
                }`}
              >
                {t.label} ({t.count})
              </button>
            ))}
            <div className="ml-auto flex gap-2">
              <button type="button" className="btn-ghost !px-3 !py-1.5" onClick={exportCsv}>
                CSV
              </button>
              <button type="button" className="btn-ghost !px-3 !py-1.5" onClick={exportJson}>
                JSON
              </button>
            </div>
          </div>

          <div className="card overflow-x-auto !p-0">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase text-slate-500 dark:border-white/10">
                <tr>
                  <th className="px-4 py-3">Link</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-6 text-center text-slate-500">
                      Nothing to show for this filter.
                    </td>
                  </tr>
                )}
                {rows.map((r) => (
                  <tr key={r.url} className="border-b border-slate-100 last:border-0 dark:border-white/5">
                    <td className="max-w-[18rem] px-4 py-3 sm:max-w-md">
                      <div className="break-all">{r.url}</div>
                      {r.finalUrl && <div className="break-all text-xs text-slate-500">→ {r.finalUrl}</div>}
                    </td>
                    <td className="px-4 py-3 capitalize">{r.kind}</td>
                    <td
                      className={`whitespace-nowrap px-4 py-3 font-semibold ${
                        !r.ok ? "text-red-500" : r.redirected ? "text-amber-500" : "text-emerald-500"
                      }`}
                    >
                      {statusLabel(r)}
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
