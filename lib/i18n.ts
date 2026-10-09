export type Locale = "ar" | "en";
export type Direction = "rtl" | "ltr";

export const LANGUAGE_STORAGE_KEY = "cimax-language";

export const localeConfig: Record<
  Locale,
  { direction: Direction; apiLanguage: string }
> = {
  ar: { direction: "rtl", apiLanguage: "ar" },
  en: { direction: "ltr", apiLanguage: "en-US" },
};

export type Messages = {
  metaTitle: string;
  brand: { first: string; second: string };
  nav: { home: string; movies: string; shows: string; anime: string; favorites: string };
  search: {
    placeholder: string;
    animePlaceholder: string;
    searching: string;
    results: (query: string) => string;
    noResults: string;
    noAnimeResults: string;
  };
  home: {
    channels: string;
    topMovies: string;
    topShows: string;
    nowMovies: string;
    nowShows: string;
    topRated: string;
  };
  media: {
    movie: string;
    show: string;
    anime: string;
    noTitle: string;
    trending: string;
    popular: string;
    loadMore: string;
  };
  favorites: {
    title: string;
    subtitle: string;
    empty: string;
    hint: string;
    animeSection: string;
    moviesShowsSection: string;
  };
  anime: {
    title: string;
    subtitle: string;
    unavailable: string;
    episodes: string;
    episode: string;
    previous: string;
    next: string;
    story: string;
    noDescription: string;
    openPlayer: string;
    noEpisodes: string;
    subbed: string;
    dubbed: string;
    episodesCount: (count: number) => string;
    providerAnipm: string;
    providerFallback: string;
    fallbackNotice: string;
    switchToFallback: string;
    switchToAnipm: string;
    checkingProvider: string;
  };
  player: {
    playNow: string;
    trailer: string;
    officialTrailer: string;
    backToPlayer: string;
    backToDetails: string;
    share: string;
    copied: string;
    seasons: string;
    season: string;
    minutes: string;
    minutesShort: string;
    seasonShort: string;
    episodeShort: string;
    server: string;
    playerFallback: string;
    cast: string;
    similar: string;
    story: string;
    noDescription: string;
    protectionOn: string;
    protectionOnHint: string;
    protectionOnHintEnd: string;
    protectionOff: string;
    protectionOffHint: string;
    retryWithoutProtection: string;
    enableProtection: string;
    serversAvailable: (count: number) => string;
    lockedServer: string;
    popupShield: string;
    popupBlock: string;
    newWindowVidking: string;
    newWindow: string;
    loading: string;
    tapToStart: string;
    tapOnce: string;
    preparing: string;
    arabicBeta: string;
    arabicBetaHint: string;
    fastest: string;
    noArabicSource: string;
    checkingArabic: string;
    directVideo: string;
  };
  misc: {
    error: string;
    footer: string;
    watchNow: string;
    info: string;
    previous: string;
    next: string;
    slide: (index: number) => string;
  };
};

export const messages: Record<Locale, Messages> = {
  ar: {
    metaTitle: "سيماماكس — أفلام ومسلسلات",
    brand: { first: "سيما", second: "ماكس" },
    nav: { home: "الرئيسية", movies: "أفلام", shows: "مسلسلات", anime: "أنيمي", favorites: "المفضلة" },
    search: {
      placeholder: "ابحث...",
      animePlaceholder: "ابحث عن أنيمي...",
      searching: "جاري البحث…",
      results: q => `نتائج البحث عن "${q}"`,
      noResults: "لا توجد نتائج",
      noAnimeResults: "لا توجد نتائج أنيمي",
    },
    home: {
      channels: "القنوات والخدمات",
      topMovies: "أفضل 10 أفلام",
      topShows: "أفضل 10 مسلسلات",
      nowMovies: "أفلام تُعرض الآن",
      nowShows: "مسلسلات تُعرض الآن",
      topRated: "الأعلى تقييماً",
    },
    media: {
      movie: "فيلم",
      show: "مسلسل",
      anime: "أنيمي",
      noTitle: "بلا عنوان",
      trending: "الأكثر رواجاً",
      popular: "الأكثر رواجاً",
      loadMore: "تحميل المزيد",
    },
    favorites: {
      title: "مكتبتي",
      subtitle: "محتواك المحفوظ",
      empty: "لا توجد عناصر محفوظة بعد",
      hint: "اضغط على أيقونة العلامة على أي بطاقة لحفظها هنا",
      animeSection: "أنيمي",
      moviesShowsSection: "أفلام ومسلسلات",
    },
    anime: {
      title: "أنيمي",
      subtitle: "مشغّل ani.pm — مترجم ومدبلج",
      unavailable: "لا يوجد أنيمي متاح حالياً",
      episodes: "الحلقات",
      episode: "الحلقة",
      previous: "السابقة",
      next: "التالية",
      story: "القصة",
      noDescription: "لا يوجد وصف متوفر.",
      openPlayer: "فتح المشغّل في نافذة جديدة إذا لم يستجب",
      noEpisodes: "لا توجد حلقات",
      subbed: "مترجم",
      dubbed: "مدبلج",
      episodesCount: n => `${n} حلقة`,
      providerAnipm: "ani.pm",
      providerFallback: "بديل",
      fallbackNotice: "غير متوفر على ani.pm — يُعرض البديل",
      switchToFallback: "جرّب المشغّل البديل",
      switchToAnipm: "العودة إلى ani.pm",
      checkingProvider: "جاري التحقّق من المصدر…",
    },
    player: {
      playNow: "تشغيل الآن",
      trailer: "الإعلان",
      officialTrailer: "الإعلان الرسمي",
      backToPlayer: "رجوع للمشغّل",
      backToDetails: "رجوع للتفاصيل",
      share: "مشاركة",
      copied: "تم نسخ الرابط ✓",
      seasons: "مواسم",
      season: "موسم",
      minutes: "دقيقة",
      minutesShort: "د",
      seasonShort: "م",
      episodeShort: "ح",
      server: "سيرفر",
      playerFallback: "مشغّل",
      cast: "طاقم العمل",
      similar: "أعمال مشابهة",
      story: "القصة",
      noDescription: "لا يوجد وصف متوفر لهذا العمل.",
      protectionOn: "الحماية مفعّلة",
      protectionOnHint: "لن تُفتح أي تبويبات إعلانية. إن ظهر داخل المشغّل خطأ",
      protectionOnHintEnd: "فالمزوّد يرفض الحماية.",
      protectionOff: "الحماية متوقفة",
      protectionOffHint: "قد تُفتح تبويبات إعلانية عند النقر داخل المشغّل.",
      retryWithoutProtection: "إيقاف الحماية وإعادة المحاولة",
      enableProtection: "تشغيل الحماية",
      serversAvailable: n => `${n} سيرفرات متاحة — الباقي مقفل حالياً 🔒`,
      lockedServer: "سيرفر مقفل",
      popupShield: "حماية من الإعلانات المنبثقة",
      popupBlock: "حظر الإعلانات المنبثقة",
      newWindowVidking: "فتح VidKing في نافذة جديدة إذا لم يستجب المشغّل",
      newWindow: "فتح المشغّل في نافذة جديدة إذا لم يستجب",
      loading: "جاري تحميل المشغّل…",
      tapToStart: "اضغط لبدء المشاهدة",
      tapOnce: "اضغط مرة واحدة قبل التفاعل مع المشغّل",
      preparing: "جاري تجهيز المشغّل…",
      arabicBeta: "العربية — مباشر (تجريبي)",
      arabicBetaHint: "يجمع أسرع رابط عربي من عدة مواقع — قد يستغرق بضع ثوانٍ",
      fastest: "الأسرع",
      noArabicSource: "لا يوجد مصدر عربي لهذا العمل حالياً — سيُعرض البديل",
      checkingArabic: "جاري البحث عن مصادر عربية…",
      directVideo: "فيديو مباشر",
    },
    misc: {
      error: "حدث خطأ في تحميل البيانات",
      footer: "البيانات من TMDB و Anikoto · لأغراض العرض فقط",
      watchNow: "شاهد الآن",
      info: "معلومات",
      previous: "السابق",
      next: "التالي",
      slide: n => `شريحة ${n}`,
    },
  },
  en: {
    metaTitle: "CimaMax — Movies & TV Shows",
    brand: { first: "Cima", second: "Max" },
    nav: { home: "Home", movies: "Movies", shows: "TV Shows", anime: "Anime", favorites: "My List" },
    search: {
      placeholder: "Search...",
      animePlaceholder: "Search anime...",
      searching: "Searching…",
      results: q => `Search results for "${q}"`,
      noResults: "No results found",
      noAnimeResults: "No anime results found",
    },
    home: {
      channels: "Channels & Services",
      topMovies: "Top 10 Movies",
      topShows: "Top 10 TV Shows",
      nowMovies: "Now Playing",
      nowShows: "On the Air",
      topRated: "Top Rated",
    },
    media: {
      movie: "Movie",
      show: "TV Show",
      anime: "Anime",
      noTitle: "Untitled",
      trending: "Trending",
      popular: "Most popular",
      loadMore: "Load more",
    },
    favorites: {
      title: "My List",
      subtitle: "Your saved content",
      empty: "Nothing saved yet",
      hint: "Tap the bookmark icon on any card to save it here",
      animeSection: "Anime",
      moviesShowsSection: "Movies & TV Shows",
    },
    anime: {
      title: "Anime",
      subtitle: "ani.pm player — subbed & dubbed",
      unavailable: "No anime available right now",
      episodes: "Episodes",
      episode: "Episode",
      previous: "Previous",
      next: "Next",
      story: "Story",
      noDescription: "No description available.",
      openPlayer: "Open the player in a new window if it doesn't respond",
      noEpisodes: "No episodes found",
      subbed: "Subbed",
      dubbed: "Dubbed",
      episodesCount: n => `${n} episodes`,
      providerAnipm: "ani.pm",
      providerFallback: "Fallback",
      fallbackNotice: "Not on ani.pm — showing fallback",
      switchToFallback: "Try fallback player",
      switchToAnipm: "Back to ani.pm",
      checkingProvider: "Checking source…",
    },
    player: {
      playNow: "Play now",
      trailer: "Trailer",
      officialTrailer: "Official trailer",
      backToPlayer: "Back to player",
      backToDetails: "Back to details",
      share: "Share",
      copied: "Link copied ✓",
      seasons: "seasons",
      season: "season",
      minutes: "min",
      minutesShort: "m",
      seasonShort: "S",
      episodeShort: "E",
      server: "Server",
      playerFallback: "Player",
      cast: "Cast",
      similar: "More like this",
      story: "Story",
      noDescription: "No description available for this title.",
      protectionOn: "Protection on",
      protectionOnHint: "No ad tabs will open. If the player shows the error",
      protectionOnHintEnd: "the provider refuses protection.",
      protectionOff: "Protection off",
      protectionOffHint: "Ad tabs may open when you click inside the player.",
      retryWithoutProtection: "Disable protection & retry",
      enableProtection: "Enable protection",
      serversAvailable: n => `${n} servers available — the rest are locked 🔒`,
      lockedServer: "Locked server",
      popupShield: "Pop-up ad protection",
      popupBlock: "Blocks pop-up ads",
      newWindowVidking: "Open VidKing in a new window if the player doesn't respond",
      newWindow: "Open the player in a new window if it doesn't respond",
      loading: "Loading player…",
      tapToStart: "Tap to start watching",
      tapOnce: "Tap once before interacting with the player",
      preparing: "Preparing the player…",
      arabicBeta: "Arabic — Direct (Beta)",
      arabicBetaHint: "Finds the fastest Arabic source across sites — may take a few seconds",
      fastest: "Fastest",
      noArabicSource: "No Arabic source for this title yet — showing fallback",
      checkingArabic: "Searching Arabic sources…",
      directVideo: "Direct video",
    },
    misc: {
      error: "Something went wrong while loading data",
      footer: "Data from TMDB & Anikoto · For demonstration only",
      watchNow: "Watch now",
      info: "More info",
      previous: "Previous",
      next: "Next",
      slide: n => `Slide ${n}`,
    },
  },
};

export function getMessages(locale: Locale): Messages {
  return messages[locale];
}
