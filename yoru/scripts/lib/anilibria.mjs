import {mapLimit} from './concurrency.mjs';
import {probeImage,probeStream,retryMedia} from './media-probe.mjs';
import {identityKeys,auditAdmission} from '../../src/catalog-admission.js';
import {identityTitle} from '../../src/catalog-match.js';
import {normalizeType,normalizeGenre} from '../../src/catalog-query.js';
import {metadataFromAniList,cleanSynopsis} from '../../src/catalog-metadata.js';

export const ANILIBRIA_ORIGIN='https://anilibria.top';
const positive=n=>Number.isSafeInteger(Number(n))&&Number(n)>0?Number(n):null;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export class AniLibriaAPI{
 constructor({fetcher=fetch,wait=delay}={}){this.fetcher=fetcher;this.wait=wait;}
 async request(path,params={}){
  const url=new URL('/api/v1/anime/'+path,ANILIBRIA_ORIGIN);url.search=new URLSearchParams(params);
  for(let attempt=0;attempt<3;attempt++){
   try{
    const response=await this.fetcher(url,{headers:{Accept:'application/json','User-Agent':'yomiku/1.0 (+https://yomiku.site/)'},signal:AbortSignal.timeout(20000)});
    if(!response.ok){await response.body?.cancel();throw Error(`anilibria_http_${response.status}`);}
    return await response.json();
   }catch(error){if(attempt===2||/http_4(?!29)/.test(error.message))throw error;await this.wait(750*(attempt+1));}
  }
 }
 async page(page){const data=await this.request('catalog/releases',{page,limit:50,sort_by:'FRESH_AT_DESC'});if(!Array.isArray(data?.data))throw Error('invalid_anilibria_page');return data;}
 async release(id){if(!positive(id))throw Error('invalid_anilibria_id');const data=await this.request('releases/'+id);if(Number(data?.id)!==Number(id)||!Array.isArray(data.episodes))throw Error('invalid_anilibria_release');return data;}
}
export function releaseIdentity(r){return {ids:{anilibria:positive(r.id),mal:positive(r.mal?.id),shikimori:positive(r.shikimori?.id),anilist:positive(r.anilist?.id)},title:r.name?.main||'',originalTitle:r.name?.english||'',names:[r.name?.alternative].filter(Boolean),year:Number(r.year),type:normalizeType(r.type)};}
function titleKeys(item){return [...new Set([item.title,item.originalTitle,item.english,...(item.names||[]),...Object.values(item.translations||{}).map(t=>t?.[0])].filter(Boolean).map(identityTitle))].filter(t=>t&&item.year&&item.type).map(t=>`${t}|${Number(item.year)}|${normalizeType(item.type)}`);}
function compatible(a,b){return ['mal','shikimori','anilist','anilibria'].every(k=>!a.ids?.[k]||!b.ids?.[k]||String(a.ids[k])===String(b.ids[k]));}
export function identityLookup(items){
 const ids=new Map(),names=new Map();
 const add=item=>{for(const [map,keys]of [[ids,identityKeys(item)],[names,titleKeys(item)]])for(const k of keys){if(!map.has(k))map.set(k,new Map());map.get(k).set(item.id,item);}};
 items.forEach(add);
 return {add,find(candidate){
  const byId=new Map();for(const key of identityKeys(candidate))for(const item of ids.get(key)?.values()||[])byId.set(item.id,item);
  if(byId.size>1)throw Error('conflicting_catalogue_identity');
  if(byId.size){const item=[...byId.values()][0];if(!compatible(item,candidate))throw Error('conflicting_catalogue_identity');return item;}
  const byTitle=new Map();for(const key of titleKeys(candidate))for(const item of names.get(key)?.values()||[])byTitle.set(item.id,item);
  // Same complete title/year/type but conflicting IDs is unresolved, never a second card.
  if(byTitle.size>1)throw Error('ambiguous_title_identity');
  if(byTitle.size){const item=[...byTitle.values()][0];if(!compatible(item,candidate))throw Error('conflicting_title_identity');return item;}
  return null;
 }};
}
function mediaURL(value){if(!value)return null;try{const u=new URL(value,ANILIBRIA_ORIGIN);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch{return null;}}
export function releaseEpisodes(release){
 if(release.is_blocked_by_geo||release.is_blocked_by_copyrights)throw Error('anilibria_release_blocked');
 const episodes=release.episodes;if(!Array.isArray(episodes)||!episodes.length)throw Error('no_released_episodes');
 const seen=new Set(),links=new Set(),rows=[];
 for(const ep of episodes){const ordinal=Number(ep.ordinal);if(!Number.isFinite(ordinal)||ordinal<=0||seen.has(ordinal))throw Error('invalid_or_duplicate_episode');seen.add(ordinal);
  const sources=[];for(const quality of [1080,720,480,360])for(const format of ['hls','mp4']){const url=mediaURL(ep[`${format}_${quality}`]);if(url)sources.push({quality,url,stream:format==='hls'});}
  if(!sources.length)throw Error(`episode_without_stream_${ordinal}`);
  for(const source of sources){if(links.has(source.url))throw Error('duplicate_episode_stream');links.add(source.url);}
  rows.push({ordinal,sources,episode:ep});
 }
 rows.sort((a,b)=>a.ordinal-b.ordinal);
 // A list with a missing middle episode must never look like a complete release.
 const integers=rows.filter(e=>Number.isInteger(e.ordinal));
 if(integers.some((e,i)=>e.ordinal!==i+1))throw Error('incomplete_episode_sequence');
 const total=positive(release.episodes_total);
 if(!release.is_ongoing&&!release.is_in_production&&total&&integers.length<total)throw Error(`incomplete_release_${integers.length}_of_${total}`);
 return rows;
}
async function probeMP4(source,duration){
 if(!(duration>0))throw Error('mp4_duration_missing');
 const origin=process.env.SITE_ORIGIN||'https://yomiku.site';
 const r=await fetch(source.url,{headers:{Origin:origin,Referer:origin+'/',Range:'bytes=0-1023'},signal:AbortSignal.timeout(18000)});
 if(!r.ok){await r.body?.cancel();throw Error(`media_http_${r.status}`);}
 const cors=r.headers.get('access-control-allow-origin');
 if(cors!=='*'&&cors!==origin){await r.body?.cancel();throw Error('media_cors_unavailable');}
 const reader=r.body.getReader();let data;try{data=(await reader.read()).value;}finally{await reader.cancel();}
 if(!data||!Buffer.from(data).subarray(0,64).includes(Buffer.from('ftyp')))throw Error('invalid_mp4');
 return [{...source,duration,checkedAt:new Date().toISOString()}];
}
export async function checkAniLibriaStream(source,duration){return source.stream?probeStream(source):retryMedia(()=>probeMP4(source,duration));}
function skip(mark,duration){const start=mark?.start,end=mark?.stop;return Number.isFinite(start)&&Number.isFinite(end)&&start>=0&&end>start&&end<=duration?{start,end}:null;}
export async function assembleAniLibria(release,{existing=null,getMetadata=async()=>[null,null],imageProbe=probeImage,streamProbe=checkAniLibriaStream}={}){
 const identity=releaseIdentity(release);if(!identity.ids.anilibria||!identity.title)throw Error('release_identity_missing');
 const rows=releaseEpisodes(release);
 const [sh,al]=existing?[null,null]:await getMetadata(identity.ids);
 for(const [key,value]of Object.entries({mal:positive(sh?.malId||al?.idMal),anilist:positive(al?.id)})){if(identity.ids[key]&&value&&identity.ids[key]!==value)throw Error('metadata_identity_conflict');if(value)identity.ids[key]=value;}
 const episodes=await mapLimit(rows,2,async({ordinal,sources,episode:ep})=>{
  const failures=[];
  const verified=await mapLimit(sources,1,async source=>{try{return await streamProbe(source,Number(ep.duration));}catch(error){failures.push(`${source.quality}:${String(error.message).replace(/https?:\/\/\S+/g,'[url]').slice(0,100)}`);return [];}});
  const valid=[];let duration=0;
  for(const source of verified.flat())if([360,480,720,1080].includes(source.quality)&&mediaURL(source.url)&&Number.isFinite(source.duration)&&source.duration>0&&!valid.some(s=>s.quality===source.quality)){
   duration=Math.max(duration,source.duration);valid.push({quality:source.quality,url:source.url,stream:source.stream!==false,checkedAt:source.checkedAt});
  }
  if(!valid.length)throw Error(`no_working_stream_episode_${ordinal} (${failures.join('; ')})`);
  if(identity.type==='SPECIAL'&&duration<180&&!cleanSynopsis(sh?.description||existing?.description))throw Error('short_special_without_description');
  return {number:ordinal,ordinal,season:1,audio:[{id:'anilibria',dubId:'AniLibria',label:'AniLibria · русская',language:'ru',original:false,duration,sources:valid,subtitles:[],opening:skip(ep.opening,duration),ending:skip(ep.ending,duration)}]};
 });
 let artwork=existing?.artwork;
 if(!artwork){
  let poster,backdrop;
  for(const url of [mediaURL(release.poster?.src),sh?.poster?.originalUrl,al?.coverImage?.extraLarge].filter(Boolean))try{const img=await imageProbe(url);if(img.width>=200&&img.height>=300){poster=img;break;}}catch{}
  if(!poster)throw Error('broken_poster');
  const covers=(release.background_covers||[]).flatMap(c=>[c.src,c.preview?.src,c.preview,c.optimized?.src]).filter(v=>typeof v==='string');
  for(const url of [al?.bannerImage,...covers.map(mediaURL),...rows.slice(0,2).map(r=>mediaURL(r.episode.preview?.src)),poster.url].filter(Boolean))try{const img=url===poster.url?poster:await imageProbe(url);if(img.width>=400&&img.height>=200){backdrop=img;break;}}catch{}
  if(!backdrop)throw Error('broken_backdrop');artwork={poster,backdrop};
 }
 const id=identity.ids.mal?`mal-${identity.ids.mal}`:identity.ids.shikimori?`shikimori-${identity.ids.shikimori}`:`lib-${identity.ids.anilibria}`;
 const item={...metadataFromAniList(al),...identity,id,title:sh?.russian||identity.title,originalTitle:sh?.name||identity.originalTitle,alt:[identity.originalTitle,...identity.names,al?.title?.native,al?.title?.english].filter(Boolean).join(' '),description:cleanSynopsis(sh?.description||release.description||al?.description),genres:(sh?.genres?.map(g=>g.russian||g.name)||release.genres?.map(g=>g.name)||[]).map(normalizeGenre),rating:Number(sh?.score||release.shikimori?.rating||release.mal?.rating)||null,popularity:al?.popularity||0,ongoing:release.is_ongoing===true,artwork,releasedEpisodes:episodes.map(e=>e.number),episodes,anilibriaRevision:release.updated_at||release.fresh_at||null,anilibriaCheckedAt:new Date().toISOString()};
 const check=auditAdmission(item,{strict:false});if(!check.passed)throw Error('anilibria_validation_'+check.issues.map(i=>i.code).join(','));return item;
}
export function mergeAniLibria(existing,incoming){
 if(!existing)return incoming;
 if(!compatible(existing,incoming))throw Error('conflicting_catalogue_identity');
 const result=structuredClone(existing),seasons=new Set(result.episodes.map(e=>e.season??1).filter(s=>s>0));
 const targetSeason=seasons.size===1?[...seasons][0]:null;
 for(const e of incoming.episodes){
  const candidates=result.episodes.filter(p=>(p.season??1)>0&&(p.ordinal??p.number)===e.ordinal);
  const linked=candidates.filter(p=>p.audio.some(t=>t.id==='anilibria'));
  const matches=linked.length?linked:candidates;
  if(matches.length>1||!matches.length&&targetSeason===null)throw Error('ambiguous_episode_mapping');
  const prior=matches[0];if(prior){const index=prior.audio.findIndex(t=>t.id==='anilibria');if(index>=0)prior.audio[index]=structuredClone(e.audio[0]);else prior.audio.push(structuredClone(e.audio[0]));}
  else{if(result.episodes.some(p=>p.number===e.ordinal))throw Error('episode_number_conflict');result.episodes.push({...structuredClone(e),season:targetSeason});}
 }
 result.ids={...result.ids,...Object.fromEntries(Object.entries(incoming.ids).filter(([,v])=>v!=null))};
 result.episodes.sort((a,b)=>a.number-b.number);result.releasedEpisodes=result.episodes.map(e=>e.number);
 result.anilibriaRevision=incoming.anilibriaRevision;result.anilibriaCheckedAt=incoming.anilibriaCheckedAt;
 // Existing ID, artwork, metadata, Kodik tracks and list references are untouched.
 if(!result.kodikIds?.length)result.ongoing=incoming.ongoing;
 const check=auditAdmission(result,{strict:false});if(!check.passed)throw Error('merged_catalogue_validation_failed');return result;
}

export async function refreshAniLibria(item,api,{assemble=assembleAniLibria}={}){
 const release=await api.release(item.ids.anilibria);
 if(!compatible(item,releaseIdentity(release)))throw Error('anilibria_identity_changed');
 const revision=release.updated_at||release.fresh_at||null;
 if(revision&&item.anilibriaRevision===revision&&Date.now()-Date.parse(item.anilibriaCheckedAt)<86400000)return item;
 return mergeAniLibria(item,await assemble(release,{existing:item}));
}
