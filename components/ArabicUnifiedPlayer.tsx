"use client";
import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useLanguage } from "./LanguageProvider";
import type { UnifiedSourceClient } from "@/lib/unifiedClient";

type Props = {
  sources: UnifiedSourceClient[];
  title: string;
  onEnded?: () => void;
  autoPlay?: boolean;
};

const QUALITY_ORDER = ["1080p", "720p", "480p", "360p", "240p"];

function qualityRank(q: string): number {
  const i = QUALITY_ORDER.indexOf(q);
  return i === -1 ? -1 : QUALITY_ORDER.length - i;
}

export function ArabicUnifiedPlayer({ sources, title, onEnded, autoPlay }: Props) {
  const { locale } = useLanguage();
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<unknown>(null);
  const [active, setActive] = useState<UnifiedSourceClient | null>(() => sources[0] || null);
  const [error, setError] = useState<string | null>(null);
  const [hlsReady, setHlsReady] = useState(false);

  // Keep active in sync when sources change (e.g. season/episode switch)
  useEffect(() => {
    if (sources.length === 0) { setActive(null); return; }
    // Prefer same quality if possible, otherwise best
    if (active) {
      const sameQ = sources.find((s) => s.quality === active.quality);
      setActive(sameQ || sources[0]);
    } else {
      setActive(sources[0]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sources.map((s) => s.url).join("|")]);

  // Group by quality for pills
  const byQuality = (() => {
    const m = new Map<string, UnifiedSourceClient[]>();
    for (const s of sources) {
      const arr = m.get(s.quality) || [];
      arr.push(s);
      m.set(s.quality, arr);
    }
    return m;
  })();

  const availableQualities = [...byQuality.keys()].sort((a, b) => qualityRank(b) - qualityRank(a));

  // HLS handling
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !active) return;

    // Cleanup previous hls
    const prev = hlsRef.current as { destroy?: () => void } | null;
    if (prev?.destroy) { try { prev.destroy(); } catch {} hlsRef.current = null; }

    setError(null);
    setHlsReady(false);

    if (!active.isHls) {
      // Native mp4
      video.src = active.url;
      video.load();
      if (autoPlay) video.play().catch(() => {});
      return;
    }

    // HLS — try native first (Safari), then hls.js
    const canNativeHls = video.canPlayType("application/vnd.apple.mpegurl") !== "";
    if (canNativeHls) {
      // Use HLS proxy so Referer is preserved? For native HLS we pass direct URL.
      video.src = active.url;
      video.load();
      if (autoPlay) video.play().catch(() => {});
      setHlsReady(true);
      return;
    }

    // Dynamic import hls.js (client-only)
    let cancelled = false;
    import("hls.js").then((mod) => {
      if (cancelled) return;
      const Hls = (mod as unknown as { default: unknown }).default as unknown as {
        isSupported: () => boolean;
        new (cfg: unknown): { loadSource: (u: string) => void; attachMedia: (v: HTMLVideoElement) => void; on: (e: string, cb: (...a: unknown[]) => void) => void; destroy: () => void };
        Events: { MANIFEST_PARSED: string; ERROR: string };
      };
      if (!Hls.isSupported()) {
        setError(locale === "en" ? "HLS not supported in this browser" : "المتصفح لا يدعم HLS");
        return;
      }
      // Build proxied HLS URL so Referer is forwarded via query param
      const referer = active.headers?.Referer || active.headers?.referer || "";
      const proxiedSrc = `/api/stream/arabic/hls/playlist.m3u8?src=${encodeURIComponent(active.url)}${referer ? `&referer=${encodeURIComponent(referer)}` : ""}`;

      const hls = new Hls({
        xhrSetup: (xhr: XMLHttpRequest, url: string) => {
          // Ensure Referer is sent for segment fetches that go through our proxy (proxy already handles it)
          void url;
          void xhr;
        },
      });
      hlsRef.current = hls;
      hls.loadSource(proxiedSrc);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setHlsReady(true);
        if (autoPlay) video.play().catch(() => {});
      });
      hls.on(Hls.Events.ERROR, (_evt: unknown, data: unknown) => {
        const d = data as { fatal?: boolean; type?: string; details?: string };
        if (d?.fatal) {
          setError(d.details || d.type || "HLS error");
        }
      });
    }).catch(() => {
      setError(locale === "en" ? "Failed to load player" : "فشل تحميل المشغّل");
    });

    return () => {
      cancelled = true;
      const cur = hlsRef.current as { destroy?: () => void } | null;
      if (cur?.destroy) { try { cur.destroy(); } catch {} hlsRef.current = null; }
    };
  }, [active, autoPlay, locale]);

  const isRTL = locale === "ar";

  if (!active) {
    return (
      <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-xl bg-zinc-950 p-6 text-center ring-1 ring-white/10">
        <p className="text-sm font-bold text-zinc-300">{locale === "en" ? "No Arabic stream" : "لا يوجد رابط عربي"}</p>
        <p className="text-xs text-zinc-500">{locale === "en" ? "Try the fallback server." : "جرّب السيرفر البديل."}</p>
      </div>
    );
  }

  const pickQuality = (q: string) => {
    const list = byQuality.get(q);
    if (!list?.length) return;
    // Prefer fastest within that quality (lowest latencyMs)
    const best = [...list].sort((a, b) => a.latencyMs - b.latencyMs)[0];
    setActive(best);
  };

  return (
    <div className="space-y-2">
      <div className="relative w-full overflow-hidden rounded-xl bg-black ring-1 ring-white/10 aspect-video">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video
          ref={videoRef}
          controls
          playsInline
          preload="metadata"
          crossOrigin="anonymous"
          onEnded={onEnded}
          onError={() => setError(locale === "en" ? "Playback error — try another quality" : "خطأ في التشغيل — جرّب جودة أخرى")}
          className="h-full w-full"
        />

        {/* Error overlay */}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/80 p-4 text-center">
            <p className="text-sm font-bold text-amber-400">{error}</p>
            <div className="flex gap-1">
              {availableQualities.map((q) => (
                <button key={q} onClick={() => pickQuality(q)} className="rounded-full bg-white px-3 py-1 text-xs font-bold text-black">{q}</button>
              ))}
            </div>
          </div>
        )}

        {/* Loading when HLS not ready */}
        {active.isHls && !hlsReady && !error && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/40">
            <Loader2 className="animate-spin text-white" size={24} />
          </div>
        )}

        {/* Title overlay */}
        <div className="pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-black/70 to-transparent p-3">
          <p className="truncate text-xs font-bold text-white/90" dir={isRTL ? "rtl" : "ltr"}>
            {title} · {active.label} {active.isHls ? "· HLS" : ""}
          </p>
        </div>
      </div>

      {/* Quality + provider pills */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-zinc-900/60 px-3 py-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-bold text-zinc-500">{locale === "en" ? "Quality:" : "الجودة:"}</span>
          <div className="flex gap-1">
            {QUALITY_ORDER.filter((q) => byQuality.has(q)).map((q) => (
              <button
                key={q}
                onClick={() => pickQuality(q)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 transition ${active.quality === q ? "bg-white text-black ring-white" : "bg-zinc-800 text-zinc-300 ring-white/10 hover:ring-white/30"}`}
              >
                {q}
              </button>
            ))}
          </div>
          <span className="ms-2 hidden text-[10px] text-zinc-600 md:inline">{locale === "en" ? "Arabic · Beta" : "عربي · تجريبي"}</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Provider switcher when multiple hosts for same quality */}
          {(byQuality.get(active.quality)?.length || 0) > 1 && (
            <div className="flex gap-1">
              {(byQuality.get(active.quality) || []).map((s) => (
                <button
                  key={s.url}
                  onClick={() => setActive(s)}
                  title={s.host || s.provider}
                  className={`rounded-full px-2 py-1 text-[10px] font-bold ring-1 ${s.url === active.url ? "bg-amber-400 text-black ring-amber-400" : "bg-zinc-800 text-zinc-400 ring-white/10 hover:text-white"}`}
                >
                  {s.provider}
                </button>
              ))}
            </div>
          )}
          <a href={active.url} target="_blank" rel="noopener noreferrer" className="text-[11px] font-semibold text-zinc-500 hover:text-violet-400">
            {locale === "en" ? "Direct link" : "الرابط المباشر"}
          </a>
        </div>
      </div>

      {/* Provider latency debug (dev-friendly, muted) */}
      {sources.length > 1 && (
        <p className="px-1 text-[10px] text-zinc-600">
          {sources.slice(0, 4).map((s) => `${s.provider} ${s.quality} ${s.latencyMs}ms`).join(" · ")}
        </p>
      )}
    </div>
  );
}
