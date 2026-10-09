/**
 * Unified Arabic streaming provider abstraction — server-only.
 * Plugin-per-site + shared host resolver. Secrets stay server-side.
 * Mirrors lib/server/arabic.ts patterns (cache TTL, private Cache-Control, no NEXT_PUBLIC_).
 */

export type UnifiedQuality = "1080p" | "720p" | "480p" | "360p" | "240p";
export type UnifiedSource = {
  provider: string; // "faselhd" | "arabseed" | "topcinema" | "wecima"
  url: string; // playable (mp4 or m3u8)
  quality: UnifiedQuality;
  isHls: boolean;
  headers?: Record<string, string>; // required Referer/Origin for playback
  label: string; // e.g. "FaselHD 1080p"
  latencyMs: number;
  host?: string;
};

export type SearchHit = {
  provider: string;
  id: string;
  title: string;
  url: string;
  year?: string;
  poster?: string;
};

export interface ArabicProvider {
  id: string;
  enabled(): boolean;
  search(query: string, signal?: AbortSignal): Promise<SearchHit[]>;
  getSources(hitUrl: string, season?: number, episode?: number, signal?: AbortSignal): Promise<UnifiedSource[]>;
}

// ── Helpers ──

export const QUALITY_RANK: Record<string, number> = {
  "1080p": 4, "720p": 3, "480p": 2, "360p": 1, "240p": 0,
};

export function parseQuality(label: string): UnifiedQuality {
  const m = label.match(/(\d+)\s*p/i);
  if (!m) return "720p";
  const n = parseInt(m[1], 10);
  if (n >= 1080) return "1080p";
  if (n >= 720) return "720p";
  if (n >= 480) return "480p";
  if (n >= 360) return "360p";
  return "240p";
}

export function sortSources(sources: UnifiedSource[]): UnifiedSource[] {
  return [...sources].sort((a, b) => {
    const qr = (QUALITY_RANK[b.quality] ?? 0) - (QUALITY_RANK[a.quality] ?? 0);
    if (qr !== 0) return qr;
    return a.latencyMs - b.latencyMs;
  });
}

export function pickBest(sources: UnifiedSource[]): UnifiedSource | null {
  if (sources.length === 0) return null;
  return sortSources(sources)[0];
}

export const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export async function fetchHtml(
  url: string,
  opts: { referer?: string; signal?: AbortSignal; timeoutMs?: number } = {}
): Promise<string | null> {
  const timeoutMs = opts.timeoutMs ?? 10000;
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  opts.signal?.addEventListener("abort", onAbort);
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,application/json,*/*;q=0.8",
        "Accept-Language": "ar,en-US;q=0.9,en;q=0.8",
        ...(opts.referer ? { Referer: opts.referer } : {}),
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
    opts.signal?.removeEventListener("abort", onAbort);
  }
}

export async function fetchJson<T>(url: string, opts: { headers?: Record<string, string>; signal?: AbortSignal; timeoutMs?: number } = {}): Promise<T | null> {
  const timeoutMs = opts.timeoutMs ?? 10000;
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  opts.signal?.addEventListener("abort", onAbort);
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "application/json,*/*",
        "Accept-Language": "ar,en-US;q=0.9,en;q=0.8",
        ...(opts.headers || {}),
      },
      signal: controller.signal,
      cache: "no-store",
      redirect: "follow",
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
    opts.signal?.removeEventListener("abort", onAbort);
  }
}

export function withTimeout<T>(promise: Promise<T>, ms: number, signal?: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new Error("aborted"));
    };
    signal?.addEventListener("abort", onAbort);
    promise.then(
      (v) => { clearTimeout(t); signal?.removeEventListener("abort", onAbort); resolve(v); },
      (e) => { clearTimeout(t); signal?.removeEventListener("abort", onAbort); reject(e); }
    );
  });
}

/**
 * Decode ArabSeed-style /l/<base64> links — mirrors Gaoc3/arabseed-scraper decode_link()
 */
export function decodeArabSeedLink(obfuscatedUrl: string): string | null {
  try {
    const idx = obfuscatedUrl.indexOf("/l/");
    if (idx === -1) return null;
    let b64 = obfuscatedUrl.slice(idx + 3).split("/")[0].split("?")[0].split("#")[0];
    b64 = decodeURIComponent(b64);
    // pad
    while (b64.length % 4 !== 0) b64 += "=";
    return Buffer.from(b64, "base64").toString("utf-8");
  } catch {
    return null;
  }
}

/**
 * Normalize TMDB title for Arabic search — strip year suffixes, take first alias
 */
export function normalizeQuery(title: string): string {
  return title
    .replace(/\s*\(\d{4}\)\s*$/, "")
    .replace(/\s*:\s*.*$/, "") // "Title: Subtitle" → "Title" for broader match
    .trim()
    .slice(0, 80);
}
