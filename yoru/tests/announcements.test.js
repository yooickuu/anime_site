import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {fromShiki,fromAniList,POSTER,mergeAnnouncements,reconcile,identityMatcher} from '../src/announcements/model.js';
import {createAnnouncements} from '../src/announcements/client.js';
import {createCatalogueStore} from '../src/catalog-store.js';
import {collectAnnouncements,updateAnnouncements} from '../scripts/update-announcements.mjs';
const sh=(id=1,status='anons')=>fromShiki({id,russian:'Новое аниме '+id,name:'New Anime '+id,kind:'tv',status,airedOn:{year:2027},poster:{originalUrl:'/assets/globals/missing_original.jpg'}});
test('announcements carry no fictional episodes or video and use a poster-only fallback',()=>{
 const a=sh();assert.equal(a.id,'mal-1');assert.equal(a.episodes,0);assert.equal(a.catalogOnly,true);assert.equal(a.image,POSTER);assert.equal(a.status,'announced');assert.equal(a.releaseDate.day,null);assert.equal(fromShiki({}),null);assert.equal(fromAniList({}),null);
 assert.equal(sh(1,'ongoing').status,'airing');assert.equal(sh(1,'ongoing').catalogOnly,true);
});
test('identity merge prefers Russian metadata and excludes published titles without title collisions',()=>{
 const a=sh(),b=fromAniList({id:20,idMal:1,title:{romaji:'New Anime 1'},status:'NOT_YET_RELEASED',format:'TV',startDate:{year:2027},coverImage:{extraLarge:'https://image.test/poster.jpg'},genres:['Action']});
 const rows=mergeAnnouncements([a],[b]);assert.equal(rows.length,1);assert.equal(rows[0].title,a.title);assert.equal(rows[0].image,b.image);assert.equal(rows[0].ids.anilist,20);
 assert.equal(reconcile(rows,[{...a,catalogOnly:false,episodes:1}]).length,0);
 assert.equal(reconcile([a],[{...a,id:'mal-2',ids:{mal:2,shikimori:2}}]).length,1);
 assert.equal(identityMatcher([{...a,id:'lib-9',ids:{}}])({...a,ids:{}}).id,'lib-9');
 assert.equal(identityMatcher([{...a,id:'lib-9',ids:{},year:2026}])({...a,ids:{}}),null);
});
test('display feed is cached for 12 hours and denied localStorage never breaks loading',async()=>{
 let calls=0,time=100,stored='';const storage=()=>({getItem:()=>stored,setItem:(_,v)=>{stored=v;}}),fetcher=async()=>{calls++;return Response.json({items:[sh()],aliases:{'anilist-20':'mal-1'}});};
 const c=createAnnouncements({fetcher,storage,now:()=>time});await Promise.all([c.feed(),c.feed()]);assert.equal(calls,1);await c.feed();assert.equal(calls,1);
 const next=createAnnouncements({fetcher,storage,now:()=>time});assert.equal((await next.find('anilist-20')).id,'mal-1');assert.equal(calls,1);
 time+=12*3600000+1;await c.feed();assert.equal(calls,2);
 assert.equal((await createAnnouncements({fetcher,storage:()=>{throw Error('denied');}}).feed()).length,1);
});
test('catalogue announced filter and search return metadata without marking it playable',async()=>{
 const published={id:'mal-2',title:'Old',catalogApproved:true,episodes:1,genres:[]};const a=sh();
 const store=createCatalogueStore({items:[published],total:1,searchIndex:true,revision:'1',chunkSize:120,chunks:1},{fetcher:async url=>Response.json((/search.json|browse\//.test(String(url)))?[published]:published)});
 const result=await store.query({status:'announced'},{extra:[a]});assert.deepEqual(result.items,[a]);assert.equal(store.isPublished(a.id),false);assert.equal(store.isPublished(published.id),true);
 const search=await store.query({query:'Новое'},{extra:[a]});assert.equal(search.total,1);
 const mixed=await store.query({page:1},{extra:[a]});assert.equal(mixed.total,2);assert.equal(mixed.items.length,2);
});
test('feed pagination respects hasNextPage and never requires inaccurate total counts',async()=>{
 let primary=0,secondary=0;const d=await collectAnnouncements({wait:async()=>{},primary:async()=>({items:[sh(++primary)],next:primary<2}),secondary:async()=>{secondary++;return {items:[],next:false};}});
 assert.equal(primary,2);assert.equal(secondary,1);assert.equal(d.items.length,2);
});
test('premiere without a valid track remains metadata-only; existing video catalogue is byte-identical',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'yomiku-announcements-'));const catalogPath=join(dir,'catalog.json'),feedPath=join(dir,'announcements.json'),original=JSON.stringify({policyVersion:3,items:[]});
 await writeFile(catalogPath,original);await writeFile(feedPath,JSON.stringify({items:[sh()],aliases:{}}));
 try{await updateAnnouncements({catalogPath,feedPath,reportPath:null,collect:async()=>({items:[],errors:[]}),refreshDetails:async()=>({items:[sh(1,'ongoing')]}),wait:async()=>{},api:{async *pages(){yield {results:[]};}}});
  assert.equal(await readFile(catalogPath,'utf8'),original);const d=JSON.parse(await readFile(feedPath));assert.equal(d.items[0].status,'airing');assert.equal(d.items[0].catalogOnly,true);assert.equal(d.items[0].episodes,0);
 }finally{await rm(dir,{recursive:true,force:true});}
});
import {assembleRelease} from '../scripts/seed-catalog.mjs';
test('first validated episode promotes once under its saved ID and retains all returned dubs',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'yomiku-promote-')),catalogPath=join(dir,'catalog.json'),feedPath=join(dir,'announcements.json');
 await writeFile(catalogPath,JSON.stringify({policyVersion:3,items:[]}));
 const release={id:'serial-1',shikimori_id:1,year:2027,title:'Новое аниме 1',title_orig:'New Anime 1',type:'anime-serial',episodes_count:1,translation:{id:1,title:'Voice',type:'voice'},material_data:{anime_kind:'tv',anime_status:'ongoing',countries:['Япония']},seasons:{1:{episodes:{1:'https://kodikplayer.com/seria/1/abcdef/720p'}}}};
 const api={async *pages(){yield {results:[release,{...release,id:'serial-2',translation:{id:2,title:'Other',type:'voice'}}]};}};
 const assemble=r=>assembleRelease(r,{getMetadata:async()=>[{malId:1,russian:r.title,status:'ongoing',poster:{originalUrl:'https://img.test/1.jpg'}},null],imageProbe:async url=>({url,width:1000,height:1500}),deepProbe:false});
 try{const result=await updateAnnouncements({catalogPath,feedPath,reportPath:null,collect:async()=>({items:[sh()],errors:[]}),wait:async()=>{},api,assemble});assert.equal(result.promoted,1);
  const catalog=JSON.parse(await readFile(catalogPath));assert.equal(catalog.items.length,1);assert.equal(catalog.items[0].id,'mal-1');assert.equal(catalog.items[0].ongoing,true);assert.equal(catalog.items[0].episodes[0].audio.length,2);
  const feed=JSON.parse(await readFile(feedPath));assert.equal(feed.items.length,0);assert.equal(feed.aliases['mal-1'],'mal-1');
  const again=await updateAnnouncements({catalogPath,feedPath,reportPath:null,collect:async()=>({items:[sh()],errors:[]}),wait:async()=>{},api,assemble});assert.equal(again.checked,0);assert.equal(again.promoted,0);
 }finally{await rm(dir,{recursive:true,force:true});}
});
