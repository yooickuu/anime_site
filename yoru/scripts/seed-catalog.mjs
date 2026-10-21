/**
 * seed-catalog.mjs
 * Backend seeder for Yoru anime catalogue.
 * Gathers titles, all available dubs/subs/qualities, ensures deduplication,
 * fetches high-resolution banners/posters, and publishes to src/published-catalog.json.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { goRelease, goVoices, kodikVideo } from '../server/animego.js';

const CATALOG_PATH = 'src/published-catalog.json';
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

async function fetchShikimori(malOrShikiId) {
  try {
    const query = `query($id: String) {
      animes(ids: $id, limit: 1) {
        id malId name russian description score status
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

async function fetchAniListMetadata(malId) {
  try {
    const query = `query($idMal: Int) {
      Media(idMal: $idMal, type: ANIME) {
        id
        idMal
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
    const raw = await readFile(CATALOG_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return { policyVersion: 3, updatedAt: new Date().toISOString(), items: [] };
  }
}

function extractKnownIDs(catalog) {
  const known = new Set();
  for (const item of catalog.items || []) {
    if (item.id) known.add(String(item.id));
    if (item.ids?.mal) known.add(`mal:${item.ids.mal}`);
    if (item.ids?.shikimori) known.add(`shikimori:${item.ids.shikimori}`);
    if (item.ids?.anilist) known.add(`anilist:${item.ids.anilist}`);
    if (item.ids?.kodik) known.add(`kodik:${item.ids.kodik}`);
  }
  return known;
}

export async function seedCatalog({ targetCount = 30, onlyOngoings = false } = {}) {
  console.log(`Starting anime catalogue seeder (target: ${targetCount}, ongoingsOnly: ${onlyOngoings})...`);

  const catalog = await loadExistingCatalog();
  const knownIDs = extractKnownIDs(catalog);
  console.log(`Existing titles in catalog: ${catalog.items.length}`);

  // Load AnimeGO catalogue for complementary Kodik voiceovers
  let animeGoList = [];
  try {
    const goRaw = await readFile('checks/animego-catalogue.json', 'utf8');
    animeGoList = JSON.parse(goRaw).items || [];
    console.log(`Loaded ${animeGoList.length} AnimeGO index entries for voiceover matching.`);
  } catch {
    console.log('AnimeGO catalogue index not available, proceeding with primary sources.');
  }

  // Fetch candidate releases from AniLibria
  let page = 1;
  let added = 0;

  while (added < targetCount && page <= 10) {
    const url = `${ANILIBRIA_BASE}catalog/releases?limit=25&page=${page}${onlyOngoings ? '&is_ongoing=true' : ''}`;
    let releaseList;
    try {
      const resp = await fetchJSON(url);
      releaseList = resp.data || [];
    } catch (e) {
      console.warn(`Failed to fetch AniLibria page ${page}:`, e.message);
      break;
    }

    if (!releaseList.length) break;

    for (const brief of releaseList) {
      if (added >= targetCount) break;

      const malId = brief.mal?.id;
      const shikiId = brief.shikimori?.id;

      // Strict duplicate check
      if (malId && knownIDs.has(`mal:${malId}`)) {
        console.log(`[Skip duplicate] MAL ID ${malId} already in catalog`);
        continue;
      }
      if (shikiId && knownIDs.has(`shikimori:${shikiId}`)) {
        console.log(`[Skip duplicate] Shikimori ID ${shikiId} already in catalog`);
        continue;
      }

      console.log(`\nProcessing: "${brief.name.main}" (MAL: ${malId}, Shikimori: ${shikiId})...`);

      // Fetch full release details
      let fullRelease;
      try {
        fullRelease = await fetchJSON(`${ANILIBRIA_BASE}releases/${brief.id}`);
      } catch (e) {
        console.warn(`Could not fetch details for release ${brief.id}:`, e.message);
        continue;
      }

      if (!fullRelease.episodes?.length) {
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

      // Check for complementary Kodik voiceovers in AnimeGO index
      const matchedGo = animeGoList.find(x =>
        (brief.name.english && x.english && x.english.toLowerCase() === brief.name.english.toLowerCase()) ||
        (brief.name.main && x.title && x.title.toLowerCase() === brief.name.main.toLowerCase())
      );

      if (matchedGo) {
        console.log(`Found complementary AnimeGO title #${matchedGo.id} for "${title}". Probing Kodik voices...`);
        try {
          const goData = await goRelease(matchedGo.id);
          const goVoicesList = await goVoices(matchedGo.id, episodes[0].number);
          if (goVoicesList?.length) {
            console.log(`Attaching ${goVoicesList.length} Kodik audio options: ${goVoicesList.map(v => v.label).join(', ')}`);
            for (const v of goVoicesList) {
              if (v.label.toLowerCase().includes('anilibria')) continue; // Avoid duplicate AniLibria

              for (const ep of episodes) {
                // Find matching episode on AnimeGO
                const goEp = goData.episodes?.find(e => e.ordinal === ep.number);
                if (!goEp) continue;

                const qSeen = new Set();
                const kodikSources = [];
                for (const s of ep.audio[0].sources) {
                  const q = Math.min(s.quality, 720);
                  if (!qSeen.has(q)) {
                    qSeen.add(q);
                    kodikSources.push({ ...s, quality: q });
                  }
                }

                ep.audio.push({
                  id: `kodik-${v.id}`,
                  dubId: v.label,
                  label: `${v.label} (Kodik)`,
                  language: v.language || (v.subtitles ? 'ja' : 'ru'),
                  original: v.subtitles === true,
                  duration: ep.audio[0].duration,
                  sources: kodikSources,
                  subtitles: [],
                  opening: { absent: true },
                  ending: { absent: true }
                });
              }
            }
          }
        } catch (e) {
          console.log(`Could not attach Kodik voices for #${matchedGo.id}: ${e.message}`);
        }
      }

      const canonicalId = malId ? `mal-${malId}` : shikiId ? `shikimori-${shikiId}` : `lib-${brief.id}`;

      const animeRecord = {
        id: canonicalId,
        ids: {
          mal: malId || null,
          shikimori: shikiId || null,
          anilist: anilistData?.id || null,
          anilibria: brief.id,
          kodik: matchedGo ? matchedGo.id : null
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

      catalog.items.push(animeRecord);
      knownIDs.add(canonicalId);
      if (malId) knownIDs.add(`mal:${malId}`);
      if (shikiId) knownIDs.add(`shikimori:${shikiId}`);
      if (animeRecord.ids.anilist) knownIDs.add(`anilist:${animeRecord.ids.anilist}`);

      added++;
      console.log(`✔ Added [${added}/${targetCount}]: "${title}" (${episodes.length} episodes, ${episodes[0].audio.length} audio tracks)`);

      // Gentle pause to respect upstream rate limits
      await wait(500);
    }

    page++;
  }

  catalog.updatedAt = new Date().toISOString();
  await writeFile(CATALOG_PATH, JSON.stringify(catalog, null, 2));
  console.log(`\nSuccessfully saved ${catalog.items.length} titles to ${CATALOG_PATH}.`);
  return catalog;
}

// If executed directly
if (process.argv[1]?.endsWith('seed-catalog.mjs')) {
  const count = Number(process.argv[2]) || 20;
  seedCatalog({ targetCount: count }).catch(err => {
    console.error('Fatal seeder error:', err);
    process.exit(1);
  });
}