import metadata from './catalog-metadata.json' with {type:'json'};
import {withMetadata} from './catalog-metadata.js';
import {refreshKodikMedia} from './kodik-playback.js';
import {localSeasons,franchiseSeasons} from './catalog-seasons.js';
import {queryCatalogue} from './catalog-query.js';
import publication from './runtime-catalog.json' with {type:'json'};
import {createApprovedCatalogue} from './approved-catalog.js';
import {registerAnime} from './catalog.js';
import {requestCache} from './request-cache.js';

// Инициализируем стартовый лёгкий срез (первые 120 тайтлов)
let allItems = (publication.items || []).slice(0, 120).map(a => withMetadata(a, metadata));
let isFullyLoaded = false;

// Экспортируем активный массив
export let publishedItems = allItems;

// Фоновая ленивая загрузка всей остальной базы без перегруза памяти при старте
export async function ensureFullCatalogLoaded() {
  if (isFullyLoaded) return publishedItems;
  await new Promise(resolve => setTimeout(resolve, 300)); // Даем странице зарендериться
  const full = (publication.items || []).map(a => withMetadata(a, metadata));
  publishedItems.length = 0;
  publishedItems.push(...full);
  isFullyLoaded = true;
  return publishedItems;
}

const mediaCatalogue = requestCache(async id => {
  if (!isPublished(id)) throw Error('notAdmitted');
  const url = new URL(`data/media/${encodeURIComponent(id)}.json`, globalThis.document?.baseURI || 'https://yomiku.site/');
  url.searchParams.set('v', publication.revision);
  const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw Error('providerError');
  const data = await response.json();
  if (data.items?.length !== 1 || data.items[0].id !== id) throw Error('invalid_manifest');
  const catalogue = createApprovedCatalogue(data);
  if (!catalogue.find(id)) throw Error('notAdmitted');
  return catalogue;
}, { ttl: 3600000, max: 12 });

export const isPublished = id => publishedItems.some(a => a.id === id);

export const combinedCatalogue = requestCache(async (options = {}) => {
  if (options.query || options.page > 1 || options.genre !== 'all') {
    await ensureFullCatalogLoaded();
  }
  const items = queryCatalogue(publishedItems, options);
  const total = items.length, page = Math.max(1, Number(options.page) || 1);
  return { items: items.slice((page - 1) * 24, page * 24).map(registerAnime), total, pages: Math.max(1, Math.ceil(total / 24)), partial: false };
});

export const resolveRelease = requestCache(async a => {
  let found = publishedItems.find(x => x.id === a.id);
  if (!found) {
    await ensureFullCatalogLoaded();
    found = publishedItems.find(x => x.id === a.id);
  }
  if (!found) throw Error('notAdmitted');
  return registerAnime(found);
});

export async function findWatchRelease(id) {
  let found = publishedItems.find(a => a.id === id);
  if (!found) {
    await ensureFullCatalogLoaded();
    found = publishedItems.find(a => a.id === id);
  }
  return found || null;
}

export async function discoveryIndex() {
  await ensureFullCatalogLoaded();
  return publishedItems;
}

export async function prepareEpisodeAudio(a) {
  if (a?.id && isPublished(a.id)) await mediaCatalogue(a.id);
}

export const knownSeasons = a => localSeasons(publishedItems, a);

export const releaseSeasons = requestCache(async a => {
  const local = localSeasons(publishedItems, a), shiki = a.ids?.shikimori || a.ids?.mal || a.malId;
  if (!shiki) return local;
  try {
    const response = await fetch(`https://shikimori.io/api/animes/${Number(shiki)}/franchise`, { signal: AbortSignal.timeout(6000) });
    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data.links)) return franchiseSeasons(publishedItems, a, data.links, data.nodes);
    }
  } catch {}
  if (!(a.ids?.mal || a.malId)) return local;
  try {
    const response = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'query($id:Int){Media(idMal:$id,type:ANIME){relations{edges{relationType node{idMal type}}}}}', variables: { id: Number(a.ids?.mal || a.malId) } }),
      signal: AbortSignal.timeout(6000)
    });
    if (!response.ok) return local;
    const data = await response.json();
    const relatedMalIds = (data.data?.Media?.relations?.edges || [])
      .filter(e => ['PREQUEL', 'SEQUEL'].includes(e.relationType) && e.node.type === 'ANIME')
      .map(e => e.node.idMal)
      .filter(Boolean);
    return localSeasons(publishedItems, { ...a, relatedMalIds });
  } catch {
    return local;
  }
}, { ttl: 3600000 });

export async function videoEpisode(a, index, refresh = false, audioId) {
  const media = (await mediaCatalogue(a.id)).video(a.id, index, audioId);
  if (media.providerRef?.provider !== 'kodik') return media;
  const config = globalThis.window?.YORU_CONFIG;
  if (!config?.supabaseUrl) throw Error('providerError');
  return refreshKodikMedia(media, config, a.id, index);
}