// Each suggestion is an alternative for the time budget, not a combined playlist.
export function eveningPlan(state, lookup, minutes=30) {
 const budget=Math.max(1,Number(minutes)||30)*60, latest=new Map();
 for(const p of Object.values(state.progress||{})) {
  if(!p?.id||!Number.isInteger(p.episode)||p.episode<1)continue;
  if(!latest.has(p.id)||(p.updated||0)>(latest.get(p.id).updated||0))latest.set(p.id,p);
 }
 const ids=new Set([...latest.keys(),...Object.keys(state.entries||{})]);const result=[];
 for(const id of ids){
  const entry=state.entries?.[id],p=latest.get(id),a=lookup(id)||p?.anime||entry?.anime;
  if(!a||a.catalogOnly||a.blocked||['completed','dropped'].includes(entry?.status))continue;
  if(!p&&!['watching','planned','ongoing'].includes(entry?.status))continue;
  const total=Array.isArray(a.episodeNumbers)?a.episodeNumbers.length:Number(a.episodes);if(!Number.isInteger(total)||total<1)continue;
  const start=p? p.episode+(p.completed?1:0):1;if(start>total)continue;
  const isMovie=a.type==='MOVIE'||total===1;
  const known=Number(p?.duration)>0&&!p?.completed?Number(p.duration):0;
  // Never invent the duration of a film. Series without timings get a labelled estimate.
  if(isMovie&&!known)continue;
  const duration=known||24*60, offset=p&&!p.completed?Math.max(0,Math.min(Number(p.time)||0,duration)):0;
  const remaining=duration-offset;if(remaining<1||remaining>budget)continue;
  const count=Math.min(total-start+1,1+Math.floor((budget-remaining)/duration));
  result.push({id,start,ordinal:a.episodeNumbers?.[start-1]??start,count,minutes:Math.ceil((remaining+(count-1)*duration)/60),estimated:!known||count>1,updated:p?.updated||0,resume:offset>0});
 }
 return result.sort((a,b)=>Number(b.resume)-Number(a.resume)||b.updated-a.updated||b.minutes-a.minutes).slice(0,3);
}
