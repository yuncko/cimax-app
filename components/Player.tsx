"use client";
import { useEffect, useRef, useState } from "react";
import {
  Loader2, Play, X, ArrowRight, ArrowLeft, Share2, User,
  BookOpen, Users, Clapperboard, ListVideo, Film, Lock,
} from "lucide-react";
import {
  BACKDROP, IMG, IMG_LG, PROFILE, genresFor,
  MediaItem, MediaType, Episode, CastMember,
  SERVERS, serverName, buildEmbedUrl, tmdb,
} from "@/lib/tmdb";
import { localeConfig } from "@/lib/i18n";
import { FavBtn, PosterCard, Rating } from "./ui";
import { EmbedPlayer } from "./EmbedPlayer";
import { ArabicUnifiedPlayer } from "./ArabicUnifiedPlayer";
import { fetchUnifiedSourcesClient } from "@/lib/unifiedClient";
import type { UnifiedSourceClient } from "@/lib/unifiedClient";
import { useLanguage } from "./LanguageProvider";

export function VideoPlayer({
  item, type, season, episode,
}: {
  item: MediaItem; type: MediaType; season: number; episode: number;
}) {
  const { locale, t } = useLanguage();
  const [server, setServer] = useState(SERVERS[0].id);
  const [reloadKey, setReloadKey] = useState(0);
  const [unprotected, setUnprotected] = useState<Set<string>>(() => new Set());
  const [arabicSources, setArabicSources] = useState<UnifiedSourceClient[] | null>(null);
  const [arabicLoading, setArabicLoading] = useState(false);
  const [arabicError, setArabicError] = useState<string | null>(null);

  /* تذكّر آخر سيرفر اختاره المستخدم + السيرفرات المُوقفة حمايتها */
  useEffect(() => {
    const saved = localStorage.getItem("cimax-server");
    if (saved && SERVERS.some(s => s.id === saved && !s.locked)) setServer(saved);
    try {
      const off = JSON.parse(localStorage.getItem("cimax-unprotected") || "[]");
      if (Array.isArray(off)) setUnprotected(new Set(off));
    } catch {}
  }, []);

  const pickServer = (id: string) => {
    setServer(id);
    try { localStorage.setItem("cimax-server", id); } catch {}
  };

  /* بعض المزوّدين يرفضون العمل داخل iframe مقيّد (Sandbox Not Allowed)
     فيتيح هذا الزر إيقاف الحماية لهذا السيرفر وإعادة تحميل المشغّل */
  const toggleProtection = () => {
    setUnprotected(prev => {
      const next = new Set(prev);
      if (next.has(server)) next.delete(server); else next.add(server);
      try { localStorage.setItem("cimax-unprotected", JSON.stringify([...next])); } catch {}
      return next;
    });
    setReloadKey(k => k + 1);
  };

  /* تلميح لغة الترجمة يتبع لغة الواجهة (ar / en) */
  const url = buildEmbedUrl(server, type, item.id, season, episode, locale);
  const serverMeta = SERVERS.find(s => s.id === server);
  const serverLabel = serverMeta ? serverName(serverMeta, locale) : t.player.server;
  const blockPopups = serverMeta?.blockPopups !== false && !unprotected.has(server);

  useEffect(() => {
    setReloadKey(k => k + 1);
  }, [server, season, episode]);

  // Arabic Beta — fetch fastest unified source when this server is selected
  useEffect(() => {
    if (server !== "arabic-beta") {
      setArabicSources(null);
      setArabicError(null);
      setArabicLoading(false);
      return;
    }
    const title = String(item.title || item.name || "").trim();
    if (!title) {
      setArabicError(t.player.noArabicSource);
      return;
    }
    let alive = true;
    setArabicLoading(true);
    setArabicError(null);
    setArabicSources(null);
    fetchUnifiedSourcesClient(item.id, type, title, season, episode, locale)
      .then((res) => {
        if (!alive) return;
        if (!res || res.sources.length === 0) {
          setArabicError(res?.error || t.player.noArabicSource);
          setArabicSources(null);
        } else {
          setArabicSources(res.sources);
        }
      })
      .catch((e) => {
        if (!alive) return;
        setArabicError(e instanceof Error ? e.message : t.player.noArabicSource);
        setArabicSources(null);
      })
      .finally(() => {
        if (alive) setArabicLoading(false);
      });
    return () => { alive = false; };
  }, [server, item.id, type, season, episode, locale, item.title, item.name, t.player.noArabicSource]);

  const isArabicBeta = server === "arabic-beta";

  return (
    <div className="space-y-3">
      {isArabicBeta ? (
        arabicLoading ? (
          <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-xl bg-zinc-950 ring-1 ring-white/10">
            <Loader2 className="animate-spin text-amber-400" size={28} />
            <span className="text-xs text-zinc-400">{t.player.checkingArabic}</span>
            <span className="text-[11px] text-zinc-600">{item.title || item.name}</span>
          </div>
        ) : arabicError || !arabicSources?.length ? (
          <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-xl bg-zinc-950 p-6 text-center ring-1 ring-white/10">
            <p className="text-sm font-bold text-zinc-300">{arabicError || t.player.noArabicSource}</p>
            <p className="text-xs text-zinc-500">{t.player.arabicBetaHint}</p>
            <button
              onClick={() => pickServer(SERVERS[1].id)}
              className="mt-2 rounded-full bg-white px-4 py-1.5 text-xs font-black text-black"
            >
              {locale === "en" ? "Use fallback server" : "استخدم السيرفر البديل"}
            </button>
          </div>
        ) : (
          <ArabicUnifiedPlayer sources={arabicSources} title={String(item.title || item.name || "")} />
        )
      ) : (
        <EmbedPlayer
          src={url}
          title={`${serverLabel} — ${item.title || item.name || t.player.playerFallback}`}
          reloadKey={`${reloadKey}-${server}-${season}-${episode}`}
          accent="blue"
          blockPopups={blockPopups}
          aspect
        />
      )}

      {/* حالة الحماية + مفتاح التبديل — hidden for Arabic Beta (native <video>) */}
      {!isArabicBeta && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-zinc-900/60 px-3 py-2">
          <p className="text-[11px] leading-5 text-zinc-400">
            {blockPopups ? (
              <>🛡 <strong className="text-emerald-400">{t.player.protectionOn}</strong> — {t.player.protectionOnHint} <span dir="ltr" className="text-zinc-500">Sandbox
              Not Allowed</span> {t.player.protectionOnHintEnd}</>
            ) : (
              <>⚠️ <strong className="text-amber-400">{t.player.protectionOff}</strong> — {t.player.protectionOffHint}</>
            )}
          </p>
          {serverMeta?.blockPopups !== false && (
            <button
              onClick={toggleProtection}
              className={`flex-shrink-0 rounded-full px-3 py-1.5 text-[11px] font-extrabold transition
                ${blockPopups
                  ? "bg-zinc-800 text-zinc-300 hover:bg-amber-500/20 hover:text-amber-300"
                  : "bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30"}`}
            >
              {blockPopups ? t.player.retryWithoutProtection : t.player.enableProtection}
            </button>
          )}
        </div>
      )}
      {isArabicBeta && arabicSources && arabicSources.length > 0 && (
        <p className="rounded-lg bg-amber-400/10 px-3 py-2 text-[11px] leading-5 text-amber-300 ring-1 ring-amber-400/20" title={t.player.arabicBetaHint}>
          ✓ {t.player.arabicBeta} — {t.player.directVideo} · {arabicSources.length} {locale === "en" ? "sources" : "مصادر"} · {t.player.fastest}: {arabicSources[0].label}
        </p>
      )}

      {server === "vidking" && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex text-[11px] font-semibold text-zinc-500 hover:text-blue-400 transition"
        >
          {t.player.newWindowVidking}
        </a>
      )}

      {/* servers row */}
      <div className="space-y-1.5">
        <p className="text-[11px] font-semibold text-zinc-500">
          {t.player.serversAvailable(SERVERS.filter(s => !s.locked).length)}
        </p>
        <div className="flex gap-2 overflow-x-auto pb-1
          [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1">
          {SERVERS.map(s => {
            if (s.locked) return (
              <button key={s.id} disabled title={t.player.lockedServer}
                className="flex flex-shrink-0 cursor-not-allowed items-center gap-1.5 rounded-full
                  border border-white/10 bg-black px-3.5 py-1.5 text-[12px] font-bold text-zinc-600">
                <Lock size={11} className="lock-jiggle text-zinc-500" />
                {serverName(s, locale)}
              </button>
            );
            const isBeta = s.id === "arabic-beta";
            const label = isBeta ? t.player.arabicBeta : serverName(s, locale);
            return (
              <button key={s.id} onClick={() => pickServer(s.id)} title={isBeta ? t.player.arabicBetaHint : undefined}
                className={`flex flex-shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[12px] font-bold transition
                  ${server === s.id
                    ? "bg-white border-white text-black"
                    : isBeta
                      ? "bg-amber-400/15 border-amber-400/40 text-amber-300 hover:border-amber-400/70 hover:text-amber-200"
                      : "bg-[#15151a] border-white/10 text-zinc-300 hover:border-white/40 hover:text-white"}`}>
                {isBeta ? (
                  <span className="flex items-center justify-center rounded-[3px] bg-amber-400 px-1 py-0.5 text-[8px] font-black leading-none text-black">BETA</span>
                ) : s.ar ? (
                  <span className="flex h-3.5 w-3.5 items-center justify-center rounded-[3px]
                    bg-emerald-500/20 ring-1 ring-emerald-400/50 text-[8px] font-extrabold text-emerald-400">
                    AR
                  </span>
                ) : null}
                {s.blockPopups !== false && !unprotected.has(s.id) && !isBeta && (
                  <span className="flex h-3.5 w-3.5 items-center justify-center rounded-[3px]
                    bg-sky-500/20 ring-1 ring-sky-400/50 text-[8px] font-extrabold text-sky-400"
                    title={t.player.popupBlock}>
                    🛡
                  </span>
                )}
                {label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ── شارة معلومات صغيرة (سنة · مدة · HD …) ── */
function MetaBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md bg-white/5 px-2 py-1
      text-[11px] font-bold text-zinc-300 ring-1 ring-white/10">
      {children}
    </span>
  );
}

/* ── عنوان قسم موحّد (يتماشى مع صفوف الصفحة الرئيسية) ── */
function SectionTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <h3 className="mb-3 flex items-center gap-2 text-sm font-extrabold text-white md:text-base">
      <span className="text-zinc-500">{icon}</span>
      {children}
    </h3>
  );
}

/* ═══════════════════════════════════════
   نافذة المشاهدة — تنسيق صفحة العرض:
   المشغّل أعلى ثم عمودان (تفاصيل + حلقات)
═══════════════════════════════════════ */
export function DetailsModal({
  item, type, onClose, onSelect, favSet, toggleFav,
}: {
  item: MediaItem; type: MediaType;
  onClose: () => void;
  onSelect?: (item: MediaItem, type: MediaType) => void;
  favSet: Set<string>;
  toggleFav: (item: MediaItem, type: MediaType) => void;
}) {
  const { locale, t } = useLanguage();
  const [details, setDetails] = useState<any>(null);
  const [mode, setMode]         = useState<"info" | "player" | "trailer">("info");
  const [season, setSeason]     = useState(1);
  const [episode, setEpisode]   = useState(1);
  const [seasonEps, setSeasonEps] = useState<Episode[]>([]);
  const [loadingEps, setLoadingEps] = useState(false);
  const [copied, setCopied]     = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  /* جلب التفاصيل + الممثلين + المشابه + الإعلان بلغة الواجهة */
  useEffect(() => {
    let alive = true;
    setDetails(null);
    tmdb(`/${type}/${item.id}`, { append_to_response: "credits,recommendations,similar,videos", language: localeConfig[locale].apiLanguage })
      .then(d => { if (alive) setDetails(d); })
      .catch(() => {});
    return () => { alive = false; };
  }, [item.id, type, locale]);

  /* تصفير الواجهة عند فتح عمل آخر من «أعمال مشابهة» */
  useEffect(() => {
    setMode("info");
    setSeason(1);
    setEpisode(1);
    setSeasonEps([]);
  }, [item.id, type]);

  /* العودة لأعلى النافذة عند تبديل الوضع */
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [mode]);

  /* جلب حلقات الموسم */
  useEffect(() => {
    if (type !== "tv" || !details) return;
    setLoadingEps(true);
    tmdb(`/tv/${item.id}/season/${season}`, { language: localeConfig[locale].apiLanguage })
      .then(d => setSeasonEps(d.episodes || []))
      .catch(() => setSeasonEps([]))
      .finally(() => setLoadingEps(false));
  }, [type, item.id, season, details, locale]);

  const title    = item.title || item.name || details?.title || details?.name || t.media.noTitle;
  const year     = (item.release_date || item.first_air_date
    || details?.release_date || details?.first_air_date || "").slice(0, 4);
  const rating   = details?.vote_average ?? item.vote_average;
  const genreMap = genresFor(type, locale);
  const genres: string[] = details?.genres?.map((g: any) => g.name)
    || (item.genre_ids || []).map(id => genreMap[id]).filter(Boolean);
  const isFav   = favSet.has(`${type}-${item.id}`);
  const seasons = details?.number_of_seasons || 1;

  /* الممثلون (من لديهم صور، أول 20) */
  const cast: CastMember[] = (details?.credits?.cast || [])
    .filter((c: CastMember) => c.profile_path)
    .slice(0, 20);

  /* الإعلان الرسمي من يوتيوب إن وُجد */
  const videos = details?.videos?.results || [];
  const trailer = videos.find((v: any) => v.site === "YouTube" && v.type === "Trailer" && v.official)
    || videos.find((v: any) => v.site === "YouTube" && v.type === "Trailer")
    || videos.find((v: any) => v.site === "YouTube" && v.type === "Teaser");

  /* أعمال مشابهة = التوصيات + المشابه، بلا تكرار */
  const similar: MediaItem[] = (() => {
    const seen = new Set<number>([item.id]);
    const out: MediaItem[] = [];
    for (const r of [...(details?.recommendations?.results || []), ...(details?.similar?.results || [])]) {
      if (!r.poster_path || seen.has(r.id)) continue;
      seen.add(r.id);
      out.push(r);
      if (out.length >= 14) break;
    }
    return out;
  })();

  /* مشاركة الصفحة */
  const share = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title, url: window.location.href });
        return;
      }
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const selectEpisode = (n: number) => {
    setEpisode(n);
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  /* زر الرجوع في شريط المشغّل — يعكس الاتجاه حسب اللغة */
  const BackIcon = locale === "en" ? ArrowLeft : ArrowRight;

  /* ── صف حلقة واحدة (يُستخدم في الشريط الجانبي وفي الموبايل) ── */
  const EpisodeRow = ({ ep, onPick }: { ep: Episode; onPick?: (n: number) => void }) => {
    const active = episode === ep.episode_number;
    return (
      <button
        onClick={() => (onPick ?? selectEpisode)(ep.episode_number)}
        className={`group flex w-full items-start gap-3 border-b border-white/5
          p-2.5 text-right transition last:border-0 hover:bg-white/5
          ${active ? "bg-amber-400/5 border-s-2 border-s-amber-400" : ""}`}>
        {/* صورة الحلقة */}
        <div className="relative w-24 flex-shrink-0 md:w-28">
          <div className="aspect-video overflow-hidden rounded-lg bg-[#1c1c22]">
            {ep.still_path ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`${IMG_LG}${ep.still_path}`} alt="" loading="lazy"
                className="h-full w-full object-cover transition-transform
                  duration-300 group-hover:scale-105" />
            ) : (
              <div className="flex h-full items-center justify-center text-zinc-600">
                <Film size={18} />
              </div>
            )}
          </div>
          <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1.5
            py-0.5 text-[9px] font-black text-white backdrop-blur">
            {ep.episode_number}
          </span>
          <span className="absolute inset-0 flex items-center justify-center
            rounded-lg bg-black/50 opacity-0 transition-opacity
            group-hover:opacity-100">
            <Play size={18} className="fill-white text-white" />
          </span>
        </div>
        {/* نص الحلقة */}
        <div className="min-w-0 flex-1 py-0.5">
          <p dir="auto" className="line-clamp-1 text-[12px] font-bold text-white md:text-[13px]">
            {ep.name}
          </p>
          <p className="mt-0.5 text-[10px] text-zinc-500">
            {ep.air_date || "—"}{ep.runtime ? ` · ${ep.runtime} ${t.player.minutesShort}` : ""}
          </p>
        </div>
      </button>
    );
  };

  /* ── كتلة الحلقات: مواسم + قائمة قابلة للتمرير ── */
  const EpisodesBlock = ({ onPick }: { onPick?: (n: number) => void }) => (
    <div>
      {seasons > 1 && (
        <div className="mb-3 flex gap-2 overflow-x-auto pb-1
          [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {Array.from({ length: seasons }, (_, i) => i + 1).map(s => (
            <button key={s}
              onClick={() => { setSeason(s); setEpisode(1); }}
              className={`flex-shrink-0 rounded-full px-4 py-1.5 text-xs font-bold transition
                ${season === s
                  ? "bg-amber-400 text-black"
                  : "bg-[#1c1c22] text-zinc-300 ring-1 ring-white/10 hover:ring-white/40"}`}>
              {t.player.season} {s}
            </button>
          ))}
        </div>
      )}
      <div className="overflow-y-auto rounded-xl bg-[#101014] ring-1 ring-white/10
        [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1 lg:max-h-[60vh] max-h-64">
        {loadingEps ? (
          <div className="flex justify-center py-10">
            <Loader2 className="animate-spin text-amber-400" />
          </div>
        ) : seasonEps.length === 0 ? (
          <p className="py-10 text-center text-xs text-zinc-500">{t.anime.noEpisodes}</p>
        ) : (
          seasonEps.map(ep => <EpisodeRow key={ep.id} ep={ep} onPick={onPick} />)
        )}
      </div>
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/85 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className={`relative w-full max-h-[94vh] rounded-t-2xl bg-zinc-950
          ring-1 ring-white/10 md:max-w-6xl md:rounded-2xl
          ${mode === "info"
            ? "overflow-y-auto [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1"
            : "flex flex-col overflow-hidden"}`}
        onClick={e => e.stopPropagation()}
      >
        {mode === "info" ? (
          <>
            {/* ── البانر ── */}
            <div className="relative h-56 w-full flex-shrink-0 overflow-hidden md:h-[22rem]">
              {item.backdrop_path ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`${BACKDROP}${item.backdrop_path}`} alt=""
                  className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full bg-[#1c1c22]" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/35 to-black/25" />
              {/* زر الإغلاق */}
              <button onClick={onClose}
                className="absolute end-3 top-3 flex h-9 w-9 items-center justify-center
                  rounded-full bg-black/60 text-white transition hover:bg-white hover:text-black">
                <X size={18} />
              </button>
              {/* زر التشغيل على البانر */}
              <button onClick={() => setMode("player")}
                className="group absolute inset-0 flex items-center justify-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-full
                  bg-amber-400 text-black shadow-2xl shadow-black/50 ring-4 ring-white/15
                  transition-transform group-hover:scale-110">
                  <Play size={22} className="fill-black" />
                </span>
              </button>
            </div>

            {/* ── المحتوى ── */}
            <div className="relative px-5 pb-8 md:px-8">

              {/* الملصق + العنوان + المعلومات */}
              <div className="-mt-16 flex items-end gap-4 md:-mt-24">
                {item.poster_path ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`${IMG}${item.poster_path}`} alt=""
                    className="w-24 flex-shrink-0 rounded-xl shadow-2xl shadow-black/60
                      ring-1 ring-white/15 md:w-36" />
                ) : (
                  <div className="flex w-24 flex-shrink-0 items-center justify-center rounded-xl
                    bg-[#1c1c22] text-zinc-600 ring-1 ring-white/10 md:h-52 md:w-36">
                    <Film size={30} />
                  </div>
                )}
                <div className="min-w-0 flex-1 pb-1">
                  <h1 className="text-xl font-black leading-tight text-white md:text-3xl">{title}</h1>
                  {details?.tagline && (
                    <p dir="auto" className="mt-1 line-clamp-1 text-[11px] text-zinc-500 md:text-xs">
                      {details.tagline}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                    <Rating value={rating} size="md" />
                    {year && <span className="font-bold text-zinc-300">{year}</span>}
                    <span className="text-zinc-600">·</span>
                    <span>{type === "tv" ? t.media.show : t.media.movie}</span>
                    {type === "movie" && !!details?.runtime && (
                      <>
                        <span className="text-zinc-600">·</span>
                        <span>{details.runtime} {t.player.minutes}</span>
                      </>
                    )}
                    {type === "tv" && details && (
                      <>
                        <span className="text-zinc-600">·</span>
                        <span>{seasons} {seasons > 1 ? t.player.seasons : t.player.season}</span>
                      </>
                    )}
                    <MetaBadge>HD</MetaBadge>
                  </div>
                </div>
              </div>

              {/* التصنيفات */}
              {!!genres.length && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {genres.map(g => (
                    <span key={g} className="rounded-full bg-white/5 px-3 py-1
                      text-[11px] font-bold text-zinc-300 ring-1 ring-white/10">
                      {g}
                    </span>
                  ))}
                </div>
              )}

              {/* أزرار الإجراءات */}
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <button
                  onClick={() => setMode("player")}
                  className="flex items-center gap-2 rounded-full bg-amber-400 px-7 py-3
                    text-sm font-black text-black shadow-xl shadow-amber-400/20
                    transition hover:bg-amber-300">
                  <Play size={16} className="fill-black" />
                  {t.player.playNow}
                </button>

                {trailer && (
                  <button onClick={() => setMode("trailer")}
                    className="flex items-center gap-2 rounded-full bg-white/10 px-5 py-3
                      text-sm font-bold text-white ring-1 ring-white/15 backdrop-blur
                      transition hover:bg-white/20">
                    <Clapperboard size={16} />
                    {t.player.trailer}
                  </button>
                )}

                <FavBtn active={isFav} onToggle={() => toggleFav(item, type)} size={46} />

                <button onClick={share} title={t.player.share}
                  className="flex h-[46px] w-[46px] items-center justify-center rounded-full
                    bg-white/5 text-zinc-300 ring-1 ring-white/15 backdrop-blur
                    transition hover:bg-white/15 hover:text-white">
                  <Share2 size={18} />
                </button>
                {copied && (
                  <span className="text-[11px] font-bold text-emerald-400">{t.player.copied}</span>
                )}
              </div>

              {/* القصة */}
              <section className="mt-7">
                <SectionTitle icon={<BookOpen size={16} />}>{t.player.story}</SectionTitle>
                <p dir="auto" className="text-[13px] leading-7 text-zinc-300">
                  {item.overview || details?.overview || t.player.noDescription}
                </p>
              </section>

              {/* طاقم العمل */}
              {!!cast.length && (
                <section className="mt-7">
                  <SectionTitle icon={<Users size={16} />}>{t.player.cast}</SectionTitle>
                  <div className="-mx-1 flex gap-4 overflow-x-auto px-1 pb-2
                    [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1">
                    {cast.map(c => (
                      <div key={`cast-${c.id}`}
                        className="flex w-16 flex-shrink-0 flex-col items-center gap-1.5 text-center md:w-20">
                        {c.profile_path ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={`${PROFILE}${c.profile_path}`} alt={c.name} loading="lazy"
                            className="h-16 w-16 rounded-full object-cover ring-1 ring-white/15 md:h-20 md:w-20" />
                        ) : (
                          <div className="flex h-16 w-16 items-center justify-center rounded-full
                            bg-[#1c1c22] text-zinc-600 ring-1 ring-white/10 md:h-20 md:w-20">
                            <User size={22} />
                          </div>
                        )}
                        <p className="line-clamp-1 w-full text-[11px] font-bold text-zinc-200">{c.name}</p>
                        {c.character && (
                          <p dir="auto" className="line-clamp-1 w-full text-[10px] text-zinc-500">{c.character}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* الحلقات (للمسلسلات) */}
              {type === "tv" && (
                <section className="mt-7">
                  <SectionTitle icon={<ListVideo size={16} />}>{t.anime.episodes}</SectionTitle>
                  <EpisodesBlock onPick={n => { setEpisode(n); setMode("player"); }} />
                </section>
              )}

              {/* أعمال مشابهة */}
              {!!similar.length && onSelect && (
                <section className="mt-7">
                  <SectionTitle icon={<Clapperboard size={16} />}>{t.player.similar}</SectionTitle>
                  <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2
                    [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {similar.map(sim => (
                      <div key={`sim-${sim.id}`} className="w-[110px] flex-shrink-0 md:w-[130px]">
                        <PosterCard item={sim} type={type}
                          onSelect={onSelect} favSet={favSet} toggleFav={toggleFav} />
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          </>
        ) : (
          <>
        {/* ── شريط علوي: العنوان + الإغلاق/المفضلة ── */}
        <div className="flex flex-shrink-0 items-center justify-between gap-3 border-b border-white/5 px-4 py-3 md:px-5">
          <div className="min-w-0 flex-1">
            <span className="text-[10px] font-bold text-amber-400">{type === "tv" ? t.media.show : t.media.movie}</span>
            <div className="flex items-center gap-2">
              <h1 className="truncate text-lg font-extrabold text-white md:text-xl">{title}</h1>
              {type === "tv" && (
                <span className="flex-shrink-0 text-sm font-bold text-amber-400">· {t.player.seasonShort}{season} {t.player.episodeShort}{episode}</span>
              )}
            </div>
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            <button onClick={() => setMode("info")} title={t.player.backToDetails}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-900 text-zinc-300
                transition hover:bg-white hover:text-black">
              <BackIcon size={18} />
            </button>
            <FavBtn active={isFav} onToggle={() => toggleFav(item, type)} size={40} />
            <button onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-900 text-zinc-300
                transition hover:bg-white hover:text-black">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* ── جسم قابل للتمرير ── */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1">

          {/* المشغّل (أو الإعلان) أعلى الصفحة */}
          <div className="px-3 pt-3 md:px-5 md:pt-5">
            {mode === "trailer" && trailer ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <button onClick={() => setMode("player")}
                    className="flex items-center gap-1.5 text-sm font-bold text-zinc-300 transition hover:text-amber-400">
                    <BackIcon size={16} /> {t.player.backToPlayer}
                  </button>
                  <span className="line-clamp-1 text-sm font-bold text-white">{t.player.officialTrailer}</span>
                </div>
                <div className="relative w-full overflow-hidden rounded-xl bg-black ring-1 ring-white/10"
                  style={{ aspectRatio: "16 / 9" }}>
                  <iframe
                    src={`https://www.youtube-nocookie.com/embed/${trailer.key}?autoplay=1&rel=0`}
                    title={`${t.player.trailer} ${title}`}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="absolute inset-0 h-full w-full"
                  />
                </div>
              </div>
            ) : (
              <VideoPlayer item={item} type={type} season={season} episode={episode} />
            )}
          </div>

          {/* عمودان: التفاصيل + الحلقات — الأفلام عمود واحد */}
          <div className={`grid gap-5 p-3 md:gap-6 md:p-5 ${type === "tv" ? "lg:grid-cols-[1fr_340px]" : ""}`}>

            {/* ── العمود الأول: التفاصيل ── */}
            <div className="space-y-5">
              {details?.tagline && (
                <p dir="auto" className="line-clamp-1 text-xs text-zinc-500">
                  {details.tagline}
                </p>
              )}

              {/* معلومات */}
              <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                <Rating value={rating} size="md" />
                {year && <span className="font-bold text-zinc-300">{year}</span>}
                <span className="text-zinc-600">·</span>
                <span>{type === "tv" ? t.media.show : t.media.movie}</span>
                {type === "movie" && !!details?.runtime && (
                  <>
                    <span className="text-zinc-600">·</span>
                    <span>{details.runtime} {t.player.minutes}</span>
                  </>
                )}
                {type === "tv" && details && (
                  <>
                    <span className="text-zinc-600">·</span>
                    <span>{seasons} {seasons > 1 ? t.player.seasons : t.player.season}</span>
                  </>
                )}
                <MetaBadge>HD</MetaBadge>
              </div>

              {/* التصنيفات */}
              {!!genres.length && (
                <div className="flex flex-wrap gap-2">
                  {genres.map(g => (
                    <span key={g} className="rounded-full bg-white/5 px-3 py-1
                      text-[11px] font-bold text-zinc-300 ring-1 ring-white/10">
                      {g}
                    </span>
                  ))}
                </div>
              )}

              {/* أزرار الإجراءات */}
              <div className="flex flex-wrap items-center gap-3">
                {trailer && (
                  <button onClick={() => setMode(m => m === "trailer" ? "player" : "trailer")}
                    className="flex items-center gap-2 rounded-full bg-white/10 px-5 py-2.5
                      text-sm font-bold text-white ring-1 ring-white/15 backdrop-blur
                      transition hover:bg-white/20">
                    <Clapperboard size={16} />
                    {mode === "trailer" ? t.player.backToPlayer : t.player.trailer}
                  </button>
                )}

                <button onClick={share} title={t.player.share}
                  className="flex h-[46px] w-[46px] items-center justify-center rounded-full
                    bg-white/5 text-zinc-300 ring-1 ring-white/15 backdrop-blur
                    transition hover:bg-white/15 hover:text-white">
                  <Share2 size={18} />
                </button>
                {copied && (
                  <span className="text-[11px] font-bold text-emerald-400">{t.player.copied}</span>
                )}
              </div>

              {/* التنقل بين الحلقات (للمسلسلات) */}
              {type === "tv" && (
                <div className="flex items-center justify-between rounded-xl bg-zinc-900 px-4 py-3">
                  <button
                    disabled={episode <= 1}
                    onClick={() => selectEpisode(episode - 1)}
                    className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-bold text-zinc-300
                      transition hover:text-amber-400 disabled:opacity-30">
                    {`← ${t.anime.previous}`}
                  </button>
                  <span className="text-xs text-zinc-400">
                    {t.player.season} {season} · {t.anime.episode} {episode}
                  </span>
                  <button
                    disabled={!seasonEps.length || episode >= seasonEps.length}
                    onClick={() => selectEpisode(episode + 1)}
                    className="rounded-full bg-amber-400 px-4 py-1.5 text-xs font-black text-black
                      transition hover:bg-amber-300 disabled:opacity-30">
                    {`${t.anime.next} →`}
                  </button>
                </div>
              )}

              {/* القصة */}
              <section>
                <SectionTitle icon={<BookOpen size={16} />}>{t.player.story}</SectionTitle>
                <p dir="auto" className="text-[13px] leading-7 text-zinc-300">
                  {item.overview || details?.overview || t.player.noDescription}
                </p>
              </section>

              {/* طاقم العمل */}
              {!!cast.length && (
                <section>
                  <SectionTitle icon={<Users size={16} />}>{t.player.cast}</SectionTitle>
                  <div className="-mx-1 flex gap-4 overflow-x-auto px-1 pb-2
                    [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1">
                    {cast.map(c => (
                      <div key={`cast-${c.id}`}
                        className="flex w-16 flex-shrink-0 flex-col items-center gap-1.5 text-center md:w-20">
                        {c.profile_path ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={`${PROFILE}${c.profile_path}`} alt={c.name} loading="lazy"
                            className="h-16 w-16 rounded-full object-cover ring-1 ring-white/15 md:h-20 md:w-20" />
                        ) : (
                          <div className="flex h-16 w-16 items-center justify-center rounded-full
                            bg-[#1c1c22] text-zinc-600 ring-1 ring-white/10 md:h-20 md:w-20">
                            <User size={22} />
                          </div>
                        )}
                        <p className="line-clamp-1 w-full text-[11px] font-bold text-zinc-200">{c.name}</p>
                        {c.character && (
                          <p dir="auto" className="line-clamp-1 w-full text-[10px] text-zinc-500">{c.character}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* الحلقات (موبايل) */}
              {type === "tv" && (
                <div className="lg:hidden">
                  <SectionTitle icon={<ListVideo size={16} />}>{t.anime.episodes}</SectionTitle>
                  <EpisodesBlock />
                </div>
              )}
            </div>

            {/* ── العمود الثاني: الحلقات (سطح المكتب) ── */}
            {type === "tv" && (
              <aside className="hidden lg:block">
                <SectionTitle icon={<ListVideo size={16} />}>{t.anime.episodes}</SectionTitle>
                <EpisodesBlock />
              </aside>
            )}
          </div>

          {/* أعمال مشابهة — بعرض كامل أسفل الشبكة */}
          {!!similar.length && onSelect && (
            <section className="px-3 pb-6 md:px-5">
              <SectionTitle icon={<Clapperboard size={16} />}>{t.player.similar}</SectionTitle>
              <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2
                [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {similar.map(sim => (
                  <div key={`sim-${sim.id}`} className="w-[110px] flex-shrink-0 md:w-[130px]">
                    <PosterCard item={sim} type={type}
                      onSelect={onSelect} favSet={favSet} toggleFav={toggleFav} />
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
          </>
        )}
      </div>
    </div>
  );
}
