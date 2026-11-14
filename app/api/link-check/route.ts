import { NextRequest, NextResponse } from "next/server";
import {
  UnsafeUrlError,
  mapPool,
  normalizeInputUrl,
  readTextLimited,
  safeFetch,
} from "@/lib/ssrf";
import { clientIp, rateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_LINKS = 60;
const MAX_HTML_BYTES = 2 * 1024 * 1024;

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

function stripWww(h: string): string {
  return h.replace(/^www\./, "");
}

function decodeEntities(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&#38;/g, "&").replace(/&quot;/g, '"');
}

function extractLinks(html: string, base: URL): string[] {
  const re = /<a\s[^>]*?href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
  const found = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const raw = decodeEntities((m[1] ?? m[2] ?? m[3] ?? "").trim());
    if (!raw || raw.startsWith("#")) continue;
    if (/^(mailto|tel|javascript|data|sms):/i.test(raw)) continue;
    try {
      const u = new URL(raw, base);
      if (u.protocol !== "http:" && u.protocol !== "https:") continue;
      u.hash = "";
      found.add(u.toString());
    } catch {
      /* ignore malformed */
    }
  }
  return Array.from(found);
}

async function checkOne(link: string, pageHost: string): Promise<LinkResult> {
  let host = "";
  try {
    host = stripWww(new URL(link).hostname.toLowerCase());
  } catch {
    /* ignore */
  }
  const base: LinkResult = {
    url: link,
    kind: host === pageHost ? "internal" : "external",
    status: null,
    ok: false,
    redirected: false,
    redirectStatus: null,
    finalUrl: null,
    error: null,
  };
  try {
    let r = await safeFetch(link, { method: "HEAD", timeoutMs: 8000, maxRedirects: 5 });
    if ([400, 403, 405, 501].includes(r.res.status)) {
      r.res.body?.cancel().catch(() => {});
      r = await safeFetch(link, { method: "GET", timeoutMs: 8000, maxRedirects: 5 });
    }
    r.res.body?.cancel().catch(() => {});
    const status = r.res.status;
    return {
      ...base,
      status,
      ok: status < 400,
      redirected: r.hops > 0,
      redirectStatus: r.firstRedirect,
      finalUrl: r.hops > 0 ? r.finalUrl : null,
    };
  } catch (e) {
    const msg =
      e instanceof UnsafeUrlError
        ? `Blocked: ${e.message}`
        : e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")
          ? "Timed out"
          : "Could not connect";
    return { ...base, error: msg };
  }
}

export async function POST(req: NextRequest) {
  if (!rateLimit(`link:${clientIp(req)}`, 6, 60_000)) {
    return NextResponse.json({ error: "Too many requests. Please wait a minute." }, { status: 429 });
  }
  const body = (await req.json().catch(() => null)) as { url?: unknown } | null;
  try {
    const target = normalizeInputUrl(body?.url);
    const page = await safeFetch(target, { method: "GET", timeoutMs: 10000, maxRedirects: 5 });
    if (page.res.status >= 400) {
      page.res.body?.cancel().catch(() => {});
      return NextResponse.json(
        { error: `The page returned HTTP ${page.res.status}.` },
        { status: 422 }
      );
    }
    const ctype = page.res.headers.get("content-type") ?? "";
    if (!/text\/html|application\/xhtml/i.test(ctype)) {
      page.res.body?.cancel().catch(() => {});
      return NextResponse.json({ error: "This URL is not an HTML page." }, { status: 422 });
    }
    const { text } = await readTextLimited(page.res, MAX_HTML_BYTES);
    const baseUrl = new URL(page.finalUrl);
    const pageHost = stripWww(baseUrl.hostname.toLowerCase());
    const all = extractLinks(text, baseUrl);
    const toCheck = all.slice(0, MAX_LINKS);
    const results = await mapPool(toCheck, 8, (l) => checkOne(l, pageHost));
    const summary = {
      broken: results.filter((r) => !r.ok).length,
      redirects: results.filter((r) => r.redirected).length,
      internal: results.filter((r) => r.kind === "internal").length,
      external: results.filter((r) => r.kind === "external").length,
    };
    return NextResponse.json({
      pageUrl: page.finalUrl,
      totalFound: all.length,
      checked: results.length,
      truncated: all.length > MAX_LINKS,
      summary,
      results,
    });
  } catch (e) {
    if (e instanceof UnsafeUrlError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Could not fetch this website." }, { status: 502 });
  }
}
