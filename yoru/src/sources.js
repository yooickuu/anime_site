import {requestCache} from './request-cache.js';
import {animeGoReady,goIndex,goCatalogue,matchGo,normalizeGo,attachGoRelease,goEpisode} from './animego.js';
export {prepareGoVoices as prepareEpisodeAudio} from './animego.js';
import {episodeManifest} from './episode-manifest.js';
import {fetchCatalogue,fetchRelease} from './provider.js';
import {fetchKitsuCatalogue,fetchKitsuRelease} from './kitsu.js';
import {fetchVostCatalogue,vostIndex,normalizeVost,fetchVostRelease,vostEpisode,cleanTitle,animeType} from './animevost.js';
import {identityIndex,exactIdentity,identityKeys} from './catalog-match.js';
import {providerEpisode} from './provider.js';
import {registerAnime,byId} from './catalog.js';
let indexPromise=null,allLiberty=[];
async function sourceIndex(){
  if(!indexPromise)indexPromise=fetch('data/liberty-index.json').then(r=>{if(!r.ok)throw Error();return r.json();}).then(d=>{allLiberty=d.items;return new Map(d.items.filter(a=>a.malId).map(a=>[Number(a.malId),a]));}).catch(()=>{indexPromise=null;return new Map();});
  return indexPromise;
}
export function mergeCatalogues(liberty,kitsu,knownLiberty=new Map()){
  const map=new Map(),identities=new Map();
  const identity=a=>({...a,names:[...(a.names||[]),...Object.values(a.translations||{}).map(x=>x[0])]});
  const sourceKeys=['providerId','animeVostId','animeGoId'];
  for(const [items,additional] of [[liberty,false],[kitsu,true]])for(const a of items){
    if(additional&&a.malId&&knownLiberty.has(a.malId))continue;
    const candidate=exactIdentity(identity(a),identities);
    const match=map.get(a.id)||(candidate&&map.get(candidate.id));
    // Conflicting release IDs must never silently merge separate seasons or editions.
    const conflict=match&&((a.malId&&match.malId&&a.malId!==match.malId)||sourceKeys.some(k=>a[k]&&match[k]&&a[k]!==match[k]));
    if(match&&!conflict){
      const linked={...match};
      for(const key of sourceKeys)if(!linked[key]&&a[key])linked[key]=a[key];
      map.set(match.id,linked);
    }else if(!map.has(a.id))map.set(a.id,a);
    const target=match&&!conflict?match.id:a.id;
    for(const key of identityKeys(identity(a))){
      const entries=identities.get(key)||[];
      if(!entries.some(x=>x.id===target))entries.push({id:target});
      identities.set(key,entries);
    }
  }
  return [...map.values()];
}
export function discoveryOptions(options) {
 const view=options.view;
 return {...options,
   sort:view==='popular'||view==='topRated'?view:view==='hiddenGems'?'hiddenGems':options.sort,
   ongoing:view==='airingNow'||options.ongoing,
   type:view==='films'?'MOVIE':options.type};
}
export const combinedCatalogue=requestCache(loadCombinedCatalogue,{ttl:60000});
async function loadCombinedCatalogue(options){
  options=discoveryOptions(options);
  if(options.scope!=='watchable' && ['popular','topRated','airingNow','films'].includes(options.view)){
    const result=await fetchKitsuCatalogue(options),known=await sourceIndex();
    result.items=result.items.map(a=>{const linked=known.get(a.malId);return linked?registerAnime({...a,providerId:linked.id,catalogOnly:false}):a;});
    return {...result,partial:false};
  }
  const tasks=[fetchCatalogue(options),fetchVostCatalogue(options),options.scope==='watchable'?Promise.resolve(null):fetchKitsuCatalogue(options),goCatalogue(options)];
  const results=await Promise.allSettled(tasks);
  if(results.every(r=>r.status==='rejected'))throw results[0].reason;
  let [l,v,k,g]=results.map(r=>r.status==='fulfilled'?r.value:{items:[],total:0,pages:1});
  if(results[0].status==='rejected'&&results[1].status==='fulfilled')v=await fetchVostCatalogue({...options,includeLinked:true});
  const av=await vostIndex().catch(()=>[]);
  const avIdentities=identityIndex(av.map(a=>({...a,names:cleanTitle(a.title).split(/\s+\/\s+/),type:animeType(a.type)})));
  const libItems=l.items.map(a=>{const match=av.find(v=>v.libertyId===a.providerId);return match?registerAnime({...a,animeVostId:match.id}):a;});
  const filtered=!!options.query?.trim()||!!options.ongoing||(options.genre&&options.genre!=='all')||(options.type&&options.type!=='all');
  const known=results[0].status==='rejected'||filtered?new Map():await sourceIndex();
  const extra=(k?.items||[]).flatMap(a=>{
    const match=exactIdentity({names:[a.title,...Object.values(a.translations||{}).map(x=>x[0])],year:a.year,type:a.type},avIdentities);
    if(!match)return [a];
    // A provider variant has one canonical card throughout the catalogue.
    return filtered?[normalizeVost(match)]:[];
  });
  const goItems=await animeGoReady()?await goIndex().catch(()=>[]):[];
  const linkedExtras=extra.map(a=>{const match=matchGo(a,goItems);return match?normalizeGo({...match,...(a.malId?{malId:a.malId}: {})}):a;});
  const items=mergeCatalogues([...libItems,...v.items,...g.items],linkedExtras,known).map(registerAnime);
  return {items,total:null,pages:Math.max(l.pages,v.pages,k?.pages||1,g.pages||1),totals:{...(results[0].status==='fulfilled'?{AniLiberty:l.total}:{}),...(results[1].status==='fulfilled'?{AnimeVost:v.total}:{}),...(k&&results[2]?.status==='fulfilled'?{Kitsu:k.total}:{}),...(g.total?{AnimeGO:g.total}:{})},partial:results.some(r=>r.status==='rejected')};
}
export const resolveRelease=requestCache(loadRelease,{ttl:60000,key:a=>[a.id,a.providerId,a.animeVostId,a.animeGoId].join(':')});
async function loadRelease(a){let base;try{base=await baseRelease(a);}catch(error){const recovered=await attachGoRelease(a).catch(()=>null);if(recovered?.episodeManifest?.some(e=>e.sources.go!==undefined))return recovered;throw error;}return attachGoRelease(base).catch(()=>base);}
async function baseRelease(a){
  if(a.providerId){
    registerAnime(a);
    const av=await vostIndex().catch(()=>[]),match=av.find(v=>a.animeVostId?v.id===a.animeVostId:v.libertyId===a.providerId);
    if(!match)return fetchRelease(a.id);
    const [lib,vost]=await Promise.allSettled([fetchRelease(a.id),fetchVostRelease({...a,animeVostId:match.id})]);
    if(lib.status==='rejected'&&vost.status==='rejected')throw lib.reason;
    const loaded=lib.status==='fulfilled'?lib.value:a;
    const manifest=episodeManifest(lib.status==='fulfilled'&&!loaded.blocked?(loaded.episodeNumbers||[]):[],vost.status==='fulfilled'?vost.value.episodeNumbers:[],loaded.announcedEpisodes);
    return registerAnime({...loaded,animeVostId:match.id,episodeManifest:manifest,
      episodeNumbers:manifest.map(e=>e.ordinal),episodes:manifest.length,
      catalogOnly:false,blocked:manifest.length?false:loaded.blocked});
  }
  if(a.animeVostId)return fetchVostRelease(a);
  const index=await sourceIndex(),match=index.get(a.malId);
  if(match){
    const linked=registerAnime({...a,providerId:match.id,catalogOnly:false});
    return baseRelease(linked);
  }
  // Index may be older than a new release: search by canonical title, then require exact ID.
  if(a.malId){
    try{
      const result=await fetchCatalogue({query:a.title});
      const exact=result.items.find(v=>v.malId===a.malId);
      if(exact)return baseRelease(exact);
    }catch{}
  }
  const av=await vostIndex().catch(()=>[]);
  const matches=identityIndex(av.map(v=>({...v,names:cleanTitle(v.title).split(/\s+\/\s+/),type:animeType(v.type)})));
  const found=exactIdentity({names:[a.title,...Object.values(a.translations||{}).map(x=>x[0])],year:a.year,type:a.type},matches);
  if(found)return fetchVostRelease({...a,animeVostId:found.id,catalogOnly:false});
  return a.kitsuId?fetchKitsuRelease(a):a;
}

export async function videoEpisode(a,index,refresh=false,audio=''){
 if(audio.startsWith('go-')&&a.animeGoId)return goEpisode(a,index,audio,refresh);
 const vost=audio==='vost'||(!audio&&(!a.providerId||a.videoProvider==='AnimeVost'));
 if(vost&&a.animeVostId)return vostEpisode(a,index,refresh,a.episodeManifest?.[index-1]?.sources.vost??a.episodeNumbers?.[index-1]??null);
 if(a.providerId)return providerEpisode(a.id,index,refresh,a.episodeManifest?.[index-1]?.sources.liberty??a.episodeNumbers?.[index-1]??null);
 return null;
}

export async function discoveryIndex(){
 const [lib,av]=await Promise.all([sourceIndex(),vostIndex().catch(()=>[])]);
 const liberty=allLiberty.map(x=>({id:x.malId?'mal-'+x.malId:'lib-'+x.id,malId:x.malId,providerId:x.id,title:x.title,year:x.year,type:x.type}));
 const extra=av.filter(x=>!x.libertyId).map(x=>normalizeVost(x));
 const go=await animeGoReady()?await goIndex().catch(()=>[]):[];
 return mergeCatalogues([...liberty,...extra,...go.filter(x=>x.hasKodik&&x.completeAudio&&!x.canonicalId).map(normalizeGo)],[]);
}
export async function findWatchRelease(id){
 const cached=byId(id);if(cached)return cached;
 if(/^lib-\d+$/.test(id))return fetchRelease(id);
 if(/^go-\d+$/.test(id)){const a=(await goIndex()).find(x=>x.id===Number(id.slice(3)));return a?normalizeGo(a):null;}
 if(/^kitsu-\d+$/.test(id))return fetchKitsuRelease({kitsuId:id.slice(6)});
 const pool=await discoveryIndex();const a=pool.find(x=>x.id===id);
 return a?registerAnime(a):null;
}
