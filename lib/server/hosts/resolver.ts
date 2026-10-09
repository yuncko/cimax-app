/**
 * Shared host resolver — decodes direct video URLs from upstream iframe hosts
 * (filemoon, voe, doodstream, uqload, vidbam, mixdrop, streamtape, mp4upload, etc.)
 * Uses unpacker + regex extraction. No headless browser in Phase 1.
 */

import { unpackAllBlocks } from "./unpacker";

export type ResolvedSource = {
  url: string;
  isHls: boolean;
  headers: Record<string, string>;
  host: string;
};

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// Hosts we know how to resolve
const KNOWN_HOSTS = [
  "filemoon", "voe", "dood", "uqload", "vidbam", "mixdrop", "streamtape",
  "mp4upload", "upstream", "vidhide", "streamwish", "vidguard", "lulu",
  "hexload", "yourupload", "pixel", "ok.ru", "uqload", "vidsrc",
];

function isKnownHost(url: string): boolean {
  const h = url.toLowerCase();
  return KNOWN_HOSTS.some((k) => h.includes(k));
}

function buildRefererHeaders(hostUrl: string): Record<string, string> {
  try {
    const u = new URL(hostUrl);
    return {
      Referer: `${u.origin}/`,
      Origin: u.origin,
      "User-Agent": UA,
      Accept: "*/*",
      "Accept-Language": "ar,en-US;q=0.9,en;q=0.8",
    };
  } catch {
    return { "User-Agent": UA };
  }
}

async function fetchHtml(url: string, referer?: string): Promise<string | null> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ar,en-US;q=0.9,en;q=0.8",
        ...(referer ? { Referer: referer } : {}),
      },
      signal: controller.signal,
      cache: "no-store",
      redirect: "follow",
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** Regex extractors — order matters (most specific first) */
const EXTRACTORS: Array<{ name: string; re: RegExp; group: number }> = [
  // JSON file:"https://...m3u8" (FaselHD, Voe, Filemoon)
  { name: "json-file", re: /file\s*:\s*"([^"]+\.m3u8[^"]*)"/i, group: 1 },
  { name: "json-file-mp4", re: /file\s*:\s*"([^"]+\.mp4[^"]*)"/i, group: 1 },
  // <source src="...">
  { name: "source-src", re: /<source[^>]+src=["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i, group: 1 },
  // sources: [{file:"..."}]
  { name: "sources-array", re: /sources\s*:\s*\[\s*\{\s*file\s*:\s*"([^"]+)"/i, group: 1 },
  // Generic https://...m3u8 inside JS strings
  { name: "m3u8-url", re: /"(https?:\/\/[^"]+\.m3u8[^"]*)"/i, group: 1 },
  { name: "mp4-url", re: /"(https?:\/\/[^"]+\.mp4[^"]*)"/i, group: 1 },
  // data hash for mixdrop etc.
  { name: "mixdrop-md5", re: /MD5\s*=\s*"([^"]+)"/i, group: 1 },
];

function extractVideoUrl(html: string): string | null {
  for (const ex of EXTRACTORS) {
    const m = html.match(ex.re);
    if (m?.[ex.group]) {
      let url = m[ex.group].replace(/\\u002F/g, "/").replace(/&amp;/g, "&").replace(/\\\//g, "/");
      if (url.startsWith("//")) url = "https:" + url;
      if (url.startsWith("http")) return url;
    }
  }
  return null;
}

/**
 * Resolve an upstream iframe URL to a direct playable URL.
 * Returns null if host is unknown or extraction fails — caller should skip gracefully.
 */
export async function resolveHost(iframeUrl: string, referer?: string): Promise<ResolvedSource | null> {
  if (!iframeUrl || !iframeUrl.startsWith("http")) return null;

  const headers = buildRefererHeaders(iframeUrl);

  // Some hosts (e.g. voe.sx) require following redirects and detecting bait
  let html = await fetchHtml(iframeUrl, referer);
  if (!html) return null;

  // Check for redirect inside scripts (found in voe research)
  const redirectMatch = html.match(/window\.location\.(?:href|replace)\s*=\s*['"]([^'"]+)['"]/);
  if (redirectMatch?.[1]) {
    const redirUrl = redirectMatch[1].startsWith("http") ? redirectMatch[1] : new URL(redirectMatch[1], iframeUrl).toString();
    const redirHtml = await fetchHtml(redirUrl, iframeUrl);
    if (redirHtml) html = redirHtml;
  }

  // Unpack p.a.c.k.e.r if present
  const hasPacker = html.includes("eval(function(p,a,c,k");
  if (hasPacker) {
    html = unpackAllBlocks(html);
  }

  const videoUrl = extractVideoUrl(html);
  if (!videoUrl) return null;

  const isHls = videoUrl.includes(".m3u8");
  // Preserve Referer for playback (player needs it for hls.js xhrSetup)
  const playbackHeaders: Record<string, string> = {
    Referer: `https://${new URL(iframeUrl).host}/`,
    Origin: new URL(iframeUrl).origin,
  };

  return {
    url: videoUrl,
    isHls,
    headers: playbackHeaders,
    host: new URL(iframeUrl).host,
  };
}

/**
 * Try to resolve; on failure return the iframe URL itself as playable
 * (some providers like ArabSeed already return direct mp4upload links that work without unpacking)
 */
export async function resolveHostOrPassthrough(iframeUrl: string, referer?: string): Promise<ResolvedSource> {
  const resolved = await resolveHost(iframeUrl, referer);
  if (resolved) return resolved;
  // Passthrough — let the player try the iframe URL directly (e.g. some mp4upload links are direct)
  return {
    url: iframeUrl,
    isHls: iframeUrl.includes(".m3u8"),
    headers: buildRefererHeaders(iframeUrl),
    host: (() => { try { return new URL(iframeUrl).host; } catch { return "unknown"; } })(),
  };
}

export { isKnownHost, buildRefererHeaders };
