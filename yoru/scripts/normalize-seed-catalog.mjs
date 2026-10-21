import {identityKeys} from '../src/catalog-admission.js';
// Merge only exact provider identities, never merely similar titles.
export function normalizeSeedCatalog(publication){
 const result=structuredClone(publication),items=[],seen=new Map();
 let duplicates=0,copiedTracks=0;
 for(const item of result.items){
  for(const episode of item.episodes||[]){
   const urls=new Set(episode.audio.filter(t=>t.id==='anilibria').flatMap(t=>t.sources.map(s=>s.url)));
   episode.audio=episode.audio.filter(t=>{
    const copy=t.id.startsWith('kodik-')&&t.sources.length>0&&t.sources.every(s=>urls.has(s.url));
    if(copy)copiedTracks++;
    return !copy;
   });
  }
  const keys=[`id:${item.id}`,...identityKeys(item)];
  const existing=keys.map(k=>seen.get(k)).find(Boolean);
  if(existing){
   duplicates++;
   for(const episode of item.episodes){
    const prior=existing.episodes.find(e=>e.number===episode.number);
    if(!prior)existing.episodes.push(episode);
    else for(const track of episode.audio){
     const t=prior.audio.find(t=>t.id===track.id);
     if(!t)prior.audio.push(track);
     else for(const source of track.sources)if(!t.sources.some(s=>s.quality===source.quality))t.sources.push(source);
    }
   }
   existing.episodes.sort((a,b)=>a.number-b.number);
   existing.releasedEpisodes=existing.episodes.map(e=>e.number);
  }else items.push(item);
  keys.forEach(k=>seen.set(k,existing||item));
 }
 result.items=items;
 return {publication:result,duplicates,copiedTracks};
}
