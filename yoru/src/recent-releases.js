export const WEEK=7*24*60*60*1000;
export function releaseStamp(a){
 const date=typeof a.airedAt==='string'?Date.parse(a.airedAt):0;
 // Ongoing source revisions represent recently available episode/dub updates.
 const updated=a.ongoing?Number(a.catalogUpdatedAt)||0:0;
 return Math.max(date||0,updated);
}
export function recentReleases(items,now=Date.now(),limit=24){
 return [...new Map(items.map(a=>[a.id,a])).values()].filter(a=>{const stamp=releaseStamp(a);return stamp>0&&stamp<=now&&stamp>=now-WEEK;}).sort((a,b)=>releaseStamp(b)-releaseStamp(a)).slice(0,limit);
}
