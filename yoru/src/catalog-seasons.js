export function localSeasons(items,current){
 // Traverse explicit links in both directions, including seasons beyond a direct sequel.
 const nodes=[...items];if(!nodes.some(a=>a.id===current.id))nodes.push(current);
 const neighbors=new Map(),byMal=new Map(),byFranchise=new Map();
 const connect=(a,b)=>{if(a===b)return;if(!neighbors.has(a))neighbors.set(a,new Set());if(!neighbors.has(b))neighbors.set(b,new Set());neighbors.get(a).add(b);neighbors.get(b).add(a);};
 for(const a of nodes){const mal=a.ids?.mal||a.malId;if(mal)byMal.set(String(mal),a.id);if(a.franchiseId){const key=String(a.franchiseId);if(byFranchise.has(key))connect(a.id,byFranchise.get(key));else byFranchise.set(key,a.id);}}
 for(const a of nodes)for(const mal of a.relatedMalIds||[]){const id=byMal.get(String(mal));if(id)connect(a.id,id);}
 const seen=new Set([current.id]),queue=[current.id];for(let i=0;i<queue.length;i++)for(const id of neighbors.get(queue[i])||[]){if(!seen.has(id)){seen.add(id);queue.push(id);}}
 return items.filter(a=>seen.has(a.id)).sort((a,b)=>(a.year||0)-(b.year||0)||(a.seasonNumber||0)-(b.seasonNumber||0));
}
export function episodeSeasonOptions(anime,activeIndex=1){
 const rows=anime.episodeManifest||[];const seasons=[...new Set(rows.map(e=>e.season??1))];
 return {seasons,active:rows[activeIndex-1]?.season??1,episodes:rows.map((e,i)=>({...e,index:i+1})).filter(e=>(e.season??1)===(rows[activeIndex-1]?.season??1))};
}
