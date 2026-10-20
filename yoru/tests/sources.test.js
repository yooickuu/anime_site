import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeCatalogues,combinedCatalogue} from '../src/legacy-sources.js';
import {normalizeKitsu,fetchKitsuCatalogue} from '../src/kitsu.js';
import {normalizeRelease,providerEpisode} from '../src/provider.js';
import {enrichPosters} from '../src/posters.js';

test('cross-provider duplicates use exact MAL IDs; similarly named seasons remain separate',()=>{
 const a={id:'mal-1',malId:1,title:'Title',providerId:10};
 const b={id:'mal-1',malId:1,title:'Other spelling',kitsuId:'20'};
 const sequel={id:'mal-2',malId:2,title:'Title',kitsuId:'21'};
 assert.deepEqual(mergeCatalogues([a],[b,sequel]),[a,sequel]);
 assert.deepEqual(mergeCatalogues([],[b,sequel],new Map([[1,{id:10}]])),[sequel]);
});
test('matching cards from multiple video sources retain one card and all source references',()=>{
 const a={id:'lib-10',providerId:10,title:'Твоё имя!',year:2016,type:'MOVIE',translations:{en:['Your Name','']}};
 const b={id:'vost-20',animeVostId:20,title:'Твое имя',year:2016,type:'MOVIE'};
 const c={id:'go-30',animeGoId:30,title:'Your Name',year:2016,type:'MOVIE'};
 const sequel={id:'go-31',animeGoId:31,title:'Your Name 2',year:2016,type:'MOVIE'};
 assert.deepEqual(mergeCatalogues([a,b,c,sequel],[]),[{...a,animeVostId:20,animeGoId:30},sequel]);
});
test('deduplication preserves different years, media types and conflicting release IDs',()=>{
 const a={id:'a',providerId:10,malId:1,title:'Title',year:2020,type:'TV'};
 for(const b of [
  {id:'b',animeVostId:20,title:'Title',year:2021,type:'TV'},
  {id:'b',animeVostId:20,title:'Title',year:2020,type:'MOVIE'},
  {id:'b',animeVostId:20,malId:2,title:'Title',year:2020,type:'TV'},
  {id:'b',providerId:11,title:'Title',year:2020,type:'TV'}
 ])assert.equal(mergeCatalogues([a,b],[]).length,2);
});
test('an ambiguous title cannot attach a third source to the wrong release',()=>{
 const a={id:'a',providerId:10,title:'Title',year:2020,type:'TV'};
 const b={...a,id:'b',providerId:11};
 const c={id:'c',animeVostId:20,title:'Title',year:2020,type:'TV'};
 assert.equal(mergeCatalogues([a,b,c],[]).length,3);
});
test('Kitsu ID mappings and original posters remain tied to the correct release',()=>{
 const a=normalizeKitsu({id:'1000',attributes:{canonicalTitle:'Exact season',subtype:'TV',posterImage:{original:'https://media.kitsu.app/anime/poster_images/1000/original.jpg'},status:'current'},relationships:{mappings:{data:[{type:'mappings',id:'mapping'}]}}},[{type:'mappings',id:'mapping',attributes:{externalSite:'myanimelist/anime',externalId:'900001'}}]);
 assert.equal(a.id,'mal-900001');assert.equal(a.malId,900001);assert.equal(a.ongoing,true);assert.equal(a.catalogOnly,true);assert.ok(a.image.includes('/1000/'));
});
test('a release with no published episodes is not advertised as having its announced count playable',()=>{
 const a=normalizeRelease({id:904,name:{main:'Upcoming'},episodes_total:12,episodes:[],poster:{src:'/poster/904.jpg'},is_ongoing:true});
 assert.equal(a.episodes,0);assert.equal(a.announcedEpisodes,12);assert.equal(a.image,'https://api.anilibria.app/poster/904.jpg');
});
test('Kitsu uses stable offset pagination and filters across the entire catalogue',async()=>{
 const old=globalThis.fetch;let u;
 globalThis.fetch=async url=>{u=new URL(url);return {ok:true,json:async()=>({data:[],meta:{count:22500}})};};
 try{const result=await fetchKitsuCatalogue({page:1125,type:'MOVIE',ongoing:true,query:'Your Name'});assert.equal(u.searchParams.get('page[offset]'),'22480');assert.equal(u.searchParams.get('filter[subtype]'),'movie');assert.equal(u.searchParams.get('filter[status]'),'current');assert.equal(u.searchParams.get('filter[text]'),'Your Name');assert.equal(result.pages,1125);}finally{globalThis.fetch=old;}
});
test('poster service outages preserve the exact provider cover',async()=>{
 const old=globalThis.fetch;globalThis.fetch=async()=>{throw Error('offline');};
 try{const a=normalizeRelease({id:900,mal:{id:900000},name:{main:'Exact'},poster:{src:'/covers/900.jpg'}});await enrichPosters([a]);assert.equal(a.image,'https://api.anilibria.app/covers/900.jpg');}finally{globalThis.fetch=old;}
});
test('provider episode uses HLS and converts negative ending times against duration',async()=>{
 const old=globalThis.fetch;
 globalThis.fetch=async()=>({ok:true,json:async()=>({id:901,name:{main:'Episode test'},episodes:[{ordinal:1,sort_order:1,hls_720:'https://video.example/1.m3u8',duration:1440,opening:{start:30,stop:120},ending:{start:-90,stop:-1}}]})});
 try{const e=await providerEpisode('lib-901',1);assert.equal(e.url,'https://video.example/1.m3u8');assert.deepEqual(e.opening,{start:30,end:120});assert.deepEqual(e.ending,{start:1350,end:1439});assert.equal(await providerEpisode('lib-901',2),null);}finally{globalThis.fetch=old;}
});

test('filtered Kitsu matches survive even when the other catalogue knows the ID but misses the alias',async()=>{
 const old=globalThis.fetch;
 globalThis.fetch=async url=>{
  if(String(url)==='data/animevost-index.json')return {ok:true,json:async()=>({items:[]})};
  if(String(url)==='data/liberty-index.json')return {ok:true,json:async()=>({items:[{id:9999,malId:990001}]})};
  if(String(url).startsWith('https://api.anilibria.app'))return {ok:true,json:async()=>({data:[],meta:{pagination:{total:0,total_pages:1}}})};
  return {ok:true,json:async()=>({data:[{id:'990001',attributes:{canonicalTitle:'An alternative title',posterImage:{original:'https://example.test/poster.jpg'}},relationships:{mappings:{data:[{type:'mappings',id:'exact'}]}}}],included:[{type:'mappings',id:'exact',attributes:{externalSite:'myanimelist/anime',externalId:'990001'}}],meta:{count:1}})};
 };
 try{
  const result=await combinedCatalogue({scope:'all',query:'An alternative title'});
  assert.equal(result.items.length,1);
  assert.equal(result.items[0].malId,990001);
  assert.equal(result.partial,false);
 }finally{globalThis.fetch=old;}
});

test('one failed catalogue keeps the other results and reports partial availability',async()=>{
 const old=globalThis.fetch;
 globalThis.fetch=async url=>{
  if(String(url).startsWith('https://api.anilibria.app'))throw Error('offline');
  return {ok:true,json:async()=>({data:[{id:'990002',attributes:{canonicalTitle:'Still available'}}],meta:{count:1}})};
 };
 try{
  const result=await combinedCatalogue({scope:'all'});
  assert.equal(result.items.length,1);
  assert.deepEqual(result.totals,{AnimeVost:0,Kitsu:1});
  assert.equal(result.partial,true);
 }finally{globalThis.fetch=old;}
});

test('audience ratings come from actual Kitsu scores and remain absent when unscored',()=>{
 const rated=normalizeKitsu({id:'rating-check',attributes:{canonicalTitle:'A',averageRating:'87.35'}});
 assert.equal(rated.audienceRating,8.735);assert.equal(rated.audienceRatingSource,'Kitsu');
 assert.equal(normalizeKitsu({id:'no-rating',attributes:{canonicalTitle:'B'}}).audienceRating,null);
});
test('discovery modes send actual popularity, rating, airing and film filters',async()=>{
 const {discoveryOptions}=await import('../src/legacy-sources.js');
 assert.equal(discoveryOptions({view:'popular',sort:'latest'}).sort,'popular');
 assert.equal(discoveryOptions({view:'topRated'}).sort,'topRated');
 assert.equal(discoveryOptions({view:'airingNow'}).ongoing,true);
 assert.equal(discoveryOptions({view:'films'}).type,'MOVIE');
});
