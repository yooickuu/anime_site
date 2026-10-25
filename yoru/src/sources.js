import bootstrap from './catalog-bootstrap.json' with {type:'json'};
import {createCatalogueStore} from './catalog-store.js';
import {refreshKodikMedia} from './kodik-playback.js';
import {localSeasons,franchiseSeasons} from './catalog-seasons.js';
import {createApprovedCatalogue} from './approved-catalog.js';
import {registerAnime} from './catalog.js';
import {requestCache} from './request-cache.js';
const store=createCatalogueStore(bootstrap);
export const publishedItems=bootstrap.items;
export const catalogueYears=bootstrap.years;
export const isPublished=store.isPublished;
const mediaCatalogue=requestCache(async id=>{
 if(!await store.card(id))throw Error('notAdmitted');
 const url=new URL(`data/media/${encodeURIComponent(id)}.json`,globalThis.document?.baseURI||'https://yomiku.site/');url.searchParams.set('v',bootstrap.revision);
 const response=await fetch(url,{signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error('providerError');
 const data=await response.json();if(data.items?.length!==1||data.items[0].id!==id)throw Error('invalid_manifest');
 const catalogue=createApprovedCatalogue(data);if(!catalogue.find(id))throw Error('notAdmitted');return catalogue;
},{ttl:3600000,max:2});
let queryGeneration=0;
export async function combinedCatalogue(options={}){
 const own=++queryGeneration,result=await store.query(options,{current:()=>own===queryGeneration});
 return {...result,items:result.items.map(registerAnime)};
}
combinedCatalogue.clear=()=>{queryGeneration++;};
export async function resolveRelease(a){
 const card=await store.card(a.id);if(!card)throw Error('notAdmitted');registerAnime(card);
 // Preserve a playing title's episode manifest, but never load one for a grid card.
 return {...a,...card};
}
resolveRelease.clear=()=>{};
export const findWatchRelease=requestCache(async id=>{
 const card=await store.card(id);if(!card)return null;
 const item=(await mediaCatalogue(id)).find(id);registerAnime(card);return {...item,...card};
},{max:3});
export async function discoveryIndex(){return (await store.random()).map(registerAnime);}
export async function prepareEpisodeAudio(a){if(a?.id)await mediaCatalogue(a.id);}
const seasonLists=new Map();
export const knownSeasons=a=>seasonLists.get(a.id)||[a];
async function watchTitles(ids,current){const items=[current];for(const id of new Set(ids)){if(id===current.id)continue;try{const a=await findWatchRelease(id);if(a)items.push(a);}catch{}}return items;}
function rememberSeasons(a,items){seasonLists.set(a.id,items);while(seasonLists.size>3)seasonLists.delete(seasonLists.keys().next().value);return items;}
export const releaseSeasons=requestCache(async a=>{
 const card=await store.card(a.id),items=await watchTitles(card?.relatedCatalogIds||[],a);
 const local=localSeasons(items,a),shiki=a.ids?.shikimori||a.ids?.mal||a.malId;
 if(!shiki)return rememberSeasons(a,local);
 try{
  const response=await fetch(`https://shikimori.io/api/animes/${Number(shiki)}/franchise`,{signal:AbortSignal.timeout(6000)});
  if(response.ok){const data=await response.json();if(Array.isArray(data.links)){
   const connected=franchiseSeasons((data.nodes||[]).map(n=>({id:'mal-'+n.id,ids:{mal:Number(n.id)}})),a,data.links,data.nodes);
   const ids=await store.related(connected.map(x=>x.ids?.mal||x.malId));
   const full=await watchTitles([...items.map(x=>x.id),...ids],a);
   return rememberSeasons(a,franchiseSeasons(full,a,data.links,data.nodes));
  }}
 }catch{}
 if(!(a.ids?.mal||a.malId))return rememberSeasons(a,local);
 try{
  const response=await fetch('https://graphql.anilist.co',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:'query($id:Int){Media(idMal:$id,type:ANIME){relations{edges{relationType node{idMal type}}}}}',variables:{id:Number(a.ids?.mal||a.malId)}}),signal:AbortSignal.timeout(6000)});
  if(!response.ok)return rememberSeasons(a,local);const data=await response.json();
  const relatedMalIds=(data.data?.Media?.relations?.edges||[]).filter(e=>['PREQUEL','SEQUEL'].includes(e.relationType)&&e.node.type==='ANIME').map(e=>e.node.idMal).filter(Boolean);
  const full=await watchTitles([...items.map(x=>x.id),...await store.related(relatedMalIds)],a);
  return rememberSeasons(a,localSeasons(full,{...a,relatedMalIds}));
 }catch{return rememberSeasons(a,local);}
},{ttl:3600000,max:3});
export async function videoEpisode(a,index,refresh=false,audioId){
 const media=(await mediaCatalogue(a.id)).video(a.id,index,audioId);
 if(media.providerRef?.provider!=='kodik')return media;
 const config=globalThis.window?.YORU_CONFIG;if(!config?.supabaseUrl)throw Error('providerError');
 return refreshKodikMedia(media,config,a.id,index);
}
