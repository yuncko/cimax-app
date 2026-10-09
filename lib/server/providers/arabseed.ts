/**
 * ArabSeed provider — pure Base64 /l/<b64> decoding, no JS packer.
 * Mirrors Gaoc3/arabseed-scraper (auto_fallback_mirror + decode_link).
 * Easiest provider; expected to succeed most often in Phase 1.
 */
import * as cheerio from "cheerio";
import type { ArabicProvider, SearchHit, UnifiedSource } from "../arabicUnified";
import { decodeArabSeedLink, fetchHtml, parseQuality, UA } from "../arabicUnified";
import { resolveHost } from "../hosts/resolver";

// Known mirrors — auto_fallback_mirror pattern: latency race
const MIRRORS = [
  "https://m.asd.ink",
  "https://arabseed.show",
  "https://m.arabseed.show",
  "https://arabseed.live",
  "https://arabseed.sbs",
];

// Allow env override for current mirror
function getBaseMirrors(): string[] {
  const env = process.env.ARABSEED_MIRROR?.trim();
  if (env) return [env, ...MIRRORS.filter((m) => m !== env)];
  return MIRRORS;
}

async function pickFastestMirror(signal?: AbortSignal): Promise<string> {
  const mirrors = getBaseMirrors();
  const controller = new AbortController();
  signal?.addEventListener("abort", () => controller.abort());

  const probes = mirrors.map(async (m) => {
    const start = Date.now();
    try {
      const res = await fetch(m + "/", {
        headers: { "User-Agent": UA, Accept: "text/html,*/*" },
        signal: controller.signal,
        cache: "no-store",
        redirect: "follow",
      });
      if (!res.ok) throw new Error(String(res.status));
      return { mirror: m, ms: Date.now() - start };
    } catch {
      return { mirror: m, ms: Infinity };
    }
  });

  const results = await Promise.all(probes);
  results.sort((a, b) => a.ms - b.ms);
  const best = results.find((r) => r.ms !== Infinity);
  return best ? best.mirror : mirrors[0];
}

let cachedMirror: { url: string; at: number } | null = null;
const MIRROR_TTL = 10 * 60 * 1000;

async function getMirror(signal?: AbortSignal): Promise<string> {
  if (cachedMirror && Date.now() - cachedMirror.at < MIRROR_TTL) return cachedMirror.url;
  const m = await pickFastestMirror(signal);
  cachedMirror = { url: m, at: Date.now() };
  return m;
}

async function searchOnce(base: string, query: string, signal?: AbortSignal): Promise<SearchHit[]> {
  const hits: SearchHit[] = [];

  // Try multiple search URL shapes (site has changed over time)
  const urls = [
    `${base}/find/?word=${encodeURIComponent(query)}`,
    `${base}/find/?find=${encodeURIComponent(query)}`,
    `${base}/?s=${encodeURIComponent(query)}`,
  ];

  for (const url of urls) {
    const html = await fetchHtml(url, { signal, timeoutMs: 8000 });
    if (!html) continue;
    const $ = cheerio.load(html);

    // Multiple selector variants observed across mirrors
    const selectors = [".movie__block", ".MovieBlock", ".postDiv", ".BlockItem", "article", ".film-item"];
    let found = false;
    for (const sel of selectors) {
      const els = $(sel);
      if (els.length === 0) continue;
      els.each((_, el) => {
        const $el = $(el);
        const a = $el.find("a").first();
        const href = a.attr("href");
        const title = (a.attr("title") || $el.find(".title").text() || $el.text()).trim().slice(0, 120);
        if (!href || hits.some((h) => h.url === href)) return;
        // Resolve relative
        let abs = href;
        try { abs = new URL(href, base).toString(); } catch {}
        if (title && abs.startsWith("http")) {
          hits.push({ provider: "arabseed", id: abs, title, url: abs });
          found = true;
        }
      });
      if (found) break;
    }
    if (hits.length > 0) break;

    // Fallback: any anchor to /watch/ or /movie/
    if (hits.length === 0) {
      $("a[href]").each((_, el) => {
        const href = $(el).attr("href") || "";
        const t = $(el).text().trim();
        if (!href || t.length < 2) return;
        const isMovie = href.includes("/watch/") || href.includes("/movie/") || href.includes("/series/") || href.includes("/film/");
        if (!isMovie) return;
        let abs = href;
        try { abs = new URL(href, base).toString(); } catch {}
        if (abs.startsWith("http") && !hits.some((h) => h.url === abs)) {
          hits.push({ provider: "arabseed", id: abs, title: t.slice(0, 120), url: abs });
        }
      });
      if (hits.length > 0) break;
    }
  }

  return hits.slice(0, 8);
}

async function extractSources(detailUrl: string, signal?: AbortSignal): Promise<UnifiedSource[]> {
  const start = Date.now();
  const sources: UnifiedSource[] = [];

  // Fetch detail page to find watch/download links
  const html = await fetchHtml(detailUrl, { signal, timeoutMs: 8000 });
  if (!html) return [];

  const $ = cheerio.load(html);

  // Strategy 1: iframe with play.php?url=<b64> or /l/<b64>
  const iframes = $("iframe").map((_, el) => $(el).attr("src") || $(el).attr("data-src") || "").get().filter(Boolean);

  for (const raw of iframes) {
    let src = raw.trim();
    if (!src) continue;
    // Handle protocol-relative and relative
    if (src.startsWith("//")) src = "https:" + src;
    else if (src.startsWith("/")) {
      try { src = new URL(src, detailUrl).toString(); } catch {}
    }

    // play.php?url=<b64> pattern
    const playMatch = src.match(/play\.php\?url=([^&]+)/);
    if (playMatch) {
      try {
        let b64 = decodeURIComponent(playMatch[1]);
        while (b64.length % 4 !== 0) b64 += "=";
        const decoded = Buffer.from(b64, "base64").toString("utf-8");
        if (decoded.startsWith("http")) {
          // This is an upstream host iframe — resolve it
          const resolved = await resolveHost(decoded, detailUrl);
          if (resolved) {
            sources.push({
              provider: "arabseed",
              url: resolved.url,
              quality: parseQuality(resolved.url),
              isHls: resolved.isHls,
              headers: resolved.headers,
              label: `ArabSeed ${parseQuality(resolved.url)}`,
              latencyMs: Date.now() - start,
              host: resolved.host,
            });
          } else {
            sources.push({
              provider: "arabseed",
              url: decoded,
              quality: parseQuality(decoded),
              isHls: decoded.includes(".m3u8"),
              headers: { Referer: detailUrl },
              label: `ArabSeed ${parseQuality(decoded)}`,
              latencyMs: Date.now() - start,
            });
          }
          continue;
        }
      } catch {}
    }

    // /l/<b64> in iframe src
    if (src.includes("/l/")) {
      const decoded = decodeArabSeedLink(src);
      if (decoded && decoded.startsWith("http")) {
        sources.push({
          provider: "arabseed",
          url: decoded,
          quality: parseQuality(decoded),
          isHls: decoded.includes(".m3u8"),
          headers: { Referer: detailUrl },
          label: `ArabSeed ${parseQuality(decoded)}`,
          latencyMs: Date.now() - start,
        });
        continue;
      }
    }

    // Direct host iframe — try to resolve
    if (src.startsWith("http")) {
      // Skip social embeds
      if (src.includes("facebook") || src.includes("twitter") || src.includes("telegram") || src.includes("youtube")) continue;
      const resolved = await resolveHost(src, detailUrl);
      if (resolved) {
        sources.push({
          provider: "arabseed",
          url: resolved.url,
          quality: parseQuality(resolved.url),
          isHls: resolved.isHls,
          headers: resolved.headers,
          label: `ArabSeed ${parseQuality(resolved.url)}`,
          latencyMs: Date.now() - start,
          host: resolved.host,
        });
      } else {
        // Check if iframe src itself looks like video host
        if (src.includes(".mp4") || src.includes(".m3u8") || src.includes("filemoon") || src.includes("voe") || src.includes("dood") || src.includes("uqload") || src.includes("streamtape")) {
          sources.push({
            provider: "arabseed",
            url: src,
            quality: parseQuality(src),
            isHls: src.includes(".m3u8"),
            headers: { Referer: detailUrl },
            label: `ArabSeed ${parseQuality(src)}`,
            latencyMs: Date.now() - start,
          });
        }
      }
    }
  }

  // Strategy 2: Download list .downloads__links__list li a[href*="/l/"]
  const dlLinks = $(".downloads__links__list a, .download-list a, a[href*='/l/']")
    .map((_, el) => ({ href: $(el).attr("href") || "", text: $(el).text().trim() }))
    .get()
    .filter((x) => x.href.includes("/l/"));

  for (const { href, text } of dlLinks) {
    const decoded = decodeArabSeedLink(href);
    if (!decoded || !decoded.startsWith("http")) continue;
    const qMatch = text.match(/(\d+)\s*p/i);
    const quality = qMatch ? parseQuality(qMatch[0]) : parseQuality(decoded);
    // Don't duplicate
    if (sources.some((s) => s.url === decoded)) continue;
    sources.push({
      provider: "arabseed",
      url: decoded,
      quality,
      isHls: decoded.includes(".m3u8"),
      headers: { Referer: detailUrl },
      label: `ArabSeed ${quality}`,
      latencyMs: Date.now() - start,
    });
  }

  // Strategy 3: Direct watch link extraction via <a class="watchBTn"> fallback
  if (sources.length === 0) {
    const watchHref = $("a.watchBTn, a.watch-btn, a[href*='/watch/']").first().attr("href");
    if (watchHref) {
      let abs = watchHref;
      try { abs = new URL(watchHref, detailUrl).toString(); } catch {}
      const watchHtml = await fetchHtml(abs, { signal, timeoutMs: 8000 });
      if (watchHtml) {
        const $$ = cheerio.load(watchHtml);
        const innerIframes = $$("iframe").map((_, el) => $$(el).attr("src") || "").get().filter(Boolean);
        for (const src of innerIframes) {
          if (src.includes("facebook") || src.includes("twitter")) continue;
          let full = src;
          if (full.startsWith("//")) full = "https:" + full;
          const decoded = full.includes("/l/") ? decodeArabSeedLink(full) : null;
          const finalUrl = decoded || full;
          if (finalUrl.startsWith("http")) {
            const resolved = await resolveHost(finalUrl, abs);
            if (resolved) {
              sources.push({
                provider: "arabseed",
                url: resolved.url,
                quality: parseQuality(resolved.url),
                isHls: resolved.isHls,
                headers: resolved.headers,
                label: `ArabSeed ${parseQuality(resolved.url)}`,
                latencyMs: Date.now() - start,
                host: resolved.host,
              });
            }
          }
        }
      }
    }
  }

  return sources;
}

export const arabseed: ArabicProvider = {
  id: "arabseed",
  enabled() {
    return process.env.ARABSEED_DISABLED !== "1";
  },
  async search(query: string, signal?: AbortSignal): Promise<SearchHit[]> {
    if (!query.trim()) return [];
    const mirror = await getMirror(signal);
    return searchOnce(mirror, query.trim(), signal);
  },
  async getSources(hitUrl: string, _season?: number, _episode?: number, signal?: AbortSignal): Promise<UnifiedSource[]> {
    return extractSources(hitUrl, signal);
  },
};
