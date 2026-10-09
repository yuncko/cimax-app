/**
 * TopCinema provider — WordPress-like + iframe chain → shared host resolver.
 * Inferred from CimaClub/TopCinema shared hosting pattern.
 * Gated by TOPCINEMA_ENABLED env (experimental in Phase 1).
 */
import * as cheerio from "cheerio";
import type { ArabicProvider, SearchHit, UnifiedSource } from "../arabicUnified";
import { fetchHtml, parseQuality } from "../arabicUnified";
import { resolveHost } from "../hosts/resolver";

const DEFAULT_MIRROR = "https://web6.topcinema.cam";

function getBase(): string {
  return process.env.TOPCINEMA_MIRROR?.trim() || DEFAULT_MIRROR;
}

async function search(query: string, signal?: AbortSignal): Promise<SearchHit[]> {
  const base = getBase();
  const urls = [
    `${base}/?s=${encodeURIComponent(query)}`,
    `${base}/search/${encodeURIComponent(query)}`,
  ];
  const hits: SearchHit[] = [];
  for (const url of urls) {
    const html = await fetchHtml(url, { signal, timeoutMs: 8000 });
    if (!html) continue;
    const $ = cheerio.load(html);
    // Common WP selectors
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
      hits.push({ provider: "topcinema", id: abs, title, url: abs });
    });
    if (hits.length > 0) break;
    // Fallback anchors
    $("a[href]").each((_, el) => {
      const href = $(el).attr("href") || "";
      const t = $(el).text().trim();
      if (t.length < 4) return;
      if (!href.includes("/watch/") && !href.includes("/movie/") && !href.includes("/film/") && !href.includes("/series/")) return;
      let abs = href;
      try { abs = new URL(href, base).toString(); } catch {}
      if (abs.startsWith("http") && !hits.some((h) => h.url === abs)) {
        hits.push({ provider: "topcinema", id: abs, title: t.slice(0, 120), url: abs });
      }
    });
    if (hits.length > 0) break;
  }
  return hits.slice(0, 8);
}

async function getSources(hitUrl: string, season?: number, episode?: number, signal?: AbortSignal): Promise<UnifiedSource[]> {
  const start = Date.now();
  const html = await fetchHtml(hitUrl, { signal, timeoutMs: 8000 });
  if (!html) return [];
  const $ = cheerio.load(html);

  // If series, try to find episode link for S/E
  let targetUrl = hitUrl;
  if (season && episode) {
    // Look for season/episode navigation
    const epLink = $(`a[href*="/episode/${episode}"], a[href*="/${season}/${episode}"], a:has-text("${episode}")`)
      .first()
      .attr("href");
    // Broader: any episode list
    const allEps = $("a[href*='/episode/'], a[href*='/watch/'], .episode a, .episodes a")
      .map((_, el) => $(el).attr("href") || "")
      .get()
      .filter(Boolean);
    if (epLink) {
      try { targetUrl = new URL(epLink, hitUrl).toString(); } catch {}
    } else if (allEps.length > 0) {
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
        provider: "topcinema",
        url: resolved.url,
        quality: parseQuality(resolved.url),
        isHls: resolved.isHls,
        headers: resolved.headers,
        label: `TopCinema ${parseQuality(resolved.url)}`,
        latencyMs: Date.now() - start,
        host: resolved.host,
      });
    } else if (src.includes(".mp4") || src.includes(".m3u8") || src.includes("filemoon") || src.includes("voe") || src.includes("dood") || src.includes("uqload") || src.includes("streamtape") || src.includes("mixdrop") || src.includes("vidbam")) {
      sources.push({
        provider: "topcinema",
        url: src,
        quality: parseQuality(src),
        isHls: src.includes(".m3u8"),
        headers: { Referer: targetUrl },
        label: `TopCinema ${parseQuality(src)}`,
        latencyMs: Date.now() - start,
      });
    }
  }

  // Also check for watch button href that leads to iframe page
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
          if (src.includes("facebook") || src.includes("twitter")) continue;
          if (!src.startsWith("http")) continue;
          const resolved = await resolveHost(src, abs);
          if (resolved) {
            sources.push({
              provider: "topcinema",
              url: resolved.url,
              quality: parseQuality(resolved.url),
              isHls: resolved.isHls,
              headers: resolved.headers,
              label: `TopCinema ${parseQuality(resolved.url)}`,
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

export const topcinema: ArabicProvider = {
  id: "topcinema",
  enabled() {
    // Enabled by default; set TOPCINEMA_DISABLED=1 to skip
    return process.env.TOPCINEMA_DISABLED !== "1";
  },
  search,
  getSources,
};
