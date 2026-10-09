import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const DROP_RES_HEADERS = new Set([
  "x-frame-options", "content-security-policy", "content-security-policy-report-only",
  "x-content-type-options", "strict-transport-security", "content-encoding", "content-length",
  "access-control-allow-origin", "access-control-allow-credentials",
]);

/**
 * HLS proxy — rewrites playlist segment URLs to stay same-origin so Referer is preserved.
 * GET /api/stream/arabic/hls/playlist.m3u8?src=<encoded master m3u8 url>
 * GET /api/stream/arabic/hls/segment.ts?src=<encoded segment url>&referer=<...>
 *
 * For playlists: fetch, rewrite relative URLs, return with correct content-type.
 * For segments (.ts, .m4s, .mp4): stream bytes with Range support.
 */
async function proxy(req: NextRequest): Promise<NextResponse> {
  const src = req.nextUrl.searchParams.get("src")?.trim();
  const referer = req.nextUrl.searchParams.get("referer")?.trim() || req.headers.get("referer") || undefined;
  const isPlaylist = req.nextUrl.pathname.endsWith(".m3u8") || (src?.includes(".m3u8") ?? false);

  if (!src) {
    return NextResponse.json({ error: "src is required" }, { status: 400 });
  }

  let decodedSrc: string;
  try { decodedSrc = decodeURIComponent(src); } catch { decodedSrc = src; }

  if (!decodedSrc.startsWith("http")) {
    return NextResponse.json({ error: "src must be http(s)" }, { status: 400 });
  }

  const headers: Record<string, string> = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept: isPlaylist ? "application/vnd.apple.mpegurl,application/x-mpegURL,*/*" : "*/*",
    "Accept-Language": "ar,en-US;q=0.9,en;q=0.8",
  };
  if (referer) {
    headers.Referer = referer;
    try { headers.Origin = new URL(referer).origin; } catch {}
  }
  // Forward Range for segments
  const range = req.headers.get("range");
  if (range) headers.Range = range;
  const ifNoneMatch = req.headers.get("if-none-match");
  if (ifNoneMatch) headers["If-None-Match"] = ifNoneMatch;

  let upstream: Response;
  try {
    upstream = await fetch(decodedSrc, {
      headers,
      redirect: "follow",
      cache: "no-store",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "fetch failed";
    return NextResponse.json({ error: msg, src: decodedSrc }, { status: 502 });
  }

  if (!upstream.ok) {
    return NextResponse.json({ error: `upstream ${upstream.status}`, src: decodedSrc }, { status: 502 });
  }

  // Playlist: rewrite
  if (isPlaylist || (upstream.headers.get("content-type") || "").includes("mpegurl") || decodedSrc.includes(".m3u8")) {
    const text = await upstream.text();
    const baseUrl = decodedSrc;
    const rewritten = rewritePlaylist(text, baseUrl, referer);
    const resHeaders = new Headers();
    resHeaders.set("Content-Type", "application/vnd.apple.mpegurl");
    resHeaders.set("Cache-Control", "no-store");
    resHeaders.set("Access-Control-Allow-Origin", "*");
    return new NextResponse(rewritten, { status: 200, headers: resHeaders });
  }

  // Segment: stream bytes
  const buf = await upstream.arrayBuffer();
  const resHeaders = new Headers();
  const ct = upstream.headers.get("content-type");
  if (ct) resHeaders.set("Content-Type", ct);
  else resHeaders.set("Content-Type", "video/MP2T");
  resHeaders.set("Cache-Control", "public, max-age=3600");
  resHeaders.set("Access-Control-Allow-Origin", "*");
  // Copy content-range if present
  const cr = upstream.headers.get("content-range");
  if (cr) resHeaders.set("Content-Range", cr);
  const cc = upstream.headers.get("accept-ranges");
  if (cc) resHeaders.set("Accept-Ranges", cc);

  return new NextResponse(buf, {
    status: upstream.status === 206 ? 206 : 200,
    headers: resHeaders,
  });
}

function rewritePlaylist(playlist: string, baseUrl: string, referer?: string): string {
  const base = (() => { try { return new URL(baseUrl); } catch { return null; } })();
  if (!base) return playlist;

  const origin = `${base.origin}${base.pathname.slice(0, base.pathname.lastIndexOf("/") + 1)}`;
  const refererParam = referer ? `&referer=${encodeURIComponent(referer)}` : "";

  return playlist
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return line;
      // It's a segment/playlist URL line
      let abs: string;
      if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
        abs = trimmed;
      } else if (trimmed.startsWith("/")) {
        abs = base.origin + trimmed;
      } else {
        abs = origin + trimmed;
      }
      // Encode as same-origin HLS proxy URL
      const ext = abs.includes(".m3u8") ? ".m3u8" : ".ts";
      return `/api/stream/arabic/hls/seg${ext}?src=${encodeURIComponent(abs)}${refererParam}`;
    })
    .join("\n");
}

export async function GET(req: NextRequest) { return proxy(req); }
export async function HEAD(req: NextRequest) { return proxy(req); }
