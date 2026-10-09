import { NextRequest, NextResponse } from "next/server";
import { enabledProviders } from "@/lib/server/providers";

export const dynamic = "force-dynamic";

/**
 * GET /api/stream/arabic/search?q=&lang=
 * Fan-out search across enabled providers (8s per provider, Promise.allSettled).
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ hits: [], providerTimings: {}, source: "unified" });

  const providers = enabledProviders();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  const timings: Record<string, number> = {};
  const allHits: Array<{ provider: string; id: string; title: string; url: string; year?: string }> = [];

  const results = await Promise.allSettled(
    providers.map(async (p) => {
      const start = Date.now();
      try {
        const hits = await Promise.race([
          p.search(q, controller.signal),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 8000)),
        ]) as Awaited<ReturnType<typeof p.search>>;
        timings[p.id] = Date.now() - start;
        return { provider: p.id, hits };
      } catch (e) {
        timings[p.id] = Date.now() - start;
        return { provider: p.id, hits: [] as typeof allHits, error: e instanceof Error ? e.message : "error" };
      }
    })
  );

  clearTimeout(timeout);

  for (const r of results) {
    if (r.status === "fulfilled") {
      for (const h of r.value.hits) {
        if (!allHits.some((x) => x.url === h.url)) allHits.push(h);
      }
    }
  }

  return NextResponse.json(
    { hits: allHits, providerTimings: timings, source: "unified" },
    { headers: { "Cache-Control": "private, max-age=60" } }
  );
}
