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

const MAX_HTML_BYTES = 3 * 1024 * 1024;
const LARGE = 200 * 1024;
const HUGE = 1024 * 1024;

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

function attr(tag: string, name: string): string | null {
  const re = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i");
  const m = re.exec(tag);
  return m ? (m[1] ?? m[2] ?? m[3] ?? "") : null;
}

function resolve(raw: string | null, base: URL): string | null {
  if (!raw) return null;
  const v = raw.trim().replace(/&amp;/g, "&");
  if (!v || v.startsWith("data:")) return null;
  try {
    const u = new URL(v, base);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    u.hash = "";
    return u.toString();
  } catch {
    return null;
  }
}

async function headInfo(url: string): Promise<{ size: number | null; type: string | null }> {
  try {
    let r = await safeFetch(url, { method: "HEAD", timeoutMs: 6000, maxRedirects: 3 });
    if ([400, 403, 405, 501].includes(r.res.status)) {
      r.res.body?.cancel().catch(() => {});
      r = await safeFetch(url, { method: "GET", timeoutMs: 6000, maxRedirects: 3 });
    }
    r.res.body?.cancel().catch(() => {});
    const len = r.res.headers.get("content-length");
    const n = len ? Number(len) : NaN;
    return { size: Number.isFinite(n) ? n : null, type: r.res.headers.get("content-type") };
  } catch {
    return { size: null, type: null };
  }
}

export async function POST(req: NextRequest) {
  if (!rateLimit(`analyze:${clientIp(req)}`, 6, 60_000)) {
    return NextResponse.json({ error: "Too many requests. Please wait a minute." }, { status: 429 });
  }
  const body = (await req.json().catch(() => null)) as { url?: unknown } | null;
  try {
    const target = normalizeInputUrl(body?.url);
    const page = await safeFetch(target, { method: "GET", timeoutMs: 10000, maxRedirects: 5 });
    if (page.res.status >= 400) {
      page.res.body?.cancel().catch(() => {});
      return NextResponse.json({ error: `The page returned HTTP ${page.res.status}.` }, { status: 422 });
    }
    const compression = page.res.headers.get("content-encoding");
    const { text, bytes, truncated } = await readTextLimited(page.res, MAX_HTML_BYTES);
    const base = new URL(page.finalUrl);

    // Images
    const imgTags = text.match(/<img\b[^>]*>/gi) ?? [];
    const imgMeta = new Map<string, { noDims: boolean; noAlt: boolean; notLazy: boolean }>();
    imgTags.forEach((tag, i) => {
      const src = resolve(attr(tag, "src") ?? attr(tag, "data-src"), base);
      if (!src || imgMeta.has(src)) return;
      imgMeta.set(src, {
        noDims: attr(tag, "width") === null || attr(tag, "height") === null,
        noAlt: attr(tag, "alt") === null,
        notLazy: i >= 3 && (attr(tag, "loading") ?? "").toLowerCase() !== "lazy",
      });
    });
    const imgUrls = Array.from(imgMeta.keys());

    // Scripts and stylesheets
    const scriptUrls = new Set<string>();
    (text.match(/<script\b[^>]*>/gi) ?? []).forEach((t) => {
      const u = resolve(attr(t, "src"), base);
      if (u) scriptUrls.add(u);
    });
    const cssUrls = new Set<string>();
    (text.match(/<link\b[^>]*>/gi) ?? []).forEach((t) => {
      if (/stylesheet/i.test(attr(t, "rel") ?? "")) {
        const u = resolve(attr(t, "href"), base);
        if (u) cssUrls.add(u);
      }
    });

    const imgSample = imgUrls.slice(0, 30);
    const assetSample: { url: string; kind: "script" | "stylesheet" }[] = [
      ...Array.from(cssUrls).map((url) => ({ url, kind: "stylesheet" as const })),
      ...Array.from(scriptUrls).map((url) => ({ url, kind: "script" as const })),
    ].slice(0, 20);

    const imgInfo = await mapPool(imgSample, 6, headInfo);
    const assetInfo = await mapPool(assetSample, 6, (a) => headInfo(a.url));

    const images: ImageInfo[] = imgSample.map((url, i) => {
      const meta = imgMeta.get(url)!;
      const { size, type } = imgInfo[i];
      const flags: string[] = [];
      if (size !== null && size > HUGE) flags.push("huge");
      else if (size !== null && size > LARGE) flags.push("large");
      const legacy = /\.(png|jpe?g|gif)(\?|$)/i.test(url) || /image\/(png|jpeg|gif)/i.test(type ?? "");
      if (legacy) flags.push("legacy-format");
      if (meta.noDims) flags.push("no-dimensions");
      if (meta.noAlt) flags.push("no-alt");
      if (meta.notLazy) flags.push("not-lazy");
      return { url, size, type, flags };
    });
    images.sort((a, b) => (b.size ?? -1) - (a.size ?? -1));

    const assets: AssetInfo[] = assetSample.map((a, i) => ({ ...a, size: assetInfo[i].size }));

    const knownImg = images.reduce((s, i) => s + (i.size ?? 0), 0);
    const knownAssets = assets.reduce((s, a) => s + (a.size ?? 0), 0);
    const totalKnownBytes = bytes + knownImg + knownAssets;

    const suggestions: string[] = [];
    const big = images.filter((i) => i.flags.includes("large") || i.flags.includes("huge"));
    if (big.length)
      suggestions.push(
        `${big.length} image(s) are larger than 200 KB. Compress them with the LinkPilot Image Compressor.`
      );
    const legacy = images.filter((i) => i.flags.includes("legacy-format"));
    if (legacy.length)
      suggestions.push(`${legacy.length} image(s) use JPG/PNG/GIF. WebP or AVIF is usually 25–50% smaller.`);
    if (images.some((i) => i.flags.includes("no-dimensions")))
      suggestions.push("Some images have no width/height attributes, which causes layout shifts.");
    if (images.some((i) => i.flags.includes("not-lazy")))
      suggestions.push('Add loading="lazy" to images below the fold.');
    if (images.some((i) => i.flags.includes("no-alt")))
      suggestions.push("Some images have no alt text (bad for accessibility and SEO).");
    if (!compression)
      suggestions.push("The HTML response is not compressed. Enable gzip or Brotli on your server.");
    if (scriptUrls.size > 15)
      suggestions.push(`The page loads ${scriptUrls.size} script files. Try bundling or removing unused ones.`);
    if (cssUrls.size > 6)
      suggestions.push(`The page loads ${cssUrls.size} stylesheets. Consider combining them.`);
    if (bytes > 500 * 1024) suggestions.push("The HTML itself is over 500 KB. Reduce inline data or split the page.");
    if (imgUrls.length > imgSample.length)
      suggestions.push(`Only the first ${imgSample.length} of ${imgUrls.length} images were measured.`);
    if (suggestions.length === 0) suggestions.push("No obvious problems found in the checks LinkPilot runs.");

    return NextResponse.json({
      pageUrl: page.finalUrl,
      htmlBytes: bytes,
      htmlTruncated: truncated,
      compression,
      counts: { images: imgUrls.length, scripts: scriptUrls.size, stylesheets: cssUrls.size },
      totalKnownBytes,
      images,
      assets,
      suggestions,
    });
  } catch (e) {
    if (e instanceof UnsafeUrlError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Could not fetch this website." }, { status: 502 });
  }
}
