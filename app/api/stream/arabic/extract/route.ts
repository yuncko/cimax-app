import { NextRequest, NextResponse } from "next/server";
import { PROVIDERS } from "@/lib/server/providers";
import { resolveHost } from "@/lib/server/hosts/resolver";

export const dynamic = "force-dynamic";

/**
 * GET /api/stream/arabic/extract?url=&provider=&s=&e=&redirect=1
 * Single-URL fast path: detail → sources OR iframe → host resolver.
 * If ?redirect=1, 302 to the playable URL.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const url = sp.get("url")?.trim();
  const providerHint = sp.get("provider")?.trim();
  const season = sp.get("s") ? parseInt(sp.get("s")!, 10) : undefined;
  const episode = sp.get("e") ? parseInt(sp.get("e")!, 10) : undefined;

  if (!url) {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }

  let decodedUrl = url;
  try { decodedUrl = decodeURIComponent(url); } catch {}

  // If it's already a direct video URL, just redirect/return
  if (decodedUrl.includes(".mp4") || decodedUrl.includes(".m3u8")) {
    if (sp.get("redirect") === "1") return NextResponse.redirect(decodedUrl, 302);
    return NextResponse.json(
      { url: decodedUrl, isHls: decodedUrl.includes(".m3u8"), provider: providerHint || "direct", headers: {} },
      { headers: { "Cache-Control": "private, max-age=60" } }
    );
  }

  // Try provider-specific extraction first
  if (providerHint && PROVIDERS[providerHint]) {
    try {
      const sources = await PROVIDERS[providerHint].getSources(decodedUrl, season, episode);
      if (sources.length > 0) {
        const best = sources.sort((a, b) => {
          const rank: Record<string, number> = { "1080p": 4, "720p": 3, "480p": 2, "360p": 1, "240p": 0 };
          return (rank[b.quality] ?? 0) - (rank[a.quality] ?? 0);
        })[0];
        if (sp.get("redirect") === "1") return NextResponse.redirect(best.url, 302);
        return NextResponse.json(
          { url: best.url, isHls: best.isHls, quality: best.quality, provider: best.provider, headers: best.headers, sources },
          { headers: { "Cache-Control": "private, max-age=60" } }
        );
      }
    } catch {
      // fall through to generic resolver
    }
  }

  // Try all providers that can handle this URL
  for (const p of Object.values(PROVIDERS)) {
    if (!p.enabled()) continue;
    try {
      const sources = await p.getSources(decodedUrl, season, episode);
      if (sources.length > 0) {
        const best = sources[0];
        if (sp.get("redirect") === "1") return NextResponse.redirect(best.url, 302);
        return NextResponse.json(
          { url: best.url, isHls: best.isHls, quality: best.quality, provider: best.provider, headers: best.headers, sources },
          { headers: { "Cache-Control": "private, max-age=60" } }
        );
      }
    } catch {
      continue;
    }
  }

  // Generic host resolver fallback (for raw iframe URLs)
  try {
    const resolved = await resolveHost(decodedUrl);
    if (resolved) {
      if (sp.get("redirect") === "1") return NextResponse.redirect(resolved.url, 302);
      return NextResponse.json(
        { url: resolved.url, isHls: resolved.isHls, provider: resolved.host, headers: resolved.headers },
        { headers: { "Cache-Control": "private, max-age=60" } }
      );
    }
  } catch {}

  return NextResponse.json(
    { error: "Failed to extract playable URL", url: decodedUrl },
    { status: 502 }
  );
}
