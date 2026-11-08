import {normalizeGenre,normalizeSearch} from './catalog-query.js';
const words=a=>new Set(normalizeSearch(a.description||'').split(' ').filter(w=>w.length>5));
// Rank already loaded light cards: no media fetches or full-catalogue allocation.
export function similarTitles(current,candidates,limit=7){
 const genres=new Set((current.genres||[]).map(normalizeGenre)),plot=words(current);
 return [...new Map(candidates.filter(a=>a?.id&&a.id!==current.id&&!a.catalogOnly).map(a=>[a.id,a])).values()].map(a=>{
  const tags=new Set((a.genres||[]).map(normalizeGenre)),shared=[...tags].filter(g=>genres.has(g)).length;
  const overlap=[...words(a)].filter(w=>plot.has(w)).length;
  return {a,shared,score:shared/(genres.size+tags.size-shared||1)*10+Math.min(overlap,5)*.2};
 }).filter(r=>r.shared>0).sort((x,y)=>y.score-x.score||(Number(y.a.popularity)||0)-(Number(x.a.popularity)||0)||x.a.id.localeCompare(y.a.id)).slice(0,limit).map(r=>r.a);
}
