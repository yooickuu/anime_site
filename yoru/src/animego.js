import {requestCache} from './request-cache.js';
import {episodeManifest} from './episode-manifest.js';
import {registerAnime,byId} from './catalog.js';
import {identityIndex,exactIdentity,identityTitle} from './catalog-match.js';
let indexPromise,healthPromise,requestHandler;
export function configureAnimeGo(handler){requestHandler=handler;}
export async function animeGoReady(){
 const config=globalThis.window?.YORU_CONFIG;
 if(!config?.animeGo||!config.supabaseUrl)return false;
 if(!healthPromise)healthPromise=fetch(config.supabaseUrl+'/functions/v1/anime-source',{headers:{apikey:config.supabaseKey},signal:AbortSignal.timeout(5000)}).then(async r=>r.ok&&(await r.json()).ready===true).catch(()=>false);
 return healthPromise;
}
export async function goIndex(){if(!indexPromise)indexPromise=fetch('data/animego-index.json').then(r=>{if(!r.ok)throw Error('providerError');return r.json()}).then(d=>d.items.filter(x=>x.snapshotAt&&x.hasKodik!==false&&!x.ambiguous)).catch(e=>{indexPromise=null;throw e});return indexPromise;}
export function matchGo(a,items){const id=items.find(x=>x.canonicalId===a.id||x.id===a.animeGoId);if(id)return id;return exactIdentity({names:[a.title,a.alt,...Object.values(a.translations||{}).map(x=>x[0])],year:a.year,type:a.type},identityIndex(items.map(x=>({...x,names:[x.english]}))));}
export function normalizeGo(x){const id=x.canonicalId||'go-'+x.id,old=byId(id);return registerAnime({id,title:x.title,alt:x.english,year:x.year,type:x.type||'TV',image:x.image,posterFallback:x.image,genres:x.genres||[],description:x.description||'',descriptionLanguage:'ru',translations:{en:[x.english||x.title,''],ja:[x.english||x.title,'']},episodes:x.episodes||0,providerId:x.providerId||null,animeVostId:x.animeVostId||null,malId:x.malId||null,...old,animeGoId:x.id,catalogOnly:false,goVoices:x.voices||[]});}
export async function goCatalogue(options={}){if(!await animeGoReady())return {items:[],pages:1,total:0};let items=(await goIndex()).filter(x=>x.hasKodik&&x.completeAudio&&!x.canonicalId).map(normalizeGo);const q=identityTitle(options.query||'');items=items.filter(a=>(!q||identityTitle(a.title+' '+a.alt).includes(q))&&(!options.ongoing||a.ongoing)&&( !options.type||options.type==='all'||(options.type==='series'?['TV','ONA','WEB'].includes(a.type):options.type.split(',').includes(a.type)))&&(!options.genre||options.genre==='all'||a.genres.some(g=>identityTitle(g)===identityTitle(options.genre))));items.sort((a,b)=>options.sort==='oldest'?a.year-b.year:options.sort==='alphabetical'?a.title.localeCompare(b.title):b.year-a.year);const start=((options.page||1)-1)*24;return {items:items.slice(start,start+24),pages:Math.max(1,Math.ceil(items.length/24)),total:items.length};}
const snapshot=requestCache(async id=>{const r=await fetch('data/animego-episodes/'+Number(id)+'.json',{signal:AbortSignal.timeout(8000)});if(!r.ok)throw Error('providerError');const d=await r.json();if(d.id!==Number(id)||!Array.isArray(d.episodes)||d.episodes.length!==d.total)throw Error('providerError');return d;},{ttl:120000});
async function call(body){if(!requestHandler)throw Error('loginRequired');return requestHandler(body);}
export async function attachGoRelease(a){const match=matchGo(a,await goIndex());if(!match||!await animeGoReady())return a;const stored=await snapshot(match.id),data={episodes:stored.episodes,voices:stored.episodes[0]?.voices.map(({url,...v})=>v)||[]};const baseRows=a.episodeManifest||a.episodeNumbers?.map(ordinal=>({ordinal,audio:[a.providerId?'liberty':'vost'],sources:{[a.providerId?'liberty':'vost']:ordinal}}))||[];
 const rows=new Map(baseRows.map(e=>[e.ordinal,{...e,audio:[...e.audio],sources:{...e.sources}}]));
 const union=episodeManifest(baseRows.map(e=>e.ordinal),data.episodes.map(e=>e.ordinal),a.announcedEpisodes);
 for(const e of union){const row=rows.get(e.ordinal)||{ordinal:e.ordinal,audio:[],sources:{}};if(e.sources.vost!==undefined)row.sources.go=e.sources.vost;rows.set(e.ordinal,row);}
 const manifest=[...rows.values()].sort((a,b)=>a.ordinal-b.ordinal);
 return registerAnime({...a,animeGoId:match.id,episodeManifest:manifest,episodeNumbers:manifest.map(e=>e.ordinal),episodes:manifest.length,goVoices:data.voices,catalogOnly:false,blocked:manifest.length?false:a.blocked});
}
const voiceCache=new Map();
export async function prepareGoVoices(a,index){if(!a.animeGoId)return;const row=a.episodeManifest?.[index-1];if(row?.sources.go===undefined){a.currentGoVoices=[];return;}const key=a.animeGoId+':'+row.sources.go;let cached=voiceCache.get(key);if(!cached||Date.now()-cached.at>120000){cached={at:Date.now(),voices:((await snapshot(a.animeGoId)).episodes.find(e=>e.ordinal===row.sources.go)?.voices||[]).map(({url,...v})=>v)};voiceCache.set(key,cached);}a.currentGoVoices=cached.voices;a.goVoiceOrdinal=row.ordinal;}
const streamRequest=requestCache(body=>call(body),{ttl:30000,max:12});
export async function goEpisode(a,index,audio,refresh=false){const ordinal=a.episodeManifest?.[index-1]?.sources.go;if(ordinal===undefined)return null;const body={action:'video',id:a.animeGoId,ordinal,audio};if(refresh)streamRequest.clear();return streamRequest(body);}
