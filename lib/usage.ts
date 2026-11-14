// Client-side usage counter (per browser, per day).
// NOTE: this is only a soft limit for the MVP. Real, tamper-proof limits
// need a server + login (see README "Next steps").
export type Tool = "image" | "video" | "link" | "perf";

export const FREE_LIMITS: Record<Tool, number> = {
  image: 30,
  video: 3,
  link: 10,
  perf: 10,
};

export const TOOL_LABELS: Record<Tool, string> = {
  image: "Images compressed",
  video: "Videos compressed",
  link: "Link scans",
  perf: "Performance scans",
};

const empty = (): Record<Tool, number> => ({ image: 0, video: 0, link: 0, perf: 0 });

function key(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `linkpilot-usage-${d.getFullYear()}-${m}-${day}`;
}

export function getUsage(): Record<Tool, number> {
  try {
    const raw = localStorage.getItem(key());
    if (!raw) return empty();
    return { ...empty(), ...(JSON.parse(raw) as Partial<Record<Tool, number>>) };
  } catch {
    return empty();
  }
}

export function remaining(tool: Tool): number {
  return Math.max(0, FREE_LIMITS[tool] - getUsage()[tool]);
}

export function addUsage(tool: Tool, n = 1): void {
  try {
    const u = getUsage();
    u[tool] += n;
    localStorage.setItem(key(), JSON.stringify(u));
  } catch {
    /* storage unavailable — ignore */
  }
}
