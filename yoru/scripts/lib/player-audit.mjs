import {createApprovedCatalogue} from '../../src/approved-catalog.js';
import {firstMainEpisode,episodeSeasonOptions} from '../../src/catalog-seasons.js';
export function auditPlayerCatalogue(publication){
 const approved=createApprovedCatalogue(publication),errors=[];let additionalGroups=0;
 if(approved.items.length!==publication.items.length)errors.push({code:'rejected_catalogue_entries',count:publication.items.length-approved.items.length});
 for(const a of approved.items){
  const initial=firstMainEpisode(a),view=episodeSeasonOptions(a,initial),reachable=new Set();
  if(!view.episodes.length)errors.push({id:a.id,code:'empty_initial_group'});
  for(const season of view.seasons){const first=a.episodeManifest.findIndex(e=>e.season===season)+1;for(const episode of episodeSeasonOptions(a,first).episodes)reachable.add(episode.index);}
  if(reachable.size!==a.episodes)errors.push({id:a.id,code:'unreachable_episodes'});
  if(view.seasons.includes(0))additionalGroups++;
 }
 return {checked:approved.items.length,additionalGroups,errors};
}
