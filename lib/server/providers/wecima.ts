/**
 * Wecima / MyCima provider — WordPress-like + iframe chain.
 * Mirrors observed pattern: mycima.buzz:2096 API + WP HTML fallback.
 * Also covers wecima / cima4u mirrors.
 */
import * as cheerio from "cheerio";
import type { ArabicProvider, SearchHit, UnifiedSource } from "../arabicUnified";
import { fetchHtml, parseQuality, UA } from "../arabicUnified";
import { resolveHost } from "../hosts/resolver";

const DEFAULT_MIRRORS = [
  "https://wecima.tube",
  "https://wecima.show",
  "https://mycima.buzz",
  "https://wecima.cam",
];

function getBase(): string {
  return process.env.WECIMA_MIRROR?.trim() || DEFAULT_MIRRORS[0];
}

async function tryMycimaApi(query: string, signal?: AbortSignal): Promise<SearchHit[]> {
  // Observed in Flutter app: https://mycima.buzz:2096/api  — try if available
  const apiBase = process.env.MYCIMA_API?.trim() || "https://mycima.buzz:2096";
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);
  const t = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(`${apiBase}/search?q=${encodeURIComponent(query)}`, {
      headers: { "User-Agent": UA, Accept: "application/json,*/*" },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) return [];
    const json = (await res.json()) as Record<string, unknown>;
    const arr = Array.isArray(json) ? json : (Array.isArray(json.data) ? json.data : Array.isArray(json.results) ? json.results : []);
    return (arr as Record<string, unknown>[]).slice(0, 8).map((row) => {
      const url = String(row.url || row.link || row.href || "");
      const title = String(row.title || row.name || query);
      return { provider: "wecima", id: url || title, title, url: url || `${getBase()}/?s=${encodeURIComponent(query)}` };
    }).filter((h) => h.url);
  } catch {
    return [];
  } finally {
    clearTimeout(t);
    signal?.removeEventListener("abort", onAbort);
  }
}

async function searchHtml(query: string, signal?: AbortSignal): Promise<SearchHit[]> {
  const bases = [getBase(), ...DEFAULT_MIRRORS.filter((m) => m !== getBase())];
  for (const base of bases) {
    const html = await fetchHtml(`${base}/?s=${encodeURIComponent(query)}`, { signal, timeoutMs: 8000 });
    if (!html) continue;
    const $ = cheerio.load(html);
    const hits: SearchHit[] = [];
    const cards = $(".BlockItem, .MovieBlock, article, .post, .film-item, .item");
    cards.each((_, el) => {
      const $el = $(el);
      const a = $el.find("a").first();
      const href = a.attr("href") || "";
      const title = (a.attr("title") || $el.find(".title, h3, h2").text() || a.text()).trim().slice(0, 120);
      if (!href || !title) return;
      let abs = href;
      try { abs = new URL(href, base).toString(); } catch {}
      if (!abs.startsWith("http") || hits.some((h) => h.url === abs)) return;
      hits.push({ provider: "wecima", id: abs, title, url: abs });
    });
    if (hits.length > 0) return hits.slice(0, 8);
    // Anchor fallback
    $("a[href]").each((_, el) => {
      const href = $(el).attr("href") || "";
      const t = $(el).text().trim();
      if (t.length < 4) return;
      if (!href.includes("/watch/") && !href.includes("/movie/") && !href.includes("/film/") && !href.includes("/series/")) return;
      let abs = href;
      try { abs = new URL(href, base).toString(); } catch {}
      if (abs.startsWith("http") && !hits.some((h) => h.url === abs)) {
        hits.push({ provider: "wecima", id: abs, title: t.slice(0, 120), url: abs });
      }
    });
    if (hits.length > 0) return hits.slice(0, 8);
  }
  return [];
}

async function getSources(hitUrl: string, season?: number, episode?: number, signal?: AbortSignal): Promise<UnifiedSource[]> {
  const start = Date.now();
  const html = await fetchHtml(hitUrl, { signal, timeoutMs: 8000 });
  if (!html) return [];
  const $ = cheerio.load(html);

  let targetUrl = hitUrl;
  if (season && episode) {
    const allEps = $("a[href*='/episode/'], a[href*='/watch/'], .episode a, .episodes a")
      .map((_, el) => $(el).attr("href") || "")
      .get()
      .filter(Boolean);
    if (allEps.length > 0) {
      const idx = Math.min(episode - 1, allEps.length - 1);
      const chosen = allEps[idx] || allEps[0];
      try { targetUrl = new URL(chosen, hitUrl).toString(); } catch {}
    }
  }

  let targetHtml = html;
  if (targetUrl !== hitUrl) {
    const h = await fetchHtml(targetUrl, { signal, timeoutMs: 8000 });
    if (h) targetHtml = h;
  }

  const $$ = targetUrl !== hitUrl ? cheerio.load(targetHtml) : $;
  const iframes = $$("iframe").map((_, el) => $$(el).attr("src") || $$(el).attr("data-src") || "").get().filter(Boolean);

  const sources: UnifiedSource[] = [];
  for (const raw of iframes) {
    let src = raw.trim();
    if (!src) continue;
    if (src.startsWith("//")) src = "https:" + src;
    else if (src.startsWith("/")) {
      try { src = new URL(src, targetUrl).toString(); } catch { continue; }
    }
    if (src.includes("facebook") || src.includes("twitter") || src.includes("telegram") || src.includes("youtube")) continue;
    const resolved = await resolveHost(src, targetUrl);
    if (resolved) {
      sources.push({
        provider: "wecima",
        url: resolved.url,
        quality: parseQuality(resolved.url),
        isHls: resolved.isHls,
        headers: resolved.headers,
        label: `Wecima ${parseQuality(resolved.url)}`,
        latencyMs: Date.now() - start,
        host: resolved.host,
      });
    } else if (src.includes(".mp4") || src.includes(".m3u8") || src.includes("filemoon") || src.includes("voe") || src.includes("dood") || src.includes("uqload") || src.includes("streamtape") || src.includes("mixdrop") || src.includes("vidbam") || src.includes("mp4upload")) {
      sources.push({
        provider: "wecima",
        url: src,
        quality: parseQuality(src),
        isHls: src.includes(".m3u8"),
        headers: { Referer: targetUrl },
        label: `Wecima ${parseQuality(src)}`,
        latencyMs: Date.now() - start,
      });
    }
  }

  if (sources.length === 0) {
    const watchHref = $$("a.watchBTn, a.watch-btn, a[href*='/watch/']").first().attr("href");
    if (watchHref) {
      let abs = watchHref;
      try { abs = new URL(watchHref, targetUrl).toString(); } catch {}
      const wHtml = await fetchHtml(abs, { signal, timeoutMs: 8000 });
      if (wHtml) {
        const $$$ = cheerio.load(wHtml);
        const wIframes = $$$("iframe").map((_, el) => $$$(el).attr("src") || "").get().filter(Boolean);
        for (const raw of wIframes) {
          let src = raw.trim();
          if (src.startsWith("//")) src = "https:" + src;
          if (!src.startsWith("http") || src.includes("facebook") || src.includes("twitter")) continue;
          const resolved = await resolveHost(src, abs);
          if (resolved) {
            sources.push({
              provider: "wecima",
              url: resolved.url,
              quality: parseQuality(resolved.url),
              isHls: resolved.isHls,
              headers: resolved.headers,
              label: `Wecima ${parseQuality(resolved.url)}`,
              latencyMs: Date.now() - start,
              host: resolved.host,
            });
          }
        }
      }
    }
  }

  return sources;
}

export const wecima: ArabicProvider = {
  id: "wecima",
  enabled() {
    return process.env.WECIMA_DISABLED !== "1";
  },
  async search(query: string, signal?: AbortSignal): Promise<SearchHit[]> {
    if (!query.trim()) return [];
    // Try API first, then HTML
    const apiHits = await tryMycimaApi(query.trim(), signal);
    if (apiHits.length > 0) return apiHits;
    return searchHtml(query.trim(), signal);
  },
  async getSources(hitUrl: string, season?: number, episode?: number, signal?: AbortSignal): Promise<UnifiedSource[]> {
    if (!hitUrl) return [];
    return getSources(hitUrl, season, episode, signal);
  },
};
