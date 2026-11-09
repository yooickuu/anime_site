import {recentReleases} from './recent-releases.js';
import {queryCatalogue} from './catalog-query.js';
// Bounded display caches plus an on-demand text-only search index; no media manifests.
export function createCatalogueStore(bootstrap,{fetcher=(...args)=>fetch(...args),base=()=>globalThis.document?.baseURI||'https://yomiku.site/'}={}){
 const chunks=new Map(),cards=new Map(),pending=new Map(),admitted=new Set(bootstrap.items.map(a=>a.id));
 const valid=id=>/^(mal|shikimori|lib)-\d+$/.test(id);
 async function read(path){const url=new URL('data/catalog/'+path,base());url.searchParams.set('v',bootstrap.revision);const r=await fetcher(url,{signal:AbortSignal.timeout(15000)});if(r.status===404)return null;if(!r.ok)throw Error('providerError');return r.json();}
 function cached(map,key,max,load){
  if(map.has(key)){const value=map.get(key);map.delete(key);map.set(key,value);return Promise.resolve(value);}
  if(pending.has(key))return pending.get(key);
  const p=Promise.resolve().then(load).then(value=>{map.set(key,value);while(map.size>max)map.delete(map.keys().next().value);return value;}).finally(()=>pending.delete(key));pending.set(key,p);return p;
 }
 async function chunk(sort,index){
  if(!['picked','hiddenGems','latest','topRated','newest','oldest','alphabetical'].includes(sort))sort='picked';
  return cached(chunks,`browse/${sort}-${index}.json`,4,async()=>{const rows=await read(`browse/${sort}-${index}.json`);if(!Array.isArray(rows)||rows.length>bootstrap.chunkSize)throw Error('invalid_manifest');return rows;});
 }
 async function card(id){if(!valid(id))return null;return cached(cards,`cards/${id}.json`,24,async()=>{const a=await read(`cards/${id}.json`);if(!a)return null;if(a.id!==id||!a.catalogApproved||a.episodeManifest)throw Error('invalid_manifest');admitted.add(id);return a;});}
 let searchPromise;
 async function searchIndex(){
  searchPromise??=read('search.json').then(rows=>{if(!Array.isArray(rows)||rows.length!==bootstrap.total||rows.some(a=>!valid(a.id)||a.episodeManifest))throw Error('invalid_manifest');return rows;}).catch(error=>{searchPromise=null;throw error;});
  return searchPromise;
 }
 async function displayRows(rows,current){
  const result=new Array(rows.length);let next=0;
  await Promise.all(Array.from({length:Math.min(4,rows.length)},async()=>{while(next<rows.length){if(!current())throw Error('staleCatalogue');const i=next++;result[i]=await card(rows[i].id);}}));
  return result.filter(Boolean);
 }
 function remember(rows){for(const a of rows)admitted.add(a.id);return rows;}
 async function query(options={}, {current=()=>true}={}){
  const page=Math.max(1,Number(options.page)||1),limit=Math.min(24,Number(options.limit)||24),offset=(page-1)*limit;
  const filtered=!!(options.query?.trim()||(options.genre&&options.genre!=='all')||(options.type&&options.type!=='all')||(options.year&&options.year!=='all')||Number(options.minRating)||options.ongoing||(options.maxRating!==undefined&&Number(options.maxRating)<10)||(options.status&&options.status!=='all'));
  let rows=[],total=bootstrap.total;
  if(!filtered){
   const sort=options.sort||'picked';
   if(sort==='picked'&&offset+limit<=bootstrap.items.length)rows=bootstrap.items.slice(offset,offset+limit);
   else if(offset<total){const first=Math.floor(offset/bootstrap.chunkSize),last=Math.floor(Math.min(total-1,offset+limit-1)/bootstrap.chunkSize);let loaded=[];for(let i=first;i<=last;i++){if(!current())throw Error('staleCatalogue');loaded.push(...await chunk(sort,i));}rows=loaded.slice(offset%bootstrap.chunkSize,offset%bootstrap.chunkSize+limit);}
  }else if(bootstrap.searchIndex){
   if(!current())throw Error('staleCatalogue');
   const index=await searchIndex();let best=[];total=0;
   for(let i=0;i<index.length;i+=250){
    if(!current())throw Error('staleCatalogue');
    const matches=queryCatalogue(index.slice(i,i+250),options);total+=matches.length;
    best=queryCatalogue([...best,...matches],options).slice(0,offset+limit);
    await new Promise(resolve=>setTimeout(resolve,0));
   }
   rows=await displayRows(best.slice(offset,offset+limit),current);
  }else{
   total=0;let best=[];
   for(let i=0;i<bootstrap.chunks;i++){
    if(!current())throw Error('staleCatalogue');
    const matches=queryCatalogue(await chunk('picked',i),options);total+=matches.length;
    best=queryCatalogue([...best,...matches],options).slice(0,offset+limit);
    // Yield between small JSON parses, keeping taps and scrolling responsive.
    await new Promise(resolve=>setTimeout(resolve,0));
   }
   rows=best.slice(offset,offset+limit);
  }
  if(!current())throw Error('staleCatalogue');
  return {items:remember(rows),total,pages:Math.max(1,Math.ceil(total/limit)),partial:false};
 }
 async function random(){if(!bootstrap.chunks)return [];return remember(await chunk('picked',Math.floor(Math.random()*bootstrap.chunks)));}
 let identityPromise;
 async function related(ids){identityPromise??=read('identities.json').catch(e=>{identityPromise=null;throw e;});const identities=await identityPromise;return [...new Set(ids.map(id=>identities?.[id]).filter(Boolean))];}
 async function recent(){const rows=await cached(chunks,'recent.json',4,()=>read('recent.json'));if(!Array.isArray(rows)||rows.length>120)throw Error('invalid_manifest');return remember(recentReleases(rows));}
 return {query,card,random,related,recent,isPublished:id=>admitted.has(id),cacheSize:()=>({chunks:chunks.size,cards:cards.size})};
}
