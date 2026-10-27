import {normalizeType} from '../../src/catalog-query.js';
// Count distinct playable episode records, not the highest ordinal or dub count.
// Media arrays, URLs, provider references and title IDs remain untouched.
export function repairDisplayMetadata(publication) {
 const stats={titles:0,counts:0,types:0};
 for(const item of publication.items||[]){
  stats.titles++;
  const episodes=Array.isArray(item.episodes)?item.episodes:[];
  const playable=episodes.filter(e=>(e.audio||[]).some(t=>t.providerRef?.url||(t.sources||[]).some(s=>s.url)));
  const count=new Set(playable.map(e=>`${e.season??1}:${e.ordinal??e.number}`)).size;
  if(item.availableEpisodeCount!==count){item.availableEpisodeCount=count;stats.counts++;}
  const serial=[item.sourceType,item.kodikType,item.type].includes('anime-serial')||
   [item.ids?.kodik,...(item.kodikIds||[]),...playable.flatMap(e=>(e.audio||[]).map(t=>t.providerRef?.releaseId))].some(id=>String(id||'').startsWith('serial-'));
  if(normalizeType(item.type)==='MOVIE'&&(count>1||serial)){item.type='TV';stats.types++;}
  if(item.type==='anime-serial'){item.type='TV';stats.types++;}
 }
 return stats;
}
