import {catalogParams,completeRelease,linkedEpisodes,mergeKodikRelease} from './kodik-api.mjs';
import {createApprovedCatalogue} from '../../src/approved-catalog.js';
// Refresh already admitted tracks; artwork and identity do not need re-importing.
export async function refreshOngoingKodik(item,api){
 const shikimori=Number(item.ids?.shikimori);if(!Number.isSafeInteger(shikimori)||shikimori<=0)throw Error('shikimori_identity_missing');
 const tracks=new Map(item.episodes.flatMap(e=>e.audio).filter(t=>t.providerRef?.provider==='kodik').map(t=>[String(t.providerRef.translationId),t]));
 let updated=item,matched=0;
 for await(const batch of api.pages('/search',{...catalogParams,shikimori_id:shikimori})){
  for(const release of batch.results){
   if(Number(release.shikimori_id)!==shikimori)continue;
   const track=tracks.get(String(release.translation?.id));if(!track)continue;
   matched++;
   const revision=release.updated_at||String(release.episodes_count);
   if(updated.kodikRevisions?.[release.id]===revision)continue;
   const complete=await completeRelease(api,release);
   const episodes=linkedEpisodes({...complete,translation:{...complete.translation,language:complete.translation?.language||track.language}});
   const status=complete.material_data?.anime_status;
   const incoming={...item,kodikIds:[String(release.id)],kodikRevisions:{[release.id]:revision},episodes,releasedEpisodes:episodes.map(e=>e.number),ongoing:status==='released'?false:status==='ongoing'?true:item.ongoing};
   const merged=mergeKodikRelease(updated,incoming);
   if(!createApprovedCatalogue({policyVersion:3,items:[merged]}).items.length)throw Error('catalogue_validation_failed');
   updated=merged;
  }
 }
 if(!matched)throw Error('no_matching_kodik_translations');
 return updated;
}
