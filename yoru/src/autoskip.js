const cache=new Map();
export function compatibleSkipTimes(data,duration){
 const out={opening:null,ending:null};
 if(!Number.isFinite(duration)||duration<=0||data?.found===false||!Array.isArray(data?.results))return out;
 const distances={};
 for(const row of data.results){
  const name={op:'opening',ed:'ending'}[row.skipType],start=row.interval?.startTime,end=row.interval?.endTime;
  // Do not apply timestamps from a cut with extra ads or a different edit.
  const distance=Math.abs(row.episodeLength-duration);
  if(!name||!Number.isFinite(row.episodeLength)||distance>8||!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||end>duration)continue;
  if(distances[name]!==undefined&&distances[name]<=distance)continue;
  distances[name]=distance;out[name]={start,end};
 }
 return out;
}
export async function automaticSkipTimes(malId,episode,duration){
 if(!Number.isInteger(Number(malId))||Number(malId)<=0||!Number.isInteger(episode)||episode<=0||!Number.isFinite(duration)||duration<=0)return {};
 const length=duration.toFixed(3),key=malId+':'+episode+':'+length;
 if(cache.get(key)?.expires<Date.now())cache.delete(key);
 if(!cache.has(key)){
  if(cache.size>=80)cache.delete(cache.keys().next().value);
  const entry={expires:Date.now()+300000};
  entry.request=(async()=>{try{
   const r=await fetch(`https://api.aniskip.com/v2/skip-times/${Number(malId)}/${episode}?types=op&types=ed&episodeLength=${length}`,{signal:AbortSignal.timeout(6000)});
   if(r.status===404)return {};if(!r.ok)throw Error();return await r.json();
  }catch{entry.expires=Date.now()+15000;return {};}})();
  cache.set(key,entry);
 }
 return compatibleSkipTimes(await cache.get(key).request,duration);
}
