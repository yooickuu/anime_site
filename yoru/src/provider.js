import { enrichPosters, cachedPoster } from "./posters.js";
import { registerAnime, byId } from "./catalog.js";
export const API = "https://api.anilibria.app/api/v1";
const ORIGIN = "https://api.anilibria.app";
let genres = null;
const releases = new Map();
async function request(path, signal) {
  const response = await fetch(API + path, {
    signal: signal || AbortSignal.timeout(15000),
  });
  if (!response.ok) throw Error("providerError");
  return response.json();
}
export function safeMediaURL(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const u = new URL(value, ORIGIN);
    return u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}
export function normalizeRelease(r) {
  const english = r.name?.english || r.name?.alternative || r.name?.main || "",
    ru = r.name?.main || english;
  return registerAnime({
    id: Number.isInteger(r.mal?.id) ? "mal-" + r.mal.id : "lib-" + r.id,
    providerId: r.id,
    malId: Number.isInteger(r.mal?.id) ? r.mal.id : null,
    title: ru,
    alt: [english, r.name?.alternative].filter(Boolean).join(" "),
    year: r.year || "",
    episodes: Array.isArray(r.episodes) ? availableEpisodes(r.episodes).length : Math.max(0, r.episodes_total || 0),
    type: r.type?.value || "TV",
    episodeNumbers: Array.isArray(r.episodes) ? availableEpisodes(r.episodes).map(e=>e.ordinal) : null,
    announcedEpisodes: r.episodes_total,
    genres: (r.genres || []).map((g) => g.name),
    description: r.description || "",
    descriptionLanguage: "ru",
    image: cachedPoster(r.mal?.id)?.url || safeMediaURL(r.poster?.src) || safeMediaURL(r.poster?.optimized?.src) || "",
    posterFallback: safeMediaURL(r.poster?.src) || safeMediaURL(r.poster?.optimized?.src) || "",
    translations: {
      en: [english, r.description || ""],
      ja: [english, r.description || ""],
    },
    ongoing: !!r.is_ongoing,
    blocked: !!r.is_blocked_by_geo || !!r.is_blocked_by_copyrights,
    age: r.age_rating?.label || "",
    provider: "AniLiberty",
  });
}
export async function fetchCatalogue({
  query = "",
  page = 1,
  genre = "all",
  sort = "picked",
  type = "all",
  ongoing = false,
} = {}) {
  const params = new URLSearchParams({
    page: String(page),
    limit: "24",
    "f[sorting]": ({newest:'YEAR_DESC',oldest:'YEAR_ASC',latest:'FRESH_AT_DESC',hiddenGems:'RATING_ASC',picked:'RATING_DESC'})[sort] || 'RATING_DESC',
  });
  if (ongoing) params.set("f[publish_statuses]", "IS_ONGOING");
  if (query.trim()) params.set("f[search]", query.trim());
  if (type !== "all") params.set("f[types]", type === "series" ? "TV,ONA,WEB" : type);
  if (genre !== "all") {
    if (!genres) genres = await request("/anime/catalog/references/genres");
    const g = (Array.isArray(genres) ? genres : genres.data || []).find(
      (g) => g.name === genre,
    );
    if (g) params.set("f[genres]", String(g.id));
  }
  const data = await request("/anime/catalog/releases?" + params);
  const items = (data.data || []).map(normalizeRelease);
  await enrichPosters(items);
  return {
    items,
    total: data.meta?.pagination?.total || 0,
    pages: data.meta?.pagination?.total_pages || 1,
  };
}
export async function fetchRelease(id, refresh = false) {
  const cached=releases.get(id) || releases.get('lib-'+byId(id)?.providerId);
  if(!refresh && cached?.model && Date.now()-cached.loadedAt<300000)return byId(cached.model.id)||cached.model;
  const raw = await request(
    "/anime/releases/" + encodeURIComponent(String(byId(id)?.providerId || id).replace("lib-", "")),
  );
  const model = normalizeRelease(raw);
  await enrichPosters([model]);
  const entry={raw,model,loadedAt:Date.now()};
  releases.set(model.id,entry);
  releases.set("lib-"+raw.id,entry);
  return model;
}
export async function releaseEpisodes(id, refresh = false) {
  let cached = releases.get(id);
  if (refresh || !cached || Date.now() - cached.loadedAt > 300000) {
    await fetchRelease(id, refresh);
    cached = releases.get(id);
  }
  if (cached.raw.is_blocked_by_geo || cached.raw.is_blocked_by_copyrights)
    throw Error("providerBlocked");
  return availableEpisodes(cached.raw.episodes || []);
}
export function availableEpisodes(episodes){return episodes.filter(e=>episodeSources(e).length).slice().sort((a,b)=>(a.sort_order??a.ordinal)-(b.sort_order??b.ordinal));}
export function episodeSources(e) {
  return [1080,720,480].map(quality=>({quality,url:safeMediaURL(e['hls_'+quality])})).filter(s=>s.url);
}
export function chooseQuality(sources, preferred = 720) {
  return sources.find(s=>s.quality===Number(preferred)) || sources.find(s=>s.quality===720) || sources[0] || null;
}
export async function providerEpisode(id, index, refresh = false) {
  const episodes = await releaseEpisodes(id, refresh);
  const e = episodes[index - 1];
  if (!e) return null;
  const sources = episodeSources(e);
  return {
    url: chooseQuality(sources)?.url || null,
    sources,
    opening: segment(e.opening, e.duration),
    ending: segment(e.ending, e.duration),
    ordinal: e.ordinal,
    duration: e.duration,
  };
}
const franchiseCache = new Map();
export function franchiseReleases(groups, currentId) {
  const group = (Array.isArray(groups) ? groups : []).find(g=>g.franchise_releases?.some(item=>item.release?.id===currentId || item.release_id===currentId));
  if (!group) return [];
  return [...new Map(group.franchise_releases.slice().sort((a,b)=>a.sort_order-b.sort_order).filter(item=>item.release).map(item=>{
    const release=item.release;
    const id=Number.isInteger(release.mal?.id)?'mal-'+release.mal.id:'lib-'+release.id;
    return [id,byId(id)||normalizeRelease(release)];
  })).values()];
}
export async function releaseSeasons(a) {
  if (!a.providerId) return [a];
  if (!franchiseCache.has(a.providerId)) {
    const groups = await request('/anime/franchises/release/'+encodeURIComponent(a.providerId));
    const releases = franchiseReleases(groups,a.providerId);
    const items = releases.length ? releases : [a];
    for (const item of items) franchiseCache.set(item.providerId,items);
  }
  return franchiseCache.get(a.providerId) || [a];
}
function segment(value, duration) {
  if (!value || !Number.isFinite(value.start) || !Number.isFinite(value.stop))
    return null;
  const start = value.start < 0 ? duration + value.start : value.start,
    end = value.stop < 0 ? duration + value.stop : value.stop;
  return start >= 0 && end > start ? { start, end } : null;
}
