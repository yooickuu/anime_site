export function localSeasons(items,current){
 const related=new Set([current.ids?.mal,current.malId,...(current.relatedMalIds||[])]);
 return items.filter(a=>a.id===current.id||(current.franchiseId&&a.franchiseId===current.franchiseId)||(a.ids?.mal&&related.has(a.ids.mal))||(a.relatedMalIds||[]).includes(current.ids?.mal||current.malId)).sort((a,b)=>(a.year||0)-(b.year||0)||(a.seasonNumber||0)-(b.seasonNumber||0));
}
export function episodeSeasonOptions(anime,activeIndex=1){
 const rows=anime.episodeManifest||[];const seasons=[...new Set(rows.map(e=>e.season??1))];
 return {seasons,active:rows[activeIndex-1]?.season??1,episodes:rows.map((e,i)=>({...e,index:i+1})).filter(e=>(e.season??1)===(rows[activeIndex-1]?.season??1))};
}
