const API_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY;
const BASE = "https://api.themoviedb.org/3";

export const IMG      = "https://image.tmdb.org/t/p/w342";
export const IMG_LG   = "https://image.tmdb.org/t/p/w780";
export const BACKDROP  = "https://image.tmdb.org/t/p/original";
export const PROFILE  = "https://image.tmdb.org/t/p/w185";

export async function tmdb(
  path: string,
  params: Record<string, string | number> = {}
) {
  if (!API_KEY) throw new Error("مفتاح TMDB غير موجود في .env.local");
  const qs = new URLSearchParams({
    api_key: API_KEY,
    /* اللغة قابلة للتخصيص من الواجهة بحسب لغة الزائر، والعربية هي الافتراضية */
    language: (params.language as string) || "ar",
    ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
  });
  const res = await fetch(`${BASE}${path}?${qs}`, { next: { revalidate: 3600 } });
  if (!res.ok) throw new Error(`TMDB ${res.status}`);
  return res.json();
}

/* ── روابط السيرفرات ── */
const VIDKING_PARAMS = "color=729C65&autoPlay=true";
const VIDKING_TV_PARAMS = `${VIDKING_PARAMS}&nextEpisode=true`;

export function buildEmbedUrl(
  server: string,
  type: "movie" | "tv",
  id: number,
  season: number,
  episode: number,
  lang = "ar"
) {
  const m = type === "movie";
  switch (server) {
    case "vidlink":
      return m
        ? `https://vidlink.pro/movie/${id}?primaryColor=2563eb&secondaryColor=0d1520&iconColor=60a5fa&autoplay=true&title=true&poster=true`
        : `https://vidlink.pro/tv/${id}/${season}/${episode}?primaryColor=2563eb&secondaryColor=0d1520&iconColor=60a5fa&autoplay=true&nextbutton=true`;
    case "vidrock":
      return m
        ? `https://vidrock.net/movie/${id}?autoplay=true`
        : `https://vidrock.net/tv/${id}/${season}/${episode}?autoplay=true&autonext=true`;
    case "moviesapi":
      return m
        ? `https://moviesapi.to/movie/${id}`
        : `https://moviesapi.to/tv/${id}-${season}-${episode}`;
    case "vidfast":
      return m
        ? `https://vidfast.vc/movie/${id}?autoPlay=true`
        : `https://vidfast.vc/tv/${id}/${season}/${episode}?autoPlay=true`;
    case "vidking":
      return m
        ? `https://www.vidking.net/embed/movie/${id}?${VIDKING_PARAMS}`
        : `https://www.vidking.net/embed/tv/${id}/${season}/${episode}?${VIDKING_TV_PARAMS}`;
    case "vidsrcru":
      return m
        ? `https://vidsrc-embed.ru/embed/movie?tmdb=${id}&ds_lang=${lang}`
        : `https://vidsrc-embed.ru/embed/tv?tmdb=${id}&season=${season}&episode=${episode}&ds_lang=${lang}`;
    case "vidsrcme":
      return m
        ? `https://vidsrcme.su/embed/movie/${id}`
        : `https://vidsrcme.su/embed/tv/${id}/${season}/${episode}`;
    case "vidsrcwiki":
      return m
        ? `https://vidsrc.wiki/embed/movie/${id}?autoplay=1&color=2563eb`
        : `https://vidsrc.wiki/embed/tv/${id}/${season}/${episode}?autoplay=1&color=2563eb`;
    case "cinejoy":
      /* الموقع يمنع التضمين المباشر (X-Frame-Options: DENY) وlocalhost محجوب
         من الصفحات العامة، لذا يُخدَم عبر بروكسي بنفس أصل التطبيق:
         proxy.ts يعيد كتابة /watch/* إلى app/api/cinejoy. */
      return m
        ? `/watch/movie/${id}`
        : `/watch/tv/${id}/${season}/${episode}`;
    case "nextbox":
      return m
        ? `https://nextbox.uno/player/movie/${id}`
        : `https://nextbox.uno/player/tv/${id}/${season}/${episode}`;
    case "moviebite":
      return m
        ? `https://moviebite.org/watch/movie/${id}/`
        : `https://moviebite.org/watch/tv/${id}/season/${season}/episode/${episode}/`;
    case "xullys":
    default:
      return m
        ? `https://xullys.xyz/watch/${id}?t=movie`
        : `https://xullys.xyz/watch/${id}?t=tv&s=${season}&e=${episode}`;
  }
}

/*
 * blockPopups: السيرفرات التي تحمل true تعمل داخل iframe مقيّد (sandbox)
 * يمنع المتصفح فيه فتح نوافذ/تبويبات إعلانية نهائياً — مُختبَرة وتعمل.
 * السيرفرات الأخرى يرفض مزوّدوها العمل داخل sandbox (يعرضون خطأ)،
 * لذا تبقى بدون حماية وقد تُظهر إعلانات منبثقة.
 */
export type Server = {
  id: string;
  ar: boolean;
  blockPopups: boolean;
  /* السيرفرات المقفلة تُعرض بقفل متحرك ولا يمكن اختيارها */
  locked?: boolean;
};

/* أسماء السيرفرات بحسب اللغة — الرقم فقط يتغير في الاسم */
export function serverName(server: Server, locale: string): string {
  const index = SERVERS.findIndex(s => s.id === server.id) + 1;
  return locale === "en" ? `Server ${index}` : `سيرفر ${index}`;
}

export const SERVERS: Server[] = [
  { id: "arabic-beta", ar: true,  blockPopups: false },
  { id: "xullys",     ar: false, blockPopups: true  },
  { id: "nextbox",    ar: false, blockPopups: true  },
  { id: "moviebite",  ar: false, blockPopups: true  },
  { id: "vidsrcwiki", ar: false, blockPopups: false },
  { id: "vidking",    ar: false, blockPopups: false },
  { id: "vidrock",    ar: false, blockPopups: true,  locked: true },
  { id: "vidlink",    ar: true,  blockPopups: true,  locked: true },
  { id: "moviesapi",  ar: false, blockPopups: true,  locked: true },
  { id: "vidfast",    ar: false, blockPopups: false, locked: true },
  { id: "vidsrcru",   ar: true,  blockPopups: false, locked: true },
  { id: "vidsrcme",   ar: false, blockPopups: false, locked: true },
  { id: "cinejoy",    ar: false, blockPopups: false, locked: true },
];

export const GENRES_MOVIE: Record<number, string> = {
  28: "أكشن", 12: "مغامرة", 16: "أنيميشن", 35: "كوميدي",
  80: "جريمة", 18: "دراما", 14: "فانتازيا", 27: "رعب",
  9648: "غموض", 10749: "رومانسي", 878: "خيال علمي",
  53: "إثارة", 10751: "عائلي", 99: "وثائقي",
};
export const GENRES_TV: Record<number, string> = {
  10759: "أكشن ومغامرة", 16: "أنيميشن", 35: "كوميدي",
  80: "جريمة", 18: "دراما", 10751: "عائلي",
  9648: "غموض", 10765: "خيال وفانتازيا", 37: "وسترن",
};

/* التصنيفات الإنجليزية — تُستخدم عندما تكون الواجهة بالإنجليزية */
export const GENRES_MOVIE_EN: Record<number, string> = {
  28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy",
  80: "Crime", 18: "Drama", 14: "Fantasy", 27: "Horror",
  9648: "Mystery", 10749: "Romance", 878: "Science Fiction",
  53: "Thriller", 10751: "Family", 99: "Documentary",
};
export const GENRES_TV_EN: Record<number, string> = {
  10759: "Action & Adventure", 16: "Animation", 35: "Comedy",
  80: "Crime", 18: "Drama", 10751: "Family",
  9648: "Mystery", 10765: "Sci-Fi & Fantasy", 37: "Western",
};

export function genresFor(type: "movie" | "tv", locale: string): Record<number, string> {
  if (locale !== "en") return type === "tv" ? GENRES_TV : GENRES_MOVIE;
  return type === "tv" ? GENRES_TV_EN : GENRES_MOVIE_EN;
}

export type MediaType = "movie" | "tv";
export type MediaItem = {
  id: number;
  title?: string;
  name?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  vote_average?: number;
  release_date?: string;
  first_air_date?: string;
  genre_ids?: number[];
  media_type?: string;
};
export type Episode = {
  id: number;
  episode_number: number;
  name: string;
  air_date?: string;
  still_path?: string | null;
  overview?: string;
  runtime?: number;
};
export type CastMember = {
  id: number;
  name: string;
  character?: string;
  profile_path?: string | null;
};
