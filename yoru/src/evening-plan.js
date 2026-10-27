// Suggestions are alternatives, not one combined playlist. Unknown timings stay labelled.
export function eveningPlan(state, lookup, minutes=30, mode='all') {
 const budget=Math.max(1,Math.min(240,Number(minutes)||30))*60;
 const speed=Math.max(.5,Math.min(3,Number(state.preferences?.speed)||1));
 const grouped=new Map();
 for(const p of Object.values(state.progress||{})){
  if(!p?.id||!Number.isInteger(p.episode)||p.episode<1)continue;
  if(!grouped.has(p.id))grouped.set(p.id,[]);grouped.get(p.id).push(p);
 }
 const result=[];
 for(const id of new Set([...grouped.keys(),...Object.keys(state.entries||{})])){
  const history=(grouped.get(id)||[]).sort((a,b)=>(b.updated||0)-(a.updated||0));
  const latest=history[0],entry=state.entries?.[id],a=lookup(id)||latest?.anime||entry?.anime;
  if(!a||a.catalogOnly||a.blocked||['completed','dropped'].includes(entry?.status))continue;
  const started=history.length>0||entry?.status==='watching';
  if(mode==='continue'&&!started||mode==='new'&&started)continue;
  if(!latest&&!entry)continue;
  const numbers=Array.isArray(a.episodeNumbers)?a.episodeNumbers:null;
  // An announced total is not a released episode count for an ongoing title.
  const total=numbers?numbers.length:a.ongoing&&!a.catalogApproved?Math.max(0,...history.map(p=>p.episode)):Number(a.episodes);
  if(!Number.isInteger(total)||total<1)continue;
  const progress=new Map();
  for(const p of history){
   const n=numbers&&p.ordinal!=null?numbers.indexOf(Number(p.ordinal))+1:p.episode;
   if(n>0&&!progress.has(n))progress.set(n,p);
  }
  // Resume the latest unfinished episode; a replay of an older completed episode
  // must not move the suggested continuation behind the furthest completion.
  const latestIndex=latest?(numbers&&latest.ordinal!=null?numbers.indexOf(Number(latest.ordinal))+1:latest.episode):1;
  const completed=[...progress].filter(([,p])=>p.completed).map(([n])=>n);
  let start=latest&&!latest.completed?latestIndex:Math.max(0,...completed)+1;
  if(start<1)continue;
  while(start<=total&&progress.get(start)?.completed)start++;
  if(start>total)continue;
  const durations=history.map(p=>Number(p.duration)).filter(n=>Number.isFinite(n)&&n>60).sort((a,b)=>a-b);
  const typical=durations.length?durations[Math.floor(durations.length/2)]:1440;
  const movie=a.type==='MOVIE';let seconds=0,count=0,estimated=false,last=start;
  for(let n=start;n<=total;n++){
   const p=progress.get(n);if(p?.completed)break;
   const metadata=Number(a.episodeManifest?.[n-1]?.duration);
   const known=Number(p?.duration)>0?Number(p.duration):metadata>0?metadata:0;
   if(movie&&!known)break;
   const duration=known||typical,offset=Math.max(0,Math.min(Number(p?.time)||0,duration));
   const remaining=(duration-offset)/speed;
   if(remaining<=0||seconds+remaining>budget+.001)break;
   seconds+=remaining;count++;last=n;estimated ||= !known;
  }
  if(!count)continue;
  const finishes=!a.ongoing&&last===total;
  if(mode==='finish'&&!finishes)continue;
  result.push({id,start,finishes,resumeSeconds:Math.max(0,Number(progress.get(start)?.time)||0),ordinal:numbers?.[start-1]??start,lastOrdinal:numbers?.[last-1]??last,count,minutes:Math.ceil(seconds/60),spareMinutes:Math.max(0,Math.floor((budget-seconds)/60)),estimated,speed,updated:latest?.updated||0,resume:Number(progress.get(start)?.time)>0,started});
 }
 return result.sort((a,b)=>Number(b.resume)-Number(a.resume)||Number(b.started)-Number(a.started)||b.updated-a.updated||b.minutes-a.minutes).slice(0,3);
}
