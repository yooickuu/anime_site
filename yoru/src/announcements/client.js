import {aniListPage,shikiPage} from './api.js';
import {mergeAnnouncements,identityMatcher,reconcile} from './model.js';
const TTL=12*3600000,version=typeof __ANNOUNCEMENT_REVISION__==='undefined'?'dev':__ANNOUNCEMENT_REVISION__;
export function createAnnouncements({fetcher=fetch,storage=()=>globalThis.localStorage,now=Date.now}={}){
 let memory,pending;const searches=new Map();
 const key='yomiku.announcements.v1';
 function read(){try{const d=JSON.parse(storage().getItem(key));return d?.version===version&&Array.isArray(d.items)&&d.items.length<=600&&d.items.every(a=>/^(mal|anilist)-\d+$/.test(a.id)&&a.catalogOnly===true)?d:null;}catch{return null;}}
 async function feed(){
  if(memory?.until>now())return memory.items;if(pending)return pending;const saved=read();if(saved?.until>now()){memory=saved;return saved.items;}
  pending=(async()=>{try{const r=await fetcher(new URL('data/announcements.json',globalThis.document?.baseURI||'https://yomiku.site/'),{cache:'no-cache',signal:AbortSignal.timeout(6000)});if(!r.ok)throw Error();const d=await r.json();if(!Array.isArray(d.items)||d.items.length>600||d.items.some(a=>!a?.id||!a.title||!Array.isArray(a.genres)||a.catalogOnly!==true))throw Error();memory={version,until:now()+TTL,items:d.items,aliases:d.aliases||{}};}
   catch{let fallback;try{fallback=(await aniListPage(1,'',fetcher)).items;}catch{}memory={version,until:now()+60000,items:fallback||saved?.items||[]};}
   try{storage().setItem(key,JSON.stringify(memory));}catch{}return memory.items;})().finally(()=>{pending=null;});return pending;
 }
 async function search(text){
  const query=text.trim().slice(0,120);if(query.length<2)return [];const cached=searches.get(query);if(cached?.until>now())return cached.promise;
  const promise=(async()=>{try{const rows=(await shikiPage(1,query,fetcher)).items;if(rows.length)return rows;}catch{}try{return (await aniListPage(1,query,fetcher)).items;}catch{return [];}})();
  searches.set(query,{until:now()+60000,promise});while(searches.size>12)searches.delete(searches.keys().next().value);return promise;
 }
 async function items(query=''){const base=await feed();if(!query.trim())return base;return mergeAnnouncements(base,await search(query));}
 return {items,feed,find:async id=>{const items=await feed();const canonical=memory?.aliases?.[id];return items.find(a=>a.id===(canonical||id))||(canonical?{publishedId:canonical}:null);}};
}
const client=createAnnouncements();
export const announcementItems=client.items,announcementById=client.find;
export {reconcile,identityMatcher};
