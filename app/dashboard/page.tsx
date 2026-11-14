"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { FREE_LIMITS, TOOL_LABELS, getUsage, type Tool } from "@/lib/usage";

const TOOLS: Tool[] = ["image", "video", "link", "perf"];
const HREF: Record<Tool, string> = {
  image: "/image",
  video: "/video",
  link: "/link-checker",
  perf: "/performance",
};

const plans = [
  { name: "Free", price: "$0", current: true, items: ["30 images / day", "3 videos / day", "10 link scans / day", "10 performance scans / day"] },
  { name: "Starter", price: "Coming soon", current: false, items: ["Higher daily limits", "Bigger link scans", "Email support"] },
  { name: "Pro", price: "Coming soon", current: false, items: ["Highest limits", "Scheduled link checks", "Priority support"] },
];

export default function DashboardPage() {
  const [usage, setUsage] = useState<Record<Tool, number> | null>(null);

  useEffect(() => {
    setUsage(getUsage());
  }, []);

  return (
    <main className="mx-auto max-w-5xl space-y-8 px-4 py-8">
      <div>
        <h1 className="font-display text-3xl font-bold">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Today&apos;s usage on this device. Accounts and sign-in are not available yet.
        </p>
      </div>

      <section className="grid gap-4 sm:grid-cols-2">
        {TOOLS.map((t) => {
          const used = usage ? usage[t] : 0;
          const limit = FREE_LIMITS[t];
          const pct = Math.min(100, Math.round((used / limit) * 100));
          return (
            <Link key={t} href={HREF[t]} className="card block transition hover:border-cyan-400/60">
              <div className="flex items-baseline justify-between">
                <div className="font-medium">{TOOL_LABELS[t]}</div>
                <div className="text-sm text-slate-500">
                  {used} / {limit}
                </div>
              </div>
              <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
                <div
                  className={`h-full rounded-full ${pct >= 100 ? "bg-red-500" : "bg-gradient-to-r from-cyan-400 to-indigo-500"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </Link>
          );
        })}
      </section>

      <section>
        <h2 className="font-display text-xl font-semibold">Plans</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          {plans.map((p) => (
            <div key={p.name} className={`card ${p.current ? "border-cyan-400/60" : ""}`}>
              <div className="flex items-center justify-between">
                <div className="font-display text-lg font-semibold">{p.name}</div>
                {p.current && (
                  <span className="rounded-full bg-cyan-500/15 px-2 py-0.5 text-xs font-semibold text-cyan-600 dark:text-cyan-300">
                    Current
                  </span>
                )}
              </div>
              <div className="mt-1 text-2xl font-bold">{p.price}</div>
              <ul className="mt-3 space-y-1 text-sm text-slate-600 dark:text-slate-400">
                {p.items.map((i) => (
                  <li key={i}>• {i}</li>
                ))}
              </ul>
              {!p.current && (
                <button type="button" disabled className="btn-ghost mt-4 w-full">
                  Not available yet
                </button>
              )}
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Paid plans and payments are not connected. Usage limits are tracked in this browser only.
        </p>
      </section>
    </main>
  );
}
