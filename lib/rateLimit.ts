// Simple in-memory rate limiter. On Vercel each serverless instance has its
// own memory, so this is a best-effort guard only (see README).
const hits = new Map<string, { count: number; reset: number }>();

export function rateLimit(key: string, max = 10, windowMs = 60_000): boolean {
  const now = Date.now();
  const entry = hits.get(key);
  if (!entry || entry.reset < now) {
    hits.set(key, { count: 1, reset: now + windowMs });
    if (hits.size > 5000) {
      hits.forEach((v, k) => {
        if (v.reset < now) hits.delete(k);
      });
    }
    return true;
  }
  entry.count++;
  return entry.count <= max;
}

export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  return (xff ? xff.split(",")[0].trim() : "") || "unknown";
}
