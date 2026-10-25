import {readCatalogueText} from './lib/catalog-storage.mjs';
/**
 * seed-catalog.mjs
 * Backend seeder for Yoru anime catalogue.
 * Gathers titles, all available dubs/subs/qualities, ensures deduplication,
 * fetches high-resolution banners/posters, and publishes to src/published-catalog.json.
 */

import { readFile, writeFile, rename } from 'node:fs/promises';
import { createApprovedCatalogue } from '../src/approved-catalog.js';
import {normalizeSeedCatalog} from './normalize-seed-catalog.mjs';
import { seedPages, remember, isKnown } from './seed-progress.mjs';

const CATALOG_PATH = 'src/published-catalog.json';
const PROGRESS_PATH = 'src/seed-progress.json';
async function saveJSON(path, data) {
  await writeFile(path + '.tmp', JSON.stringify(data, null, 2));
  await rename(path + '.tmp', path);
}
const ANILIBRIA_BASE = 'https://anilibria.top/api/v1/anime/';
const USER_AGENT = 'YoruAnimeApp/2.0 (https://yooickuu.github.io/yooickuu.com/)';

const wait = ms => new Promise(r => setTimeout(r, ms));

function cleanDescription(text = '') {
  if (!text) return '';
  return text
    .replace(/\[\/?(?:b|i|u|url|img|spoiler|character|person|anime|manga)[^\]]*\]/gi, '')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchJSON(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
      ...options.headers
    },
    signal: AbortSignal.timeout(15000)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return res.json();
}

export async function fetchShikimori(malOrShikiId) {
  try {
    const query = `query($id: String) {
      animes(ids: $id, limit: 1) {
        id malId name russian description score status episodes episodesAired kind
        genres { id name russian }
        poster { originalUrl }
      }
    }`;
    const data = await fetchJSON('https://shikimori.io/api/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { id: String(malOrShikiId) } })
    });
    return data.data?.animes?.[0] || null;
  } catch (e) {
    return null;
  }
}

export async function fetchAniListMetadata(malId) {
  try {
    const query = `query($idMal: Int) {
      Media(idMal: $idMal, type: ANIME) {
        id
        idMal
        popularity
        averageScore
        duration
        episodes
        relations { edges { relationType node { idMal type } } }
        bannerImage
        coverImage { extraLarge large }
        title { english romaji native }
        genres
        description(asHtml: false)
      }
    }`;
    const data = await fetchJSON('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { idMal: Number(malId) } })
    });
    return data.data?.Media || null;
  } catch (e) {
    return null;
  }
}

async function loadExistingCatalog() {
  try {
    const raw = await readCatalogueText(CATALOG_PATH);
    return JSON.parse(raw);
  } catch (error) {
    if(error.code !== 'ENOENT') throw error;
    return { policyVersion: 3, updatedAt: new Date().toISOString(), items: [] };
  }
}

export async function seedCatalog({ targetCount = 30, onlyOngoings = false } = {}) {
  if(!Number.isSafeInteger(targetCount)||targetCount<1) throw Error('Count must be a positive integer');
  console.log(`Starting anime catalogue seeder (target: ${targetCount}, ongoingsOnly: ${onlyOngoings})...`);

  const {publication:catalog} = normalizeSeedCatalog(await loadExistingCatalog());
  const knownIDs = new Set();
  catalog.items.forEach(item=>remember(knownIDs,item));
  let progress={};
  try {progress=JSON.parse(await readFile(PROGRESS_PATH,'utf8'));} catch(error) {if(error.code!=='ENOENT')throw error;}
  const mode=onlyOngoings?'ongoing':'all';
  const saved=progress[mode]||{page:1,retryPages:[]};
  let added=0,skipped=0,failed=0,scanned=0;
  const retryPages=new Set(saved.retryPages||[]);
  const checkpoint=async page=>{
    catalog.updatedAt=new Date().toISOString();
    await saveJSON(CATALOG_PATH,catalog);
    progress[mode]={page,retryPages:[...retryPages],updatedAt:catalog.updatedAt};
    await saveJSON(PROGRESS_PATH,progress);
  };
  console.log(`Existing titles in catalog: ${catalog.items.length}`);

  // Resume the catalogue scan; check its first page for newly released titles too.
  for await (const batch of seedPages({startPage:saved.page,retryPages:[...retryPages],fetchPage:async page=>{
    const url = `${ANILIBRIA_BASE}catalog/releases?limit=50&page=${page}&sort_by=code${onlyOngoings ? '&is_ongoing=true' : ''}`;
    return fetchJSON(url);
  }})) {
    const {page,items:releaseList,resumePage}=batch;
    retryPages.delete(page);
    for (const brief of releaseList) {
      if (added >= targetCount) break;

      const malId = brief.mal?.id;
      const shikiId = brief.shikimori?.id;

      scanned++;
      if(isKnown(knownIDs,{ids:{anilibria:brief.id,mal:malId,shikimori:shikiId}})) {skipped++;continue;}

      console.log(`\nProcessing: "${brief.name.main}" (MAL: ${malId}, Shikimori: ${shikiId})...`);

      // Fetch full release details
      let fullRelease;
      try {
        fullRelease = await fetchJSON(`${ANILIBRIA_BASE}releases/${brief.id}`);
      } catch (e) {
        console.warn(`Could not fetch details for release ${brief.id}:`, e.message);
        retryPages.add(page);failed++;continue;
      }

      if (!fullRelease.episodes?.length) {
        retryPages.add(page);
        console.log(`Release ${brief.id} has no released episodes yet, skipping.`);
        continue;
      }

      // Fetch metadata from Shikimori & AniList
      const [shikiData, anilistData] = await Promise.all([
        (shikiId || malId) ? fetchShikimori(shikiId || malId) : null,
        malId ? fetchAniListMetadata(malId) : null
      ]);

      const title = shikiData?.russian || brief.name.main;
      const originalTitle = shikiData?.name || anilistData?.title?.native || brief.name.english || '';
      const altNames = [
        brief.name.english,
        brief.name.alternative,
        anilistData?.title?.romaji,
        anilistData?.title?.english,
        shikiData?.name
      ].filter(Boolean).join(' ');

      const description = cleanDescription(shikiData?.description || fullRelease.description || anilistData?.description || '');
      const year = brief.year || anilistData?.seasonYear || (fullRelease.created_at ? new Date(fullRelease.created_at).getFullYear() : 2024);
      const isOngoing = Boolean(brief.is_ongoing);

      // Genres
      const genres = shikiData?.genres?.map(g => g.russian || g.name)
        || fullRelease.genres?.map(g => g.name)
        || anilistData?.genres
        || ['Аниме'];

      // Artwork: ensure high-resolution poster & backdrop
      let posterUrl = anilistData?.coverImage?.extraLarge
        || shikiData?.poster?.originalUrl
        || (brief.poster?.optimized?.src ? `https://anilibria.top${brief.poster.optimized.src}` : null)
        || (brief.poster?.src ? `https://anilibria.top${brief.poster.src}` : null);

      let backdropUrl = anilistData?.bannerImage
        || 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/101922-33MtJGsUSxga.jpg'; // high-res default fallback if no banner

      if (!backdropUrl || !backdropUrl.startsWith('https://')) {
        backdropUrl = posterUrl;
      }

      // Build episodes with AniLibria tracks
      const episodes = [];
      for (const ep of fullRelease.episodes) {
        const sources = [];
        if (ep.hls_1080) sources.push({ quality: 1080, url: ep.hls_1080, stream: true });
        if (ep.hls_720) sources.push({ quality: 720, url: ep.hls_720, stream: true });
        if (ep.hls_480) sources.push({ quality: 480, url: ep.hls_480, stream: true });

        if (!sources.length) continue;

        const duration = Number(ep.duration) || 1420;
        const opening = (ep.opening?.start != null && ep.opening?.stop != null && ep.opening.stop > ep.opening.start)
          ? { start: Number(ep.opening.start), end: Number(ep.opening.stop) }
          : { absent: true };

        const ending = (ep.ending?.start != null && ep.ending?.stop != null && ep.ending.stop > ep.ending.start)
          ? { start: Number(ep.ending.start), end: Number(ep.ending.stop) }
          : { absent: true };

        const audio = [
          {
            id: 'anilibria',
            dubId: 'AniLibria',
            label: 'AniLibria (RU)',
            language: 'ru',
            original: false,
            duration,
            sources,
            subtitles: [],
            opening,
            ending
          }
        ];

        episodes.push({
          number: Number(ep.ordinal),
          audio
        });
      }

      if (!episodes.length) {
        console.log(`No valid video streams found for ${title}, skipping.`);
        continue;
      }

      // Additional voices require their own resolved streams. Never relabel
      // AniLibria URLs as another dub or invent lower-resolution variants.

      const canonicalId = malId ? `mal-${malId}` : shikiId ? `shikimori-${shikiId}` : `lib-${brief.id}`;

      const animeRecord = {
        id: canonicalId,
        ids: {
          mal: malId || null,
          shikimori: shikiId || null,
          anilist: anilistData?.id || null,
          anilibria: brief.id,
          kodik: null
        },
        title,
        originalTitle,
        alt: `${title} ${altNames}`,
        year,
        type: brief.type?.value || 'TV',
        genres,
        description,
        ongoing: isOngoing,
        releasedEpisodes: episodes.map(e => e.number),
        artwork: {
          poster: {
            url: posterUrl,
            width: 800,
            height: 1200
          },
          backdrop: {
            url: backdropUrl,
            width: 1920,
            height: 1080
          }
        },
        episodes
      };

      if(isKnown(knownIDs,animeRecord)){skipped++;continue;}
      if(!createApprovedCatalogue({policyVersion:catalog.policyVersion,items:[animeRecord]}).items.length){
        retryPages.add(page);failed++;console.warn(`Not publishable yet: ${title}`);continue;
      }
      catalog.items.push(animeRecord);
      remember(knownIDs,animeRecord);
      knownIDs.add(canonicalId);
      if (malId) knownIDs.add(`mal:${malId}`);
      if (shikiId) knownIDs.add(`shikimori:${shikiId}`);
      if (animeRecord.ids.anilist) knownIDs.add(`anilist:${animeRecord.ids.anilist}`);

      added++;
      console.log(`✔ Added [${added}/${targetCount}]: "${title}" (${episodes.length} episodes, ${episodes[0].audio.length} audio tracks)`);

      // Gentle pause to respect upstream rate limits
      await wait(500);
    }

    console.log(`Page ${page}: +${added} new, ${skipped} existing, ${failed} pending; scanned ${scanned}`);
    if(added>=targetCount&&page<resumePage)retryPages.add(page);
    await checkpoint(added>=targetCount?resumePage:batch.nextPage);
    if(added>=targetCount) break;
  }

  catalog.updatedAt = new Date().toISOString();
  await saveJSON(CATALOG_PATH, catalog);
  console.log(`\nSuccessfully saved ${catalog.items.length} titles to ${CATALOG_PATH}.`);
  return catalog;
}

// If executed directly
if (process.argv[1]?.endsWith('seed-anilibria.mjs')) {
  const count = process.argv[2]===undefined?20:Number(process.argv[2]);
  seedCatalog({ targetCount: count }).catch(err => {
    console.error('Fatal seeder error:', err);
    process.exit(1);
  });
}
