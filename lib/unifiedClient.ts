/**
 * Client helpers for the unified Arabic stream server — mirrors lib/arabicClient.ts
 */

export type UnifiedSourceClient = {
  provider: string;
  url: string;
  quality: string;
  isHls: boolean;
  headers?: Record<string, string>;
  label: string;
  latencyMs: number;
  host?: string;
};

export type UnifiedSourcesResult = {
  sources: UnifiedSourceClient[];
  best: UnifiedSourceClient | null;
  timings?: Record<string, number>;
  tookMs?: number;
  query?: string;
  error?: string;
};

export async function searchUnifiedClient(q: string): Promise<{ hits: Array<{ provider: string; id: string; title: string; url: string }>; providerTimings: Record<string, number> }> {
  const res = await fetch(`/api/stream/arabic/search?q=${encodeURIComponent(q)}`);
  if (!res.ok) return { hits: [], providerTimings: {} };
  const data = await res.json();
  return { hits: data.hits || [], providerTimings: data.providerTimings || {} };
}

export async function fetchUnifiedSourcesClient(
  tmdbId: number,
  type: "movie" | "tv",
  title: string,
  season?: number,
  episode?: number,
  lang: string = "ar"
): Promise<UnifiedSourcesResult | null> {
  const qs = new URLSearchParams({
    tmdbId: String(tmdbId),
    type,
    q: title,
    lang,
  });
  if (season) qs.set("s", String(season));
  if (episode) qs.set("e", String(episode));
  const res = await fetch(`/api/stream/arabic/sources?${qs.toString()}`);
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    return { sources: [], best: null, error: data?.error || `HTTP ${res.status}`, timings: data?.timings };
  }
  return data as UnifiedSourcesResult;
}

export async function fetchUnifiedExtractClient(url: string, provider?: string): Promise<{ url: string; isHls: boolean; headers?: Record<string, string> } | null> {
  const qs = new URLSearchParams({ url });
  if (provider) qs.set("provider", provider);
  const res = await fetch(`/api/stream/arabic/extract?${qs.toString()}`);
  if (!res.ok) return null;
  const data = await res.json();
  if (!data?.url) return null;
  return data;
}
