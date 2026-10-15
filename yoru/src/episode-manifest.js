// Join only already matched releases. Episode numbers, not list positions, identify a series.
export function episodeManifest(liberty=[],vost=[],expected=null) {
  liberty=liberty||[];vost=vost||[];
  const ordered=[...new Set(liberty.map(Number))].sort((a,b)=>a-b);
  const translated=[...new Set(vost.map(Number))].sort((a,b)=>a-b);
  // Some studios continue global numbering in season two; others restart at 1.
  // Align only complete, contiguous, non-overlapping seasons with a known length.
  const length=Number(expected),offset=ordered[0]-1;
  const align=length>0&&ordered.length===length&&translated.length===length&&offset>=length&&
    ordered.every((n,i)=>n===offset+i+1)&&translated.every((n,i)=>n===i+1);
  if(align)vost=vost.map(n=>({ordinal:Number(n)+offset,sourceOrdinal:Number(n)}));
  const entries=new Map();
  for(const [source,numbers] of [['liberty',liberty],['vost',vost]])for(const value of numbers){
    const ordinal=Number(typeof value==='object'?value.ordinal:value);
    const sourceOrdinal=Number(typeof value==='object'?value.sourceOrdinal:value);
    if(!Number.isFinite(ordinal)||ordinal<0)continue;
    const entry=entries.get(ordinal)||{ordinal,audio:[],sources:{}};
    if(!entry.audio.includes(source))entry.audio.push(source);
    entry.sources[source]=sourceOrdinal;
    entries.set(ordinal,entry);
  }
  return [...entries.values()].sort((a,b)=>a.ordinal-b.ordinal);
}
export function savedEpisodeNumber(progress){return progress.ordinal??progress.anime?.episodeNumbers?.[progress.episode-1]??progress.episode;}
export function rebaseProgress(progress,id,numbers){
  const result=Object.fromEntries(Object.entries(progress).filter(([,p])=>p.id!==id));
  for(const p of Object.values(progress).filter(p=>p.id===id)){
    const ordinal=savedEpisodeNumber(p),index=numbers.indexOf(Number(ordinal));
    const key=index<0?`${id}:unavailable:${ordinal}`:`${id}:${index+1}`;
    const value=index<0?p:{...p,ordinal,episode:index+1};
    if(!result[key]||(result[key].updated||0)<=(p.updated||0))result[key]=value;
  }
  return result;
}
