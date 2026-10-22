import {localSeasons} from './catalog-seasons.js';
import {queryCatalogue} from './catalog-query.js';
// Publication allowlist only. Legacy adapters are quarantined in legacy-sources.js.
import publication from './published-catalog.json' with {type:'json'};
import {createApprovedCatalogue} from './approved-catalog.js';
import {registerAnime} from './catalog.js';
import {requestCache} from './request-cache.js';
const approved=createApprovedCatalogue(publication);
export const publishedItems=approved.items;
export const isPublished=id=>publishedItems.some(a=>a.id===id);
export const combinedCatalogue=requestCache(async(options={})=>{
 const items=queryCatalogue(publishedItems,options);
 const total=items.length,page=Math.max(1,Number(options.page)||1);
 return {items:items.slice((page-1)*24,page*24).map(registerAnime),total,pages:Math.max(1,Math.ceil(total/24)),partial:false};
});
export const resolveRelease=requestCache(async a=>{const found=publishedItems.find(x=>x.id===a.id);if(!found)throw Error('notAdmitted');return registerAnime(found);});
export async function findWatchRelease(id){return publishedItems.find(a=>a.id===id)||null;}
export async function discoveryIndex(){return publishedItems;}
export async function prepareEpisodeAudio(){}
export const releaseSeasons=requestCache(async a=>{
 const local=localSeasons(publishedItems,a);if(local.length>1||!(a.ids?.mal||a.malId))return local;
 try{
  const response=await fetch('https://graphql.anilist.co',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:'query($id:Int){Media(idMal:$id,type:ANIME){relations{edges{relationType node{idMal type}}}}}',variables:{id:Number(a.ids?.mal||a.malId)}}),signal:AbortSignal.timeout(6000)});
  if(!response.ok)return local;const data=await response.json();const relatedMalIds=(data.data?.Media?.relations?.edges||[]).filter(e=>['PREQUEL','SEQUEL'].includes(e.relationType)&&e.node.type==='ANIME').map(e=>e.node.idMal).filter(Boolean);
  return localSeasons(publishedItems,{...a,relatedMalIds});
 }catch{return local;}
},{ttl:3600000});
export async function videoEpisode(a,index,_refresh=false,audioId){
 const media=approved.video(a.id,index,audioId);
 if(media.providerRef?.provider!=='kodik')return media;
 const config=globalThis.window?.YORU_CONFIG;
 if(!config?.supabaseUrl)throw Error('providerError');
 const response=await fetch(config.supabaseUrl+'/functions/v1/anime-source',{method:'POST',headers:{'Content-Type':'application/json',apikey:config.supabaseKey},body:JSON.stringify({action:'kodik-video',id:a.id,episode:index,audio:media.audioId}),signal:AbortSignal.timeout(18000)});
 if(!response.ok)throw Error('providerError');const fresh=await response.json();
 if(fresh.audioId!==media.audioId||!fresh.sources?.length)throw Error('audioUnavailable');
 return {...media,...fresh};
}
