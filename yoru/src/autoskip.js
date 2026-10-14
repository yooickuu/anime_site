const cache=new Map();
export function compatibleSkipTimes(data,duration){
 const out={opening:null,ending:null};
 if(!Number.isFinite(duration)||duration<=0)return out;
 for(const row of data?.results||[]){
  const name={op:'opening',ed:'ending'}[row.skipType],start=row.interval?.startTime,end=row.interval?.endTime;
  // Do not apply timestamps from a cut with extra ads or a different edit.
  if(!name||!Number.isFinite(row.episodeLength)||Math.abs(row.episodeLength-duration)>8||!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||end>duration+.5)continue;
  out[name]={start,end:Math.min(end,duration)};
 }
 return out;
}
export async function automaticSkipTimes(malId,episode,duration){
 if(!Number.isInteger(Number(malId))||Number(malId)<=0||!Number.isFinite(episode)||episode<=0)return {};
 const key=malId+':'+episode;
 if(!cache.has(key))cache.set(key,(async()=>{try{const r=await fetch(`https://api.aniskip.com/v2/skip-times/${malId}/${episode}?types[]=op&types[]=ed&episodeLength=0`,{signal:AbortSignal.timeout(6000)});if(r.status===404)return {};if(!r.ok)throw Error();return await r.json();}catch{cache.delete(key);return {};}})());
 return compatibleSkipTimes(await cache.get(key),duration);
}
