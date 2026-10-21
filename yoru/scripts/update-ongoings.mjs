/**
 * update-ongoings.mjs
 * Cron script to check for newly aired episodes of ongoing anime
 * and append them to src/published-catalog.json.
 */

import { readFile, writeFile } from 'node:fs/promises';

const CATALOG_PATH = 'src/published-catalog.json';
const ANILIBRIA_BASE = 'https://anilibria.top/api/v1/anime/';
const USER_AGENT = 'YoruAnimeApp/2.0 (https://yooickuu.github.io/yooickuu.com/)';

const wait = ms => new Promise(r => setTimeout(r, ms));

async function fetchJSON(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    signal: AbortSignal.timeout(15000)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function updateOngoings() {
  console.log('Checking for ongoing anime updates...');

  let catalog;
  try {
    const raw = await readFile(CATALOG_PATH, 'utf8');
    catalog = JSON.parse(raw);
  } catch (e) {
    console.error('Failed to read published-catalog.json:', e.message);
    return;
  }

  const ongoings = (catalog.items || []).filter(item => item.ongoing === true);
  console.log(`Found ${ongoings.length} ongoing titles in catalogue.`);

  let updatedCount = 0;
  let newEpisodesCount = 0;

  for (const item of ongoings) {
    const anilibriaId = item.ids?.anilibria;
    if (!anilibriaId) continue;

    console.log(`Checking updates for: "${item.title}" (AniLibria #${anilibriaId})...`);

    let release;
    try {
      release = await fetchJSON(`${ANILIBRIA_BASE}releases/${anilibriaId}`);
    } catch (e) {
      console.warn(`Could not fetch AniLibria release ${anilibriaId}: ${e.message}`);
      continue;
    }

    const currentEpisodeNumbers = new Set((item.episodes || []).map(e => e.number));
    const remoteEpisodes = release.episodes || [];

    let addedEpisodesForThisItem = 0;

    for (const ep of remoteEpisodes) {
      const ordinal = Number(ep.ordinal);
      if (currentEpisodeNumbers.has(ordinal)) continue;

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

      item.episodes.push({
        number: ordinal,
        audio
      });

      currentEpisodeNumbers.add(ordinal);
      addedEpisodesForThisItem++;
      newEpisodesCount++;
    }

    if (addedEpisodesForThisItem > 0) {
      item.episodes.sort((a, b) => a.number - b.number);
      item.releasedEpisodes = item.episodes.map(e => e.number);
      console.log(`✔ Added ${addedEpisodesForThisItem} new episode(s) to "${item.title}". Total episodes: ${item.episodes.length}`);
      updatedCount++;
    }

    // Check if the title is no longer ongoing
    if (release.is_ongoing === false && item.ongoing === true) {
      item.ongoing = false;
      console.log(`Title "${item.title}" finished airing, updated ongoing=false.`);
      updatedCount++;
    }

    await wait(400);
  }

  if (updatedCount > 0) {
    catalog.updatedAt = new Date().toISOString();
    await writeFile(CATALOG_PATH, JSON.stringify(catalog, null, 2));
    console.log(`\nUpdated catalogue: added ${newEpisodesCount} new episode(s) across ${updatedCount} title(s).`);
  } else {
    console.log('\nAll ongoings are up to date. No new episodes found.');
  }
}

if (process.argv[1]?.endsWith('update-ongoings.mjs')) {
  updateOngoings().catch(err => {
    console.error('Fatal error updating ongoings:', err);
    process.exit(1);
  });
}

