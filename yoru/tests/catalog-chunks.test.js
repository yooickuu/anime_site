import test from 'node:test';import assert from 'node:assert/strict';
import {prepareChunks} from '../scripts/lib/catalog-chunks.mjs';
import {createCatalogueStore} from '../src/catalog-store.js';
const items=Array.from({length:721},(_,i)=>({id:'mal-'+(i+1),ids:{mal:i+1},title:'Title '+i,originalTitle:'作品 '+i,type:i%2?'MOVIE':'TV',genres:['Action'],year:2000+i%20,popularity:1000-i,episodes:999,episodeNumbers:[1,2],episodeManifest:[{ordinal:1,season:1,tracks:[{id:'kodik-1'}]}],description:'Full synopsis',translations:{en:['Title '+i,'Full English synopsis']},relatedMalIds:i===0?[721]:[]}));
function fixture(){
 const data=prepareChunks(items,{},'revision-1'),calls=[];const store=createCatalogueStore(data.bootstrap,{fetcher:async input=>{
  const u=new URL(input);calls.push(u.pathname);assert.equal(u.searchParams.get('v'),'revision-1');
  if(u.pathname.endsWith('/identities.json'))return Response.json(data.identities);
  const match=u.pathname.match(/browse\/([A-Za-z]+)-(\d+)\.json/);if(match)return Response.json(data.orders[match[1]].slice(Number(match[2])*120,(Number(match[2])+1)*120));
  const id=u.pathname.match(/cards\/(mal-\d+)\.json/)?.[1],card=data.cards.find(a=>a.id===id);return card?Response.json(card):new Response('',{status:404});
 }});return {data,calls,store};
}
test('boot parses 120 light records, never episode manifests, with no catalogue fetch on homepage',async()=>{
 const {data,calls,store}=fixture();assert.equal(data.bootstrap.items.length,120);
 assert.ok(data.bootstrap.items.every(a=>!a.episodeManifest&&!a.episodeNumbers&&a.description.length<=300));
 const result=await store.query({sort:'picked'});assert.equal(result.total,721);assert.equal(result.items.length,24);assert.deepEqual(calls,[]);
 assert.ok(data.cards.every(a=>!a.episodeManifest));assert.equal(data.cards[0].translations.en[1],'Full English synopsis');
 assert.deepEqual(data.cards[0].relatedCatalogIds,['mal-1','mal-721']);
});
test('late pages and global fuzzy search include titles outside boot while chunk cache stays bounded',async()=>{
 const {store,calls}=fixture();const page=await store.query({page:6,sort:'picked'});assert.equal(page.items[0].id,'mal-121');assert.equal(calls.length,1);
 const result=await store.query({query:'Title 720',type:'TV'});assert.equal(result.items[0].id,'mal-721');assert.ok(store.cacheSize().chunks<=4);
 const movie=await store.query({type:'MOVIE',sort:'hiddenGems'});assert.equal(movie.total,360);assert.equal(movie.items[0].id,'mal-720');assert.ok(store.cacheSize().chunks<=4);
});
test('individual title and identities load on demand; foreign URLs and unknown ids never gain admission',async()=>{
 const {store,calls}=fixture();assert.equal(store.isPublished('mal-721'),false);
 assert.equal((await store.card('mal-721')).id,'mal-721');assert.equal(store.isPublished('mal-721'),true);assert.equal(calls.length,1);
 assert.deepEqual(await store.related([721]),['mal-721']);assert.equal(await store.card('https://evil.test'),null);assert.equal(await store.card('mal-9999'),null);assert.equal(store.isPublished('mal-9999'),false);
 for(let i=1;i<40;i++)await store.card('mal-'+i);assert.equal(store.cacheSize().cards,24);
});
test('obsolete search stops between chunks instead of loading the rest in the background',async()=>{
 const {store,calls}=fixture();let checks=0;await assert.rejects(store.query({query:'Title'},{current:()=>++checks<3}),/staleCatalogue/);assert.equal(calls.length,2);
});
