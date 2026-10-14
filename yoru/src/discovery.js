export function discoveryChoice(items,entries={},recent=[],random=Math.random){
 const unique=[...new Map(items.filter(a=>a&&!a.blocked&&!a.catalogOnly).map(a=>[a.id,a])).values()];
 const fresh=unique.filter(a=>!recent.includes(a.id)&&!['completed','dropped'].includes(entries[a.id]?.status));
 const pool=fresh.length?fresh:unique.filter(a=>!recent.includes(a.id));
 if(!pool.length)return null;
 const weighted=pool.flatMap(a=>Array(entries[a.id]?.status==='planned'?3:1).fill(a));
 return weighted[Math.min(weighted.length-1,Math.floor(random()*weighted.length))];
}
export function watchRoute(hash){
 const match=hash.match(/^#watch\/((?:mal|lib|vost|kitsu)-\d+|sintel)\/([1-9]\d*)$/);
 if(!match||!Number.isSafeInteger(Number(match[2])))return null;
 return {id:match[1],episode:Number(match[2])};
}
export function audioChoices(a){return [a.providerId&&{id:'liberty',label:'AniLiberty',language:'ru'},a.animeVostId&&{id:'vost',label:'AnimeVost',language:'ru'}].filter(Boolean);}
