import { lookup } from "dns/promises";
import net from "net";

export class UnsafeUrlError extends Error {}

export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    if (v === "::" || v === "::1") return true;
    if (v.startsWith("::ffff:")) {
      const mapped = v.slice(7);
      return net.isIPv4(mapped) ? isPrivateIp(mapped) : true;
    }
    return /^(fc|fd|fe8|fe9|fea|feb)/.test(v);
  }
  return true; // unknown format → block
}

/** Validates a URL and makes sure it resolves only to public IP addresses. */
export async function assertSafeUrl(raw: string): Promise<URL> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new UnsafeUrlError("Invalid URL");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new UnsafeUrlError("Only http and https URLs are allowed");
  }
  if (u.username || u.password) {
    throw new UnsafeUrlError("URLs with credentials are not allowed");
  }
  if (u.port && u.port !== "80" && u.port !== "443") {
    throw new UnsafeUrlError("Only standard ports (80/443) are allowed");
  }
  const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    throw new UnsafeUrlError("This host is not allowed");
  }
  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new UnsafeUrlError("Private or reserved IP addresses are not allowed");
    return u;
  }
  let addrs: { address: string }[];
  try {
    addrs = await lookup(host, { all: true });
  } catch {
    throw new UnsafeUrlError("Could not resolve this domain");
  }
  if (addrs.length === 0 || addrs.some((a) => isPrivateIp(a.address))) {
    throw new UnsafeUrlError("This host resolves to a private or reserved address");
  }
  return u;
}

export interface SafeFetchResult {
  res: Response;
  finalUrl: string;
  hops: number;
  firstRedirect: number | null;
}

/** fetch() that re-validates every redirect hop (SSRF protection). */
export async function safeFetch(
  url: string,
  opts: { method?: "GET" | "HEAD"; timeoutMs?: number; maxRedirects?: number } = {}
): Promise<SafeFetchResult> {
  const { method = "GET", timeoutMs = 8000, maxRedirects = 5 } = opts;
  let current = url;
  let hops = 0;
  let firstRedirect: number | null = null;
  for (;;) {
    const u = await assertSafeUrl(current);
    const res = await fetch(u.toString(), {
      method,
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "user-agent": "LinkPilotBot/0.1", accept: "*/*" },
    });
    const loc = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && loc) {
      res.body?.cancel().catch(() => {});
      if (hops >= maxRedirects) throw new Error("Too many redirects");
      if (firstRedirect === null) firstRedirect = res.status;
      current = new URL(loc, u).toString();
      hops++;
      continue;
    }
    return { res, finalUrl: u.toString(), hops, firstRedirect };
  }
}

export async function readTextLimited(
  res: Response,
  maxBytes: number
): Promise<{ text: string; bytes: number; truncated: boolean }> {
  if (!res.body) return { text: "", bytes: 0, truncated: false };
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.length;
    chunks.push(value);
    if (bytes >= maxBytes) {
      truncated = true;
      await reader.cancel().catch(() => {});
      break;
    }
  }
  const dec = new TextDecoder("utf-8", { fatal: false });
  const text = chunks.map((c) => dec.decode(c, { stream: true })).join("") + dec.decode();
  return { text, bytes, truncated };
}

export function normalizeInputUrl(input: unknown): string {
  if (typeof input !== "string") throw new UnsafeUrlError("Please enter a URL");
  let s = input.trim();
  if (!s || s.length > 2048) throw new UnsafeUrlError("Please enter a valid URL");
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = `https://${s}`;
  return s;
}

export async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}
