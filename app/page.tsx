import Link from "next/link";

const tools = [
  {
    href: "/image",
    icon: "🖼️",
    title: "Image Compressor",
    text: "JPG, PNG, WebP, AVIF. Batch compress, resize, compare before/after, download as ZIP.",
  },
  {
    href: "/video",
    icon: "🎬",
    title: "Video Compressor",
    text: "MP4, MOV, WebM to smaller MP4. 1080p / 720p / 480p, quality control, progress and cancel.",
  },
  {
    href: "/link-checker",
    icon: "🔗",
    title: "Link Checker",
    text: "Find broken links, 404s and redirects. Internal vs external. Export CSV or JSON.",
  },
  {
    href: "/performance",
    icon: "⚡",
    title: "Performance Check",
    text: "Page weight, oversized images and clear suggestions to make a page faster.",
  },
];

export default function Home() {
  return (
    <main>
      <section className="relative overflow-hidden bg-[radial-gradient(60%_55%_at_50%_0%,rgba(34,211,238,0.20),transparent),radial-gradient(40%_40%_at_90%_10%,rgba(99,102,241,0.18),transparent)]">
        <div className="mx-auto max-w-4xl px-4 pb-16 pt-14 text-center sm:pt-24">
          <span className="inline-block animate-rise rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs font-semibold text-cyan-600 dark:text-cyan-300">
            Private by design · runs in your browser
          </span>
          <h1 className="mt-5 animate-rise font-display text-4xl font-bold leading-tight tracking-tight sm:text-6xl">
            Make your website <span className="bg-gradient-to-r from-cyan-400 to-indigo-500 bg-clip-text text-transparent">lighter</span>,
            <br className="hidden sm:block" /> cleaner and faster.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl animate-rise text-base text-slate-600 dark:text-slate-300 sm:text-lg">
            LINKPILOT shrinks your images and videos, hunts down broken links and points out what slows
            your pages down — all in one place.
          </p>
          <div className="mt-8 flex animate-rise flex-wrap justify-center gap-3">
            <Link href="/image" className="btn">
              Compress images
            </Link>
            <Link href="/link-checker" className="btn-ghost">
              Check a website
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-4 py-12 sm:grid-cols-2">
        {tools.map((t, i) => (
          <Link
            key={t.href}
            href={t.href}
            style={{ animationDelay: `${i * 70}ms` }}
            className="card group animate-rise transition hover:-translate-y-1 hover:border-cyan-400/60"
          >
            <div className="text-3xl">{t.icon}</div>
            <h2 className="mt-3 font-display text-xl font-semibold">{t.title}</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{t.text}</p>
            <span className="mt-4 inline-block text-sm font-semibold text-cyan-600 transition group-hover:translate-x-1 dark:text-cyan-300">
              Open tool →
            </span>
          </Link>
        ))}
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-6">
        <div className="card grid gap-6 sm:grid-cols-3">
          <div>
            <div className="font-display text-lg font-semibold">Your files stay yours</div>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Images and videos are compressed on your device. Nothing is uploaded to our servers.
            </p>
          </div>
          <div>
            <div className="font-display text-lg font-semibold">Honest limits</div>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Large videos are limited on phones to protect memory. We tell you before you start.
            </p>
          </div>
          <div>
            <div className="font-display text-lg font-semibold">Free to start</div>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Daily free limits apply. Paid plans are not available yet.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
