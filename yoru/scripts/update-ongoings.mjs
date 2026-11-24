import {AniLibriaAPI,refreshAniLibria} from './lib/anilibria.mjs';
import {readCatalogueText} from './lib/catalog-storage.mjs';
import {KodikAPI} from './lib/kodik-api.mjs';
import {refreshOngoingKodik} from './lib/ongoing-kodik.mjs';
import {loadToken,saveJSON,loadJSON} from './seed-catalog.mjs';
/**
 * update-ongoings.mjs
 * Cron script to check for newly aired episodes of ongoing anime
 * and append them to src/published-catalog.json.
 */

import {auditPlayerCatalogue} from './lib/player-audit.mjs';
import {dirname} from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';

const CATALOG_PATH = 'src/published-catalog.json';
export async function updateOngoings({catalogPath=CATALOG_PATH,reportPath='checks/ongoing-update.json',retryPath='src/ongoing-retries.json',api:configuredAPI,anilibria:configuredAniLibria,kodikRefresh=refreshOngoingKodik,anilibriaRefresh=refreshAniLibria,fetcher=fetch}={}) {
  console.log('Checking for ongoing anime updates...');

  const token=configuredAPI?null:await loadToken(),api=configuredAPI||(token?new KodikAPI(token):null);
  let catalog,original;
  try {
    const raw = await readCatalogueText(catalogPath);
    catalog = JSON.parse(raw);original=raw;
  } catch (e) {
    console.error('Failed to read published-catalog.json:', e.message);
    throw e;
  }

  const retries=await loadJSON(retryPath,{ids:[]}),retryIds=new Set(retries.ids||[]);
  const ongoings = (catalog.items || []).filter(item => item.ongoing === true||retryIds.has(item.id));
  console.log(`Found ${ongoings.length} ongoing titles in catalogue.`);

  let updatedCount = 0;
  let newEpisodesCount = 0;

  let failures=0,attempted=0,succeeded=0;const failed=[],anilibria=configuredAniLibria||new AniLibriaAPI();
  if(ongoings.some(item=>item.kodikIds?.length)&&!api)throw Error('KODIK_API_TOKEN missing: ongoing updates cannot run');
  for (let item of ongoings) {
    if(item.kodikIds?.length){
      if(!api){console.warn(`Kodik update skipped for ${item.id}: KODIK_TOKEN missing`);continue;}
      attempted++;
      try{
        const updated=await kodikRefresh(item,api);succeeded++;
        if(updated!==item){newEpisodesCount+=Math.max(0,updated.episodes.length-item.episodes.length);catalog.items[catalog.items.indexOf(item)]=updated;item=updated;updatedCount++;}
      }catch(error){failures++;failed.push({id:item.id,provider:'kodik',reason:error.message});console.warn(`Kodik update pending for ${item.id}: ${error.message}`);if(/kodik_http_(401|403)|kodik_access_or_response_error/.test(error.message))throw Error('Kodik authorization failed: check repository KODIK_API_TOKEN; no successful update');}
    }
    if(!item.ids?.anilibria)continue;
    attempted++;
    try{
      const updated=await anilibriaRefresh(item,anilibria);succeeded++;
      if(updated!==item){
        newEpisodesCount+=Math.max(0,updated.episodes.length-item.episodes.length);
        catalog.items[catalog.items.indexOf(item)]=updated;updatedCount++;
      }
    }catch(error){failures++;failed.push({id:item.id,provider:'anilibria',reason:error.message});console.warn(`AniLibria update pending for ${item.id}: ${error.message}`);}
  }

  const stillOngoing = ongoings.filter(item => item.ongoing === true && (item.ids?.shikimori || item.ids?.mal));
  if(stillOngoing.length){
    try{
      for(let i=0;i<stillOngoing.length;i+=50){
        const chunk=stillOngoing.slice(i,i+50);
        const ids=chunk.map(a=>a.ids?.shikimori||a.ids?.mal).filter(Boolean);
        if(!ids.length)continue;
        const res=await fetcher('https://shikimori.io/api/graphql',{
          method:'POST',
          headers:{'Content-Type':'application/json','User-Agent':'Yomiku/2.0'},
          body:JSON.stringify({query:`{animes(ids:${JSON.stringify(ids.join(','))},limit:50){id malId status episodes episodesAired airedOn{year month day}}}`}),
          signal:AbortSignal.timeout(10000)
        });
        if(res.ok){
          const data=await res.json();
          const map=new Map((data.data?.animes||[]).map(a=>[String(a.id),a]));
          for(const item of chunk){
            const shikiId=String(item.ids?.shikimori||item.ids?.mal);
            const info=map.get(shikiId);
            if(info&&info.status==='released'){
              const epCount=Number(info.episodes)||0;
              if(item.episodes?.length&&(epCount===0||item.episodes.length>=epCount||item.releasedEpisodes?.length>=epCount)){
                console.log(`Тайтл завершён (Shikimori): ${item.title}`);
                item.ongoing=false;
                item.status='released';
                const idx=catalog.items.indexOf(item);
                if(idx>=0)catalog.items[idx]=item;
                updatedCount++;
              }
            }
          }
        }
      }
    }catch(e){
      console.warn('Shikimori status check skipped:', e.message);
    }
  }

  const report={checked:ongoings.length,attempted,succeeded,updated:updatedCount,newEpisodes:newEpisodesCount,failures:failed};
  await mkdir(dirname(reportPath),{recursive:true});
  await saveJSON(reportPath,report);
  for(const error of failed)console.warn(`::warning::${error.provider} ${error.id}: ${error.reason.replace(/[\r\n]/g,' ')}`);
  if(process.env.GITHUB_STEP_SUMMARY)await writeFile(process.env.GITHUB_STEP_SUMMARY,`## Ongoing update\nChecked: ${ongoings.length}; updated: ${updatedCount}; new episodes: ${newEpisodesCount}; errors: ${failures}.\n`+failed.map(e=>`- ${e.id}: ${e.reason}`).join('\n'),{flag:'a'});
  if (updatedCount > 0) {
    if(await readCatalogueText(catalogPath)!==original)throw Error('catalogue_changed_during_update_retry');
    if(auditPlayerCatalogue(catalog).errors.length)throw Error('updated_catalogue_validation_failed');
    catalog.updatedAt = new Date().toISOString();
    await saveJSON(catalogPath, catalog);
    console.log(`\nUpdated catalogue: added ${newEpisodesCount} new episode(s) across ${updatedCount} title(s).`);
  } else {
    console.log(failures?`Проверка завершилась с ошибками: ${failures}. Существующие серии сохранены.`:'\nNo new episodes found.');
    if(attempted>0&&succeeded===0)throw Error('All ongoing updates failed');
  }
  await saveJSON(retryPath,{ids:[...new Set(failed.map(e=>e.id))]});
  return report;
}

if (process.argv[1]?.endsWith('update-ongoings.mjs')) {
  updateOngoings().catch(err => {
    console.error('Fatal error updating ongoings:', err);
    process.exit(1);
  });
}

