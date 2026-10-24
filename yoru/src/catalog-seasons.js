const identity=a=>Number(a.ids?.shikimori||a.ids?.mal||a.malId);
const releaseDate=a=>Date.parse(a.airedAt||`${a.year||9999}-01-01`)||0;
function ordered(items,edges=[]){
 const byId=new Map(items.map(a=>[identity(a),a])),adj=new Map(),indegree=new Map(items.map(a=>[identity(a),0]));
 for(const [from,to] of edges){if(!byId.has(from)||!byId.has(to)||from===to)continue;const set=adj.get(from)||new Set();if(set.has(to))continue;set.add(to);adj.set(from,set);indegree.set(to,indegree.get(to)+1);}
 const compare=(a,b)=>releaseDate(a)-releaseDate(b)||(a.seasonNumber||0)-(b.seasonNumber||0)||String(a.id).localeCompare(String(b.id));
 const ready=items.filter(a=>indegree.get(identity(a))===0).sort(compare),result=[];
 while(ready.length){const a=ready.shift();result.push(a);for(const next of adj.get(identity(a))||[]){indegree.set(next,indegree.get(next)-1);if(!indegree.get(next)){ready.push(byId.get(next));ready.sort(compare);}}}
 return [...result,...items.filter(a=>!result.includes(a)).sort(compare)];
}
export function localSeasons(items,current){
 // Traverse explicit links in both directions, including seasons beyond a direct sequel.
 const nodes=items.map(a=>a.id===current.id?current:a);if(!nodes.some(a=>a.id===current.id))nodes.push(current);
 const neighbors=new Map(),byMal=new Map(),byFranchise=new Map();
 const connect=(a,b)=>{if(a===b)return;if(!neighbors.has(a))neighbors.set(a,new Set());if(!neighbors.has(b))neighbors.set(b,new Set());neighbors.get(a).add(b);neighbors.get(b).add(a);};
 for(const a of nodes){const mal=a.ids?.mal||a.malId;if(mal)byMal.set(String(mal),a.id);if(a.franchiseId){const key=String(a.franchiseId);if(byFranchise.has(key))connect(a.id,byFranchise.get(key));else byFranchise.set(key,a.id);}}
 for(const a of nodes)for(const mal of a.relatedMalIds||[]){const id=byMal.get(String(mal));if(id)connect(a.id,id);}
 const seen=new Set([current.id]),queue=[current.id];for(let i=0;i<queue.length;i++)for(const id of neighbors.get(queue[i])||[]){if(!seen.has(id)){seen.add(id);queue.push(id);}}
 const selected=nodes.filter(a=>seen.has(a.id));
 return ordered(selected,selected.flatMap(a=>(a.relations||[]).map(e=>e.relation==='prequel'?[e.id,identity(a)]:[identity(a),e.id])));
}
export function episodeSeasonOptions(anime,activeIndex=1){
 const rows=anime.episodeManifest||[];const seasons=[...new Set(rows.map(e=>e.season??1))].sort((a,b)=>(a===0?Infinity:a)-(b===0?Infinity:b));
 return {seasons,active:rows[activeIndex-1]?.season??1,episodes:rows.map((e,i)=>({...e,index:i+1})).filter(e=>(e.season??1)===(rows[activeIndex-1]?.season??1))};
}

export function firstMainEpisode(anime){
 const rows=(anime.episodeManifest||[]).map((e,i)=>({...e,index:i+1})).filter(e=>(e.season??1)>0&&e.ordinal>0).sort((a,b)=>(a.season??1)-(b.season??1)||a.ordinal-b.ordinal);return rows[0]?.index||1;
}
export function seasonNavigation(anime,index){
 const rows=episodeSeasonOptions(anime,index).episodes,position=rows.findIndex(e=>e.index===index);
 return {previous:rows[position-1]?.index||null,next:rows[position+1]?.index||null};
}
export function seasonMenu(anime,related,activeIndex=1){
 const view=episodeSeasonOptions(anime,activeIndex);
 const connected=related.some(a=>a.id===anime.id)?related:[anime,...related];
 const titles=[...connected].sort((a,b)=>releaseDate(a)-releaseDate(b)||(Math.min(...(a.episodeManifest||[]).map(e=>e.season||Infinity))-Math.min(...(b.episodeManifest||[]).map(e=>e.season||Infinity))));let count=0;
 const main=[],other=[],extras=[];
 for(const title of titles){
  const groups=episodeSeasonOptions(title).seasons;
  for(const season of groups.length?groups:[1]){
   const kind=title.type||'TV';
   const explicit=String(title.translations?.en?.[0]||title.originalTitle||'').match(/(?:season\s*(\d+)|(\d+)(?:st|nd|rd|th)\s+season)/i);
   const numbered=kind==='TV'||kind==='ONA';
   const displaySeason=season===0||!numbered?0:season>1?season:explicit?Number(explicit[1]||explicit[2]):count+1;
   count=Math.max(count,displaySeason);
   const entry={value:title.id===anime.id?`season:${season}`:`release:${title.id}:${season}`,title,kind,season,displaySeason,selected:title.id===anime.id&&season===view.active};
   (season===0?extras:!displaySeason?other:main).push(entry);
  }
 }
 main.sort((a,b)=>a.displaySeason-b.displaySeason);
 for(const e of [...other,...extras])e.extra=true;
 const counts=new Map();for(const e of main)if(e.displaySeason)counts.set(e.displaySeason,(counts.get(e.displaySeason)||0)+1);
 const parts=new Map();for(const e of main)if(counts.get(e.displaySeason)>1){e.part=(parts.get(e.displaySeason)||0)+1;parts.set(e.displaySeason,e.part);}
 return [...main,...other,...extras];
}

export function franchiseSeasons(items,current,links=[],metadata=[]){
 const connected=new Set([Number(current.ids?.shikimori||current.ids?.mal||current.malId)]),queue=[...connected],graph=new Map();
 const add=(a,b)=>{if(!graph.has(a))graph.set(a,new Set());graph.get(a).add(b);};
 for(const edge of links){if(!['prequel','sequel'].includes(String(edge.relation).toLowerCase()))continue;const a=Number(edge.source_id),b=Number(edge.target_id);if(!a||!b)continue;add(a,b);add(b,a);}
 for(let i=0;i<queue.length;i++)for(const id of graph.get(queue[i])||[]){if(!connected.has(id)){connected.add(id);queue.push(id);}}
 const local=new Set(localSeasons(items,current).map(a=>a.id));
 const dates=new Map(metadata.map(a=>[Number(a.id),a.date?new Date(Number(a.date)*1000).toISOString():null]));
 const selected=items.filter(a=>local.has(a.id)||connected.has(identity(a))).map(a=>({...a,airedAt:dates.get(identity(a))||a.airedAt}));
 const edges=links.filter(e=>['prequel','sequel'].includes(e.relation)).map(e=>e.relation==='prequel'?[Number(e.target_id),Number(e.source_id)]:[Number(e.source_id),Number(e.target_id)]);
 return ordered(selected,edges);
}
