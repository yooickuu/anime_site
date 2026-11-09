import {AniLibriaAPI,refreshAniLibria} from './lib/anilibria.mjs';
import {readCatalogueText} from './lib/catalog-storage.mjs';
import {KodikAPI} from './lib/kodik-api.mjs';
import {refreshOngoingKodik} from './lib/ongoing-kodik.mjs';
import {loadToken,saveJSON} from './seed-catalog.mjs';
/**
 * update-ongoings.mjs
 * Cron script to check for newly aired episodes of ongoing anime
 * and append them to src/published-catalog.json.
 */

import { mkdir, writeFile } from 'node:fs/promises';

const CATALOG_PATH = 'src/published-catalog.json';
export async function updateOngoings() {
  console.log('Checking for ongoing anime updates...');

  const token=await loadToken(),api=token?new KodikAPI(token):null;
  let catalog;
  try {
    const raw = await readCatalogueText(CATALOG_PATH);
    catalog = JSON.parse(raw);
  } catch (e) {
    console.error('Failed to read published-catalog.json:', e.message);
    throw e;
  }

  const ongoings = (catalog.items || []).filter(item => item.ongoing === true);
  console.log(`Found ${ongoings.length} ongoing titles in catalogue.`);

  let updatedCount = 0;
  let newEpisodesCount = 0;

  let failures=0,attempted=0,succeeded=0;const failed=[],anilibria=new AniLibriaAPI();
  if(ongoings.some(item=>item.kodikIds?.length)&&!api)throw Error('KODIK_API_TOKEN missing: ongoing updates cannot run');
  for (let item of ongoings) {
    if(item.kodikIds?.length){
      if(!api){console.warn(`Kodik update skipped for ${item.id}: KODIK_TOKEN missing`);continue;}
      attempted++;
      try{
        const updated=await refreshOngoingKodik(item,api);succeeded++;
        if(updated!==item){newEpisodesCount+=Math.max(0,updated.episodes.length-item.episodes.length);catalog.items[catalog.items.indexOf(item)]=updated;item=updated;updatedCount++;}
      }catch(error){failures++;failed.push({id:item.id,reason:error.message});console.warn(`Kodik update pending for ${item.id}: ${error.message}`);if(/kodik_http_(401|403)|kodik_access_or_response_error/.test(error.message))throw Error('Kodik authorization failed: check repository KODIK_API_TOKEN; no successful update');}
    }
    if(!item.ids?.anilibria)continue;
    attempted++;
    try{
      const updated=await refreshAniLibria(item,anilibria);succeeded++;
      if(updated!==item){
        newEpisodesCount+=Math.max(0,updated.episodes.length-item.episodes.length);
        catalog.items[catalog.items.indexOf(item)]=updated;updatedCount++;
      }
    }catch(error){failures++;failed.push({id:item.id,provider:'anilibria',reason:error.message});console.warn(`AniLibria update pending for ${item.id}: ${error.message}`);}
  }

  const report={checked:ongoings.length,attempted,succeeded,updated:updatedCount,newEpisodes:newEpisodesCount,failures:failed};
  await mkdir('checks',{recursive:true});
  await saveJSON('checks/ongoing-update.json',report);
  if(process.env.GITHUB_STEP_SUMMARY)await writeFile(process.env.GITHUB_STEP_SUMMARY,`## Ongoing update\nChecked: ${ongoings.length}; updated: ${updatedCount}; new episodes: ${newEpisodesCount}; errors: ${failures}.\n`+failed.map(e=>`- ${e.id}: ${e.reason}`).join('\n'),{flag:'a'});
  if (updatedCount > 0) {
    catalog.updatedAt = new Date().toISOString();
    await saveJSON(CATALOG_PATH, catalog);
    console.log(`\nUpdated catalogue: added ${newEpisodesCount} new episode(s) across ${updatedCount} title(s).`);
  } else {
    console.log(failures?`Проверка завершилась с ошибками: ${failures}. Существующие серии сохранены.`:'\nNo new episodes found.');
    if(attempted>0&&succeeded===0)throw Error('All ongoing updates failed');
  }
}

if (process.argv[1]?.endsWith('update-ongoings.mjs')) {
  updateOngoings().catch(err => {
    console.error('Fatal error updating ongoings:', err);
    process.exit(1);
  });
}

