"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import ThemeToggle from "./ThemeToggle";

const links = [
  { href: "/image", label: "Images" },
  { href: "/video", label: "Video" },
  { href: "/link-checker", label: "Links" },
  { href: "/performance", label: "Performance" },
  { href: "/dashboard", label: "Dashboard" },
];

export function Logo() {
  return (
    <span className="flex items-center gap-2 font-display text-lg font-bold tracking-tight">
      <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true">
        <defs>
          <linearGradient id="lp" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#22d3ee" />
            <stop offset="1" stopColor="#6366f1" />
          </linearGradient>
        </defs>
        <rect width="32" height="32" rx="9" fill="url(#lp)" />
        <path d="M8 22 L24 10 L19 24 L15 18 Z" fill="#fff" />
      </svg>
      LINK<span className="text-cyan-500">PILOT</span>
    </span>
  );
}

export default function Nav() {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-slate-50/80 backdrop-blur dark:border-white/10 dark:bg-[#07090f]/80">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <Link href="/" aria-label="LINKPILOT home">
          <Logo />
        </Link>
        <nav className="hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                path === l.href
                  ? "bg-cyan-500/10 text-cyan-600 dark:text-cyan-300"
                  : "text-slate-600 hover:bg-slate-200/60 dark:text-slate-300 dark:hover:bg-white/10"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <ThemeToggle />
      </div>
      <nav className="flex gap-1 overflow-x-auto px-3 pb-2 md:hidden">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium ${
              path === l.href
                ? "bg-cyan-500 text-white"
                : "bg-slate-200/70 text-slate-700 dark:bg-white/10 dark:text-slate-200"
            }`}
          >
            {l.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
