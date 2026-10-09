/**
 * FaselHD provider — API-first (netcore) + HTML fallback + scdns embed decoder.
 * Mirrors mhasan411/faselhd_api_node (getContent, getDirectLink).
 * Requires Bearer token in env FASELHD_TOKEN; without it, HTML fallback is tried.
 */
import * as cheerio from "cheerio";
import type { ArabicProvider, SearchHit, UnifiedSource } from "../arabicUnified";
import { fetchHtml, parseQuality, UA } from "../arabicUnified";
import { decodeFaselhdEmbed } from "../hosts/unpacker";

const NETCORE = "https://netcore.faselhd.pro/api/v1.0";
const FASEL_EMBED = "https://faselhd-embed.scdns.io/video_player";
const FASEL_WEB = "https://www.faselhd.pro";

function getToken(): string {
  return process.env.FASELHD_TOKEN?.trim() || "";
}

// ── API search (preferred) ──
async function searchViaApi(query: string, signal?: AbortSignal): Promise<SearchHit[]> {
  const token = getToken();
  if (!token) return [];

  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);
  const t = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(`${NETCORE}/Content/ContentSearch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        "User-Agent": UA,
      },
      body: JSON.stringify({
        pageNumber: 1,
        pageSize: 12,
        data: { searchText: query },
      }),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) return [];
    const json = (await res.json()) as Record<string, unknown>;
    // Response shape varies: { data: [...] } or { contents: [...] } or direct array
    const arr: Record<string, unknown>[] =
      (Array.isArray(json) ? json : null) ||
      (Array.isArray(json.data) ? json.data as Record<string, unknown>[] : null) ||
      (Array.isArray((json as Record<string, unknown>).contents) ? (json as Record<string, unknown>).contents as Record<string, unknown>[] : null) ||
      (Array.isArray((json as Record<string, unknown>).result) ? (json as Record<string, unknown>).result as Record<string, unknown>[] : null) ||
      [];
    return arr.slice(0, 8).map((row) => {
      const id = String(row.id || row.Id || row.contentId || row.ContentId || "");
      const title = String(row.title || row.Title || row.name || row.Name || query);
      // Build detail URL if possible; otherwise use id as url for getSources
      const url = id ? `${FASEL_WEB}/?p=${id}` : "";
      return { provider: "faselhd", id, title, url: url || `${NETCORE}/Content/GetContent?ContentId=${id}`, year: String(row.year || row.Year || "") };
    }).filter((h) => h.id);
  } catch {
    return [];
  } finally {
    clearTimeout(t);
    signal?.removeEventListener("abort", onAbort);
  }
}

async function searchViaHtml(query: string, signal?: AbortSignal): Promise<SearchHit[]> {
  const html = await fetchHtml(`${FASEL_WEB}/?s=${encodeURIComponent(query)}`, { signal, timeoutMs: 8000 });
  if (!html) return [];
  const $ = cheerio.load(html);
  const hits: SearchHit[] = [];
  // .postDiv is the FaselHD card (research)
  const cards = $(".postDiv, .post, article, .movie-block");
  cards.each((_, el) => {
    const $el = $(el);
    const a = $el.find("a").first();
    const href = a.attr("href") || $el.find("a[href*='/']").attr("href") || "";
    const title = ($el.find(".title, .postTitle, h3, h2").text() || a.text()).trim().slice(0, 120);
    if (!href || !title) return;
    if (hits.some((h) => h.url === href)) return;
    hits.push({ provider: "faselhd", id: href, title, url: href.startsWith("http") ? href : new URL(href, FASEL_WEB).toString() });
  });
  // Broader fallback: any link on search page
  if (hits.length === 0) {
    $("a[href]").each((_, el) => {
      const href = $(el).attr("href") || "";
      const t = $(el).text().trim();
      if (!href.includes("faselhd") && !href.startsWith("/") && !href.startsWith(FASEL_WEB)) return;
      if (t.length < 3) return;
      const abs = href.startsWith("http") ? href : new URL(href, FASEL_WEB).toString();
      if (!hits.some((h) => h.url === abs)) hits.push({ provider: "faselhd", id: abs, title: t.slice(0, 120), url: abs });
    });
  }
  return hits.slice(0, 8);
}

// ── Embed decoder → HLS sources ──

const QUALITY_KEYS: Record<string, string> = { "1080": "1080p", "720": "720p", "480": "480p", "360": "360p" };

async function resolveFaselEmbed(videoId: string, signal?: AbortSignal): Promise<UnifiedSource[]> {
  const start = Date.now();
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);
  const t = setTimeout(() => controller.abort(), 10000);

  try {
    // videoId may be a full URL or a bare id
    let vid = videoId;
    // If it's a URL, try to extract vid param or slug
    if (vid.startsWith("http")) {
      const u = new URL(vid);
      vid = u.searchParams.get("vid") || u.searchParams.get("id") || u.pathname.split("/").filter(Boolean).pop() || vid;
    }

    const embedUrl = `${FASEL_EMBED}?uid=0&vid=${encodeURIComponent(vid)}`;
    const res = await fetch(embedUrl, {
      headers: {
        "User-Agent": UA,
        Referer: `${FASEL_WEB}/`,
        Accept: "*/*",
      },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) return [];
    const script = await res.text();

    // Try bespoke decoder first
    const page = decodeFaselhdEmbed(script);
    const html = page || script;

    // Extract master m3u8
    let masterUrl: string | null = null;
    const fileMatch = html.match(/file\s*:\s*"([^"]+\.m3u8[^"]*)"/i) || html.match(/file":"([^"]+\.m3u8[^"]*)"/i);
    if (fileMatch) {
      masterUrl = fileMatch[1].replace(/\\u002F/g, "/").replace(/&amp;/g, "&").replace(/\\\//g, "/");
      if (masterUrl.startsWith("//")) masterUrl = "https:" + masterUrl;
    }
    // Broader: any https .m3u8
    if (!masterUrl) {
      const m = html.match(/(https?:\/\/[^"'\s]+\.m3u8[^"'\s]*)/i);
      if (m) masterUrl = m[1];
    }
    if (!masterUrl) return [];

    // Fetch master playlist to enumerate qualities
    const playlistRes = await fetch(masterUrl, {
      headers: { "User-Agent": UA, Referer: "https://faselhd-embed.scdns.io/" },
      signal: controller.signal,
      cache: "no-store",
    });

    const sources: UnifiedSource[] = [];

    if (playlistRes.ok) {
      const playlist = await playlistRes.text();
      // Lines like: https://.../720b_playlist.m3u8  or  1080p.m3u8
      const lines = playlist.split("\n").map((l) => l.trim()).filter(Boolean);
      for (const line of lines) {
        if (!line.includes(".m3u8")) continue;
        // Extract quality from filename: 1080b_playlist.m3u8 or 720p
        const qMatch = line.match(/(\d{3,4})[bp]_playlist\.m3u8/i) || line.match(/(\d{3,4})p/i);
        const qNum = qMatch ? qMatch[1] : "";
        const quality = (QUALITY_KEYS[qNum] as UnifiedSource["quality"]) || parseQuality(qNum + "p");
        // Resolve relative URLs against master
        let absUrl = line;
        if (!absUrl.startsWith("http")) {
          try { absUrl = new URL(line, masterUrl).toString(); } catch { continue; }
        }
        sources.push({
          provider: "faselhd",
          url: absUrl,
          quality,
          isHls: true,
          headers: { Referer: "https://faselhd-embed.scdns.io/", Origin: "https://faselhd-embed.scdns.io" },
          label: `FaselHD ${quality}`,
          latencyMs: Date.now() - start,
        });
      }
    }

    // If playlist parsing found nothing, return master itself
    if (sources.length === 0) {
      sources.push({
        provider: "faselhd",
        url: masterUrl,
        quality: parseQuality(masterUrl),
        isHls: true,
        headers: { Referer: "https://faselhd-embed.scdns.io/", Origin: "https://faselhd-embed.scdns.io" },
        label: `FaselHD ${parseQuality(masterUrl)}`,
        latencyMs: Date.now() - start,
      });
    }

    return sources;
  } catch {
    return [];
  } finally {
    clearTimeout(t);
    signal?.removeEventListener("abort", onAbort);
  }
}

async function extractFromDetailPage(detailUrl: string, signal?: AbortSignal): Promise<UnifiedSource[]> {
  const html = await fetchHtml(detailUrl, { signal, timeoutMs: 8000 });
  if (!html) return [];
  const $ = cheerio.load(html);

  // Try: seasonDiv[onclick*=window.location.href] → episode links
  const episodeLinks = $("div.seasonDiv, .seasonDiv, .episode-link, a[href*='/episode/']")
    .map((_, el) => $(el).attr("onclick") || $(el).attr("href") || "")
    .get()
    .filter(Boolean)
    .map((s) => {
      const m = s.match(/window\.location\.href\s*=\s*['"]([^'"]+)['"]/);
      return m ? m[1] : s;
    })
    .filter((u) => u.startsWith("http") || u.startsWith("/"))
    .map((u) => u.startsWith("http") ? u : new URL(u, FASEL_WEB).toString());

  // Find iframe(s)
  const iframes = $("iframe").map((_, el) => $(el).attr("src") || "").get().filter(Boolean);

  // If we have iframes directly on detail, try to resolve
  for (const src of iframes) {
    let full = src.startsWith("//") ? "https:" + src : src.startsWith("/") ? new URL(src, FASEL_WEB).toString() : src;
    if (full.includes("faselhd-embed.scdns.io")) {
      const vid = new URL(full).searchParams.get("vid") || "";
      if (vid) return resolveFaselEmbed(vid, signal);
    }
  }

  // If we have episode links, we only resolve the first (caller will paginate seasons)
  if (episodeLinks.length > 0) {
    // Fetch first episode page to find embed
    const epHtml = await fetchHtml(episodeLinks[0], { signal, timeoutMs: 8000 });
    if (epHtml) {
      const $$ = cheerio.load(epHtml);
      const epIframes = $$("iframe").map((_, el) => $$(el).attr("src") || "").get().filter(Boolean);
      for (const src of epIframes) {
        let full = src.startsWith("//") ? "https:" + src : src.startsWith("/") ? new URL(src, FASEL_WEB).toString() : src;
        if (full.includes("faselhd-embed.scdns.io")) {
          const vid = new URL(full).searchParams.get("vid") || "";
          if (vid) return resolveFaselEmbed(vid, signal);
        }
      }
    }
  }

  // Fallback: look for vid param anywhere in html
  const vidMatch = html.match(/vid\s*=\s*["']([^"']+)["']/i) || html.match(/faselhd-embed[^"']*vid=([^&"']+)/i);
  if (vidMatch) return resolveFaselEmbed(vidMatch[1], signal);

  return [];
}

export const faselhd: ArabicProvider = {
  id: "faselhd",
  enabled() {
    return process.env.FASELHD_DISABLED !== "1";
  },
  async search(query: string, signal?: AbortSignal): Promise<SearchHit[]> {
    if (!query.trim()) return [];
    // Try API first if token present, otherwise HTML
    const apiHits = await searchViaApi(query.trim(), signal);
    if (apiHits.length > 0) return apiHits;
    return searchViaHtml(query.trim(), signal);
  },
  async getSources(hitUrl: string, _season?: number, _episode?: number, signal?: AbortSignal): Promise<UnifiedSource[]> {
    if (!hitUrl) return [];
    // If hitUrl is a bare API id, resolve via embed directly
    if (!hitUrl.startsWith("http") || hitUrl.includes("netcore")) {
      // Extract id from hitUrl
      const id = hitUrl.split("/").pop() || hitUrl;
      return resolveFaselEmbed(id, signal);
    }
    // If hitUrl already looks like embed
    if (hitUrl.includes("faselhd-embed.scdns.io")) {
      const vid = new URL(hitUrl).searchParams.get("vid") || hitUrl;
      return resolveFaselEmbed(vid, signal);
    }
    return extractFromDetailPage(hitUrl, signal);
  },
};
