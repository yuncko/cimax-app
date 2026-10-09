import { NextRequest, NextResponse } from "next/server";
import { enabledProviders } from "@/lib/server/providers";
import { pickBest, sortSources, normalizeQuery } from "@/lib/server/arabicUnified";
import type { UnifiedSource } from "@/lib/server/arabicUnified";

export const dynamic = "force-dynamic";

/**
 * GET /api/stream/arabic/sources?tmdbId=&type=movie|tv&s=&e=&q=&title=&lang=
 * Resolves the fastest Arabic source across all providers.
 * type=movie → no season/episode; type=tv → s & e required for episode resolution.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const type = (sp.get("type") || "movie").trim() as "movie" | "tv";
  const season = parseInt(sp.get("s") || sp.get("season") || "1", 10);
  const episode = parseInt(sp.get("e") || sp.get("episode") || "1", 10);
  let q = (sp.get("q") || sp.get("title") || sp.get("query") || "").trim();

  // If q not provided, try to resolve from TMDB via tmdbId
  const tmdbId = sp.get("tmdbId") || sp.get("id");
  if (!q && tmdbId) {
    try {
      const apiKey = process.env.NEXT_PUBLIC_TMDB_API_KEY;
      if (apiKey) {
        const lang = sp.get("lang") || "ar";
        const path = type === "tv" ? `/tv/${tmdbId}` : `/movie/${tmdbId}`;
        const res = await fetch(
          `https://api.themoviedb.org/3${path}?api_key=${apiKey}&language=${lang === "en" ? "en-US" : "ar"}`,
          { cache: "no-store" }
        );
        if (res.ok) {
          const data = (await res.json()) as Record<string, unknown>;
          q = String(data.title || data.name || "");
        }
      }
    } catch {
      // ignore
    }
  }

  if (!q) {
    return NextResponse.json({ error: "q (title) or tmdbId is required", sources: [], timings: {} }, { status: 400 });
  }

  const query = normalizeQuery(q);
  const providers = enabledProviders();
  const overallStart = Date.now();

  // Phase 1: search all providers in parallel
  const searchController = new AbortController();
  const searchTimeout = setTimeout(() => searchController.abort(), 10000);

  const searchResults = await Promise.allSettled(
    providers.map(async (p) => {
      const s = Date.now();
      try {
        const hits = await Promise.race([
          p.search(query, searchController.signal),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 8000)),
        ]) as Awaited<ReturnType<typeof p.search>>;
        return { provider: p.id, hits, ms: Date.now() - s };
      } catch {
        return { provider: p.id, hits: [] as Awaited<ReturnType<typeof p.search>>, ms: Date.now() - s };
      }
    })
  );

  clearTimeout(searchTimeout);

  // Collect all hits, grouped by provider
  const hitsByProvider: Map<string, typeof searchResults extends PromiseSettledResult<infer T>[] ? T extends { hits: infer H } ? H : never : never> = new Map();
  const searchTimings: Record<string, number> = {};
  for (const r of searchResults) {
    if (r.status === "fulfilled") {
      searchTimings[r.value.provider] = r.value.ms;
      if (r.value.hits.length > 0) {
        // Take top 2 hits per provider to bound source extraction
        hitsByProvider.set(r.value.provider, r.value.hits.slice(0, 2) as never);
      }
    }
  }

  if (hitsByProvider.size === 0) {
    return NextResponse.json(
      { sources: [], best: null, timings: searchTimings, tookMs: Date.now() - overallStart, error: "No Arabic sources found for this title", query },
      { status: 404, headers: { "Cache-Control": "private, max-age=30" } }
    );
  }

  // Phase 2: extract sources from top hits (concurrency-bounded)
  const extractController = new AbortController();
  const extractTimeout = setTimeout(() => extractController.abort(), 15000);

  const allSources: UnifiedSource[] = [];
  const extractTimings: Record<string, number> = {};

  // Flatten hits with provider reference
  const tasks: Array<{ provider: string; hitUrl: string }> = [];
  for (const [providerId, hits] of hitsByProvider) {
    for (const h of hits as Array<{ url: string }>) {
      tasks.push({ provider: providerId, hitUrl: h.url });
    }
  }

  // Simple concurrency of 4
  const CONCURRENCY = 4;
  const queue = [...tasks];
  const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    while (queue.length > 0) {
      const task = queue.shift();
      if (!task) break;
      const provider = providers.find((p) => p.id === task.provider);
      if (!provider) continue;
      const start = Date.now();
      try {
        const srcs = await Promise.race([
          provider.getSources(task.hitUrl, type === "tv" ? season : undefined, type === "tv" ? episode : undefined, extractController.signal),
          new Promise<UnifiedSource[]>((_, reject) => setTimeout(() => reject(new Error("timeout")), 10000)),
        ]);
        extractTimings[task.provider] = Date.now() - start;
        allSources.push(...srcs);
      } catch {
        extractTimings[task.provider] = Date.now() - start;
      }
    }
  });

  await Promise.all(workers);
  clearTimeout(extractTimeout);

  if (allSources.length === 0) {
    return NextResponse.json(
      {
        sources: [],
        best: null,
        timings: { ...searchTimings, ...extractTimings },
        tookMs: Date.now() - overallStart,
        error: "No playable streams extracted",
        query,
        hits: [...hitsByProvider.entries()].map(([k, v]) => ({ provider: k, count: (v as unknown[]).length })),
      },
      { status: 404, headers: { "Cache-Control": "private, max-age=30" } }
    );
  }

  const sorted = sortSources(allSources);
  const best = pickBest(sorted);

  return NextResponse.json(
    {
      sources: sorted,
      best,
      timings: { ...searchTimings, ...extractTimings },
      tookMs: Date.now() - overallStart,
      query,
    },
    { headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=15" } }
  );
}
