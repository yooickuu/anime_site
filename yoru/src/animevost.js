import {registerAnime,byId} from './catalog.js';
export const VOST_API='https://api.animevost.org/v1';
let indexPromise;const playlists=new Map();
export function cleanTitle(value=''){return value.replace(/\s*\[[^\]]*\]/g,'').trim();}
export function titleKey(value=''){return cleanTitle(value).normalize('NFKC').toLocaleLowerCase().replace(/ё/g,'е').replace(/[\p{P}\p{S}\s]+/gu,' ').trim();}
export function animeType(value){return ({'ТВ':'TV','Фильм':'MOVIE','Полнометражный фильм':'MOVIE','OVA':'OVA','ONA':'ONA','Спешл':'SPECIAL','ТВ-спэшл':'SPECIAL','полнометражный фильм':'MOVIE','короткометражный фильм':'MOVIE','Короткометражный фильм':'MOVIE'})[value]||value||'TV';}
export function normalizeVost(a){
 const names=cleanTitle(a.title).split(/\s+\/\s+/),ru=names[0],en=names[1]||ru;
 const progress=a.title.match(/\[(?:1-)?(\d+)\s+из\s+(\d+)(\+?)/i);
 const ongoing=!!progress&&(Number(progress[1])<Number(progress[2])||!!progress[3]);
 const id=a.canonicalId||'vost-'+a.id,old=byId(id);
 const model={id,animeVostId:a.id,malId:a.malId||null,providerId:a.libertyId||null,title:ru,alt:en,year:Number(a.year)||'',type:animeType(a.type),episodes:a.episodes||0,announcedEpisodes:progress?Number(progress[2]):null,ongoing,
 genres:(a.genre||'').split(',').map(x=>x.trim()).filter(Boolean).map(x=>x[0].toUpperCase()+x.slice(1)),image:a.image||a.urlImagePreview||'',posterFallback:a.image||a.urlImagePreview||'',
 description:(a.description||'').replace(/<br\s*\/?>/gi,'\n').replace(/<[^>]*>/g,''),descriptionLanguage:'ru',translations:{en:[en,''],ja:[en,'']},provider:'AnimeVost',catalogOnly:false};
 // Preserve richer canonical metadata, with a second playable source on the same title.
 return registerAnime(old?.providerId?{...model,...old,animeVostId:a.id}:model);
}
export async function vostIndex(){
 if(!indexPromise)indexPromise=fetch('data/animevost-index.json').then(r=>{if(!r.ok)throw Error('providerError');return r.json();}).then(d=>{if(!Array.isArray(d.items))throw Error('providerError');return d.items;}).catch(e=>{indexPromise=null;throw e;});
 return indexPromise;
}
export function filterVost(items,{query='',genre='all',sort='picked',type='all',ongoing=false}={}){
 let result=items.filter(a=>!a.libertyId).map(a=>({raw:a,model:normalizeVost(a)}));const q=titleKey(query);
 result=result.filter(({model:a})=>(!q||titleKey(a.title+' '+a.alt).includes(q))&&(!ongoing||a.ongoing)&&(genre==='all'||a.genres.some(g=>titleKey(g)===titleKey(genre)))&&(type==='all'||(type==='series'?['TV','ONA','WEB'].includes(a.type):type.split(',').includes(a.type))));
 result.sort((a,b)=>sort==='newest'?b.model.year-a.model.year:sort==='oldest'?a.model.year-b.model.year:sort==='alphabetical'?a.model.title.localeCompare(b.model.title):sort==='latest'?b.raw.id-a.raw.id:sort==='hiddenGems'?a.raw.votes-b.raw.votes:b.raw.votes-a.raw.votes);
 return result.map(x=>x.model);
}
export async function fetchVostCatalogue(options={}){const items=filterVost(await vostIndex(),options),start=((options.page||1)-1)*24;return {items:items.slice(start,start+24),total:items.length,pages:Math.max(1,Math.ceil(items.length/24))};}
async function request(path,body){const r=await fetch(VOST_API+path,{...(body?{method:'POST',body:new URLSearchParams(body)}:{}),signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('providerError');return r.json();}
export async function vostPlaylist(id,refresh=false){let cache=playlists.get(id);if(refresh||!cache||Date.now()-cache.at>300000){const items=await request('/playlist',{id:String(id)});if(!Array.isArray(items))throw Error('providerError');cache={at:Date.now(),items:items.slice().sort((a,b)=>parseFloat(a.name)-parseFloat(b.name))};playlists.set(id,cache);}return cache.items;}
export function secureVostURL(value){try{const u=new URL(value);if(u.protocol==='http:'&&['video.animetop.info','media.animetop.info'].includes(u.hostname))u.protocol='https:';return u.protocol==='https:'?u.href:null;}catch{return null;}}
export async function fetchVostRelease(a){
 const list=await vostPlaylist(a.animeVostId);let description=a.description;
 if(!description){try{const d=await request('/search',{name:a.title});const exact=d.data?.find(x=>Number(x.id)===a.animeVostId);if(exact)description=exact.description.replace(/<br\s*\/?>/gi,'\n').replace(/<[^>]*>/g,'');}catch{}}
 return registerAnime({...a,description:description||'',episodes:list.length,catalogOnly:false});
}
export async function vostEpisode(a,episode,refresh=false,ordinal=null){const list=await vostPlaylist(a.animeVostId,refresh);const e=ordinal===null?list[episode-1]:list.find(item=>parseFloat(item.name)===Number(ordinal));if(!e)return null;const sources=[{quality:720,url:secureVostURL(e.hd)},{quality:480,url:secureVostURL(e.std)}].filter(x=>x.url);return {sources,url:sources[0]?.url,stream:false,opening:null,ending:null};}
