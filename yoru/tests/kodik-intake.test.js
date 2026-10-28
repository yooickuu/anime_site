import test from 'node:test';import assert from 'node:assert/strict';
import {KodikAPI,apiPage,allEpisodes,translationIdentity,mergeKodikRelease} from '../scripts/lib/kodik-api.mjs';
import {assembleRelease} from '../scripts/seed-catalog.mjs';
import {publishedKodikVideo} from '../server/published-kodik.js';
import {episodeSeasonOptions,localSeasons} from '../src/catalog-seasons.js';
const link=n=>`https://kodikplayer.com/seria/${n}/abc/720p`;
const release={id:'serial-9',type:'anime-serial',title:'Anime',year:2025,shikimori_id:'9',translation:{id:1,type:'voice',title:'Studio'},episodes_count:2,seasons:{1:{episodes:{1:link(1),2:{link:link(2)}}}},material_data:{anime_kind:'tv',countries:['Япония']}};
test('pagination follows all next_page links, strips tokens before checkpointing, rejects foreign origins',async()=>{
 const seen=[],api=new KodikAPI('secret',{fetcher:async u=>{seen.push(String(u));return {ok:true,json:async()=>({results:[],next_page:seen.length===1?'https://kodik-api.com/list?cursor=2&token=secret':null})};}});
 const pages=[];for await(const p of api.pages())pages.push(p);
 assert.equal(pages.length,2);assert.equal(pages[0].next_page,'/list?cursor=2');assert.ok(!pages[1].page.includes('secret'));
 assert.throws(()=>apiPage('https://evil.test/list?token=x'),/invalid/);assert.throws(()=>new KodikAPI(),/KODIK_TOKEN/);
});
test('long series collect every episode and every season without a 24-episode cap',()=>{
 const r=structuredClone(release);r.episodes_count=1202;r.seasons={1:{episodes:Object.fromEntries(Array.from({length:1200},(_,i)=>[i+1,link(i+1)]))},2:{episodes:{1:link(1201),2:link(1202)}}};
 const e=allEpisodes(r);assert.equal(e.length,1202);assert.equal(e.at(-1).season,2);assert.equal(e.at(-1).ordinal,2);
 delete r.seasons[1].episodes[1200];assert.throws(()=>allEpisodes(r),/incomplete/);
});
test('Japanese translations require Japanese metadata and preserve their own translation ID',()=>{
 const jp={...release,translation:{id:2,type:'subtitles',title:'Субтитры'}};
 assert.deepEqual([translationIdentity(jp).id,translationIdentity(jp).language,translationIdentity(jp).original],['kodik-2','ja',true]);
 assert.equal(translationIdentity(release).language,'ru');
 assert.equal(translationIdentity({...jp,material_data:{countries:['Китай']}}).language,'zh');
 assert.throws(()=>translationIdentity({...jp,material_data:{}}),/language_unknown/);
});
const dependencies={deepProbe:true,getMetadata:async()=>[{russian:'Название',malId:9,description:'Описание',poster:{originalUrl:'https://example.test/poster'}},null],imageProbe:async url=>({url,width:800,height:1200}),resolve:async url=>({sources:[{quality:720,url}]}),streamProbe:async s=>[{...s,duration:1400,checkedAt:'2026-10-22'}]};
test('subtitle imports resolve missing country from metadata without changing the selected track',async()=>{
 const r={...release,material_data:{anime_kind:'tv'},translation:{id:1291,title:'Crunchyroll.Subtitles',type:'subtitles'}};
 const a=await assembleRelease(r,{...dependencies,deepProbe:false,getMetadata:async()=>[null,{idMal:9,countryOfOrigin:'JP',coverImage:{extraLarge:'https://example.test/poster'}}]});
 assert.equal(a.episodes[0].audio[0].language,'ja');
 assert.equal(a.episodes[0].audio[0].providerRef.translationId,'1291');
 assert.equal(a.episodes[0].audio[0].providerRef.url,link(1));
 assert.throws(()=>translationIdentity(r),/language_unknown/);
 assert.equal(translationIdentity({...r,material_data:{countries:['Китай']}},{countryOfOrigin:'JP'}).language,'zh');
});
test('Kodik retries an interrupted JSON body and reports DNS failures without leaking credentials',async()=>{
 let calls=0;const waits=[];
 const api=new KodikAPI('private-test-token',{wait:async ms=>waits.push(ms),fetcher:async()=>({ok:true,json:async()=>{if(++calls===1)throw Error('socket closed');return {results:[]};}})});
 assert.deepEqual((await api.request()).results,[]);assert.equal(calls,2);assert.deepEqual(waits,[1000]);
 calls=0;api.fetcher=async()=>{calls++;throw Object.assign(Error('secret URL'),{cause:{code:'ENOTFOUND'}});};
 await assert.rejects(api.request(),e=>e.message.includes('(dns)')&&!e.message.includes('private-test-token')&&!e.message.includes('secret URL'));
 assert.equal(calls,3);
});
test('assembly keeps exact stream per episode and rejects a release with any missing episode stream',async()=>{
 const a=await assembleRelease(release,dependencies);assert.equal(a.episodes.length,2);assert.equal(a.episodes[1].audio[0].providerRef.url,link(2));
 await assert.rejects(assembleRelease(release,{...dependencies,resolve:async url=>({sources:url===link(1)?[{quality:720,url}]:[]})}),/no_working_stream/);
 await assert.rejects(assembleRelease(release,{...dependencies,imageProbe:async()=>{throw Error('broken')}}),/broken_poster/);
});
test('sub-three-minute special requires a Shikimori description',async()=>{
 const r={...release,material_data:{...release.material_data,anime_kind:'special'}};
 const deps={...dependencies,getMetadata:async()=>[{poster:{originalUrl:'https://example.test/poster'}},null],streamProbe:async s=>[{...s,duration:100}]};
 await assert.rejects(assembleRelease(r,deps),/short_special/);
 assert.equal((await assembleRelease(r,{...deps,getMetadata:dependencies.getMetadata})).episodes.length,2);
});
test('merging translations preserves existing episode numbers and separate streams',async()=>{
 const a=await assembleRelease(release,dependencies);
 const b=await assembleRelease({...release,id:'serial-10',translation:{id:2,title:'Субтитры',type:'subtitles'},seasons:{1:{episodes:{1:link(11),2:link(12)}}}},dependencies);
 const merged=mergeKodikRelease(a,b);assert.equal(merged.episodes.length,2);assert.equal(merged.episodes[0].audio.length,2);
 assert.notEqual(merged.episodes[0].audio[0].sources[0].url,merged.episodes[0].audio[1].sources[0].url);
});
test('runtime resolver selects exact Japanese track and never falls back to Russian',async()=>{
 const resolved=[];const options={fetcher:async()=>({ok:true,json:async()=>({id:'mal-999991',episodes:[{tracks:[{audioId:'kodik-1',translationId:'1',url:link(1),ordinal:1},{audioId:'kodik-2',translationId:'2',url:link(2),ordinal:1}]}]})}),resolve:async url=>{resolved.push(url);return {sources:[{quality:720,url}]};}};
 const m=await publishedKodikVideo('mal-999991',1,'kodik-2',options);assert.equal(m.audioId,'kodik-2');assert.deepEqual(resolved,[link(2)]);
 await assert.rejects(publishedKodikVideo('mal-999991',1,'kodik-3',options),/audio_missing/);assert.equal(resolved.length,1);
});
test('season selector filters only its own episodes and links only explicit related titles',()=>{
 const a={id:'a',ids:{mal:1},relatedMalIds:[2],year:2020,episodeManifest:[{season:1,ordinal:1},{season:2,ordinal:1}]},b={id:'b',ids:{mal:2},year:2021},c={id:'c',ids:{mal:3}};
 assert.deepEqual(localSeasons([a,b,c],a).map(x=>x.id),['a','b']);assert.deepEqual(episodeSeasonOptions(a,2).episodes.map(x=>x.index),[2]);
});
import {mapLimit} from '../scripts/lib/concurrency.mjs';
test('parallel episode checks are bounded and retain original order',async()=>{
 let active=0,max=0;const result=await mapLimit([3,2,1,0],2,async n=>{active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,n));active--;return n;});
 assert.deepEqual(result,[3,2,1,0]);assert.equal(max,2);
});

test('legacy single-season entries align with Kodik franchise season without repeating episodes',()=>{
 const a={ids:{mal:9},episodes:[{number:1,audio:[{id:'lib'}]},{number:2,audio:[{id:'lib'}]}]};
 const b={ids:{shikimori:9,mal:null},episodes:[{number:1,ordinal:1,season:6,audio:[{id:'kodik-2'}]},{number:2,ordinal:2,season:6,audio:[{id:'kodik-2'}]}]};
 const merged=mergeKodikRelease(a,b);assert.equal(merged.episodes.length,2);assert.equal(merged.episodes[0].season,6);assert.equal(merged.episodes[0].audio.length,2);assert.equal(merged.ids.mal,9);
});

import {textFetch} from '../server/animego.js';
test('upstream redirects accept official HTTPS destinations and reject arbitrary destinations',async()=>{
 const before=globalThis.fetch;
 try{
  let calls=0;globalThis.fetch=async()=>++calls===1?new Response(null,{status:302,headers:{location:'https://yomiku.site/data/test.json'}}):new Response('okay');
  assert.equal(await textFetch('https://yooickuu.github.io/anime_site/data/test.json'),'okay');
  globalThis.fetch=async()=>new Response(null,{status:302,headers:{location:'http://127.0.0.1/private'}});
  await assert.rejects(textFetch('https://kodikplayer.com/video/1/abc/720p'),/redirect_blocked/);
 }finally{globalThis.fetch=before;}
});

test('upstream retries truncated responses once using Deno HTTP/1 with TLS verification intact',async()=>{
 const before=globalThis.fetch,deno=globalThis.Deno;let calls=0,settings;
 try{
  globalThis.Deno={createHttpClient:options=>{settings=options;return {testClient:true};}};
  globalThis.fetch=async(url,options)=>{assert.equal(options.client.testClient,true);if(++calls===1)throw Error('reached unexpected EOF');return new Response('complete');};
  assert.equal(await textFetch('https://kodikplayer.com/video/1/abc/720p'),'complete');
  assert.equal(calls,2);assert.equal(settings.http2,false);assert.equal(settings.http1,true);assert.equal(settings.unsafelyIgnoreCertificateErrors,undefined);
 }finally{globalThis.fetch=before;if(deno===undefined)delete globalThis.Deno;else globalThis.Deno=deno;}
});

import {seedCatalog} from '../scripts/seed-catalog.mjs';
import {mkdtemp,mkdir,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
test('a batch expands one title into three distinct translations without duplicate cards',async()=>{
 const cwd=process.cwd(),dir=await mkdtemp(join(tmpdir(),'kodik-batch-'));
 try{
  process.chdir(dir);await mkdir('src');
  const variants=[release,{...release,id:'serial-10',translation:{id:2,type:'voice',title:'Second studio'}},{...release,id:'serial-11',translation:{id:3,type:'subtitles',title:'Субтитры'}}];
  const api={async *pages(path){yield {results:path==='/search'?variants:[release],page:'/list',next_page:null};}};
  const report=await seedCatalog({targetCount:1,api,assemble:r=>assembleRelease(r,dependencies)});
  const saved=JSON.parse(await readFile('src/published-catalog.json','utf8'));
  assert.equal(report.added,1);assert.equal(saved.items.length,1);
  for(const episode of saved.items[0].episodes)assert.deepEqual(episode.audio.map(t=>t.id).sort(),['kodik-1','kodik-2','kodik-3']);
 }finally{process.chdir(cwd);await rm(dir,{recursive:true,force:true});}
});

test('season selector follows complete sequel chains without matching similar names',()=>{
 const a={id:'a',ids:{mal:1},relatedMalIds:[2],year:2020},b={id:'b',ids:{mal:2},relatedMalIds:[3],year:2021},c={id:'c',malId:3,year:2022},other={id:'other',ids:{mal:4},title:'Same name',year:2019};
 for(const current of [a,b,c])assert.deepEqual(localSeasons([other,c,b,a],current).map(x=>x.id),['a','b','c']);
});
test('rendition checks run concurrently but still reject broken renditions and check every episode',async()=>{
 let active=0,max=0,calls=0;
 const a=await assembleRelease(release,{...dependencies,resolve:async url=>({sources:[360,480,720,1080].map(quality=>({quality,url}))}),streamProbe:async s=>{
  calls++;active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,5));active--;
  if(s.quality===1080)throw Error('media_http_404');return [{...s,duration:1400}];
 }});
 assert.equal(calls,8);assert.ok(max>2&&max<=6);
 for(const e of a.episodes)assert.deepEqual(e.audio[0].sources.map(s=>s.quality),[360,480,720]);
});

test('popular mode follows ranked IDs, verifies releases and resumes after the admitted title',async()=>{
 const cwd=process.cwd(),dir=await mkdtemp(join(tmpdir(),'kodik-popular-'));
 try{
  process.chdir(dir);await mkdir('src');const searched=[];
  const api={async *pages(path,params){searched.push(params.shikimori_id);yield {results:[release],page:'/search',next_page:null};}};
  const getPopular=async page=>page===1?[{id:9},{id:10}]:[];
  const report=await seedCatalog({targetCount:1,order:'popular',api,getPopular,assemble:r=>assembleRelease(r,dependencies)});
  assert.equal(report.added,1);assert.deepEqual(searched,[9]);
  const progress=JSON.parse(await readFile('src/kodik-progress.json','utf8'));
  assert.deepEqual(progress.popular,{page:1,index:1});assert.equal(progress.next,'/list');
 }finally{process.chdir(cwd);await rm(dir,{recursive:true,force:true});}
});

test('failed releases are not retried repeatedly within the same batch',async()=>{
 const cwd=process.cwd(),dir=await mkdtemp(join(tmpdir(),'kodik-once-'));let checks=0;
 try{
  process.chdir(dir);await mkdir('src');
  const api={async *pages(){yield {results:[release,release],page:'/list',next_page:null};}};
  const report=await seedCatalog({targetCount:1,api,assemble:async()=>{checks++;throw Error('broken_poster');}});
  assert.equal(checks,1);assert.equal(report.added,0);assert.equal(report.pending.length,1);assert.equal(report.skipped,1);
 }finally{process.chdir(cwd);await rm(dir,{recursive:true,force:true});}
});
test('rejected revisions wait across commands, but a changed release is checked immediately',async()=>{
 const cwd=process.cwd(),dir=await mkdtemp(join(tmpdir(),'kodik-defer-'));let checks=0;
 try{
  process.chdir(dir);await mkdir('src');let row={...release,updated_at:'2026-10-01'};
  const api={async *pages(){yield {results:[row],page:'/list',next_page:null};}};
  const assemble=async()=>{checks++;throw Error('shikimori_identity_missing');};
  await seedCatalog({targetCount:1,api,assemble});
  await seedCatalog({targetCount:1,api,assemble});assert.equal(checks,1);
  row={...row,updated_at:'2026-10-02'};
  await seedCatalog({targetCount:1,api,assemble});assert.equal(checks,2);
  const p=JSON.parse(await readFile('src/kodik-progress.json'));
  p.deferred[row.id].retryAfter='2000-01-01';
  await import('node:fs/promises').then(fs=>fs.writeFile('src/kodik-progress.json',JSON.stringify(p)));
  await seedCatalog({targetCount:1,api,assemble});assert.equal(checks,3);
 }finally{process.chdir(cwd);await rm(dir,{recursive:true,force:true});}
});

import {firstMainEpisode,seasonMenu,franchiseSeasons} from '../src/catalog-seasons.js';
test('opening a title chooses main episodes while keeping extras and other seasons accessible',()=>{
 const a={id:'a',ids:{mal:1},episodeManifest:[{season:0,ordinal:1},...Array.from({length:25},(_,i)=>({season:1,ordinal:i+1}))]},b={id:'b',ids:{mal:2}};
 assert.equal(firstMainEpisode(a),2);assert.equal(episodeSeasonOptions(a,firstMainEpisode(a)).episodes.length,25);
 assert.deepEqual(seasonMenu(a,[a,b],2).map(x=>x.value),['season:1','release:b:1','season:0']);
 assert.equal(firstMainEpisode({episodeManifest:[{season:0,ordinal:1}]}),1);
});
test('newly fetched relations replace stale current-card metadata',()=>{
 const a={id:'a',ids:{mal:1}},b={id:'b',ids:{mal:2}};
 assert.deepEqual(localSeasons([a,b],{...a,relatedMalIds:[2]}).map(x=>x.id),['a','b']);
});
test('franchise links connect loaded seasons even across an unloaded intermediate season',()=>{
 const a={id:'a',ids:{shikimori:1}},c={id:'c',ids:{shikimori:3}},other={id:'other',ids:{shikimori:4}};
 const links=[{source_id:1,target_id:2,relation:'sequel'},{source_id:2,target_id:3,relation:'sequel'},{source_id:1,target_id:4,relation:'summary'}];
 assert.deepEqual(franchiseSeasons([a,c,other],a,links).map(x=>x.id),['a','c']);
});
import {jsonFetch} from '../server/animego.js';
test('empty upstream JSON is retried, but repeated invalid responses are not accepted',async()=>{
 const before=globalThis.fetch;let calls=0;
 try{globalThis.fetch=async()=>new Response(++calls===1?'':'{"links":{}}');assert.deepEqual(await jsonFetch('https://kodikplayer.com/api'),{links:{}});assert.equal(calls,2);
 globalThis.fetch=async()=>new Response('');await assert.rejects(jsonFetch('https://kodikplayer.com/api'),/upstream_invalid_json/);
 }finally{globalThis.fetch=before;}
});
import {refreshKodikMedia} from '../src/kodik-playback.js';
test('resolver outage rejects stale direct links and never swaps Japanese for Russian',async()=>{
 const media={audioId:'kodik-2',sources:[{quality:720,url:'https://media.test/ja.m3u8'}]},config={supabaseUrl:'https://test.supabase.co'};
 await assert.rejects(refreshKodikMedia(media,config,'mal-1',1,{fetcher:async()=>new Response('',{status:502})}),/providerError/);
 await assert.rejects(refreshKodikMedia(media,config,'mal-1',1,{fetcher:async()=>Response.json({audioId:'kodik-1',sources:media.sources})}),/audioUnavailable/);
});

test('popular batch checks two releases concurrently with a global cap of two',async()=>{
 const cwd=process.cwd(),dir=await mkdtemp(join(tmpdir(),'kodik-parallel-'));let active=0,max=0;
 try{
  process.chdir(dir);await mkdir('src');
  const api={async *pages(path,params){const id=Number(params.shikimori_id);yield {results:[{...release,id:'serial-'+id,shikimori_id:id}],page:'/search',next_page:null};}};
  const report=await seedCatalog({targetCount:2,order:'popular',api,getPopular:async()=>[{id:9},{id:10}],assemble:async r=>{active++;max=Math.max(max,active);await new Promise(resolve=>setTimeout(resolve,10));const a=await assembleRelease(r,{...dependencies,getMetadata:async()=>[{malId:Number(r.shikimori_id),poster:{originalUrl:'https://example.test/poster'}},null]});active--;return a;}});
  assert.equal(report.added,2);assert.equal(max,2);
  const saved=JSON.parse(await readFile('src/published-catalog.json'));assert.equal(saved.items.length,2);assert.equal(new Set(saved.items.map(a=>a.id)).size,2);
 }finally{process.chdir(cwd);await rm(dir,{recursive:true,force:true});}
});

test('season menu orders main groups first and preserves parts of a season',()=>{
 const make=(id,season)=>({id,type:'TV',episodeManifest:[{season,ordinal:1}]});
 const a=make('a',3),b=make('b',3),c=make('c',4);
 const rows=seasonMenu(b,[a,b,c]);
 assert.deepEqual(rows.map(e=>[e.displaySeason,e.part||null]),[[3,1],[3,2],[4,null]]);
 assert.equal(rows.filter(e=>e.selected).length,1);
 assert.equal(rows[1].value,'season:3');
});
test('prequel edges order same-year seasons even when records arrive reversed',()=>{
 const a={id:'a',ids:{mal:1},year:2020,relatedMalIds:[2],relations:[{id:2,relation:'sequel'}]},b={id:'b',ids:{mal:2},year:2020};
 assert.deepEqual(localSeasons([b,a],b).map(a=>a.id),['a','b']);
});
import {metadataFromAniList,withMetadata} from '../src/catalog-metadata.js';
import {titleFor,descriptionFor,registerAnime,byId} from '../src/catalog.js';
test('published metadata preserves separate English and Japanese titles and English synopsis',()=>{
 const meta=metadataFromAniList({title:{english:'Title',native:'タイトル'},description:'<b>Story</b>',relations:{edges:[]}});
 const a=withMetadata({title:'Название',description:'Описание',ids:{mal:991}}, {991:meta});
 assert.equal(titleFor(a,'en'),'Title');assert.equal(titleFor(a,'ja'),'タイトル');assert.equal(descriptionFor(a,'en'),'Story');assert.equal(descriptionFor(a,'ru'),'Описание');
});
test('account snapshots cannot erase live episodes or translated metadata',()=>{
 registerAnime({id:'test-published',catalogApproved:true,episodeManifest:[{ordinal:1}],translations:{en:['Title','Story']}});
 registerAnime({id:'test-published',catalogApproved:true,translations:{en:['Title','']}});
 assert.equal(byId('test-published').episodeManifest.length,1);assert.equal(descriptionFor(byId('test-published'),'en'),'Story');
});
import {seasonNavigation} from '../src/catalog-seasons.js';
import {savedEpisodeIndex,rebaseProgress} from '../src/episode-manifest.js';
test('first main episode does not navigate backwards into extras, resume keeps its season',()=>{
 const a={episodeManifest:[{season:0,ordinal:1},{season:1,ordinal:1},{season:1,ordinal:2}]};
 assert.deepEqual(seasonNavigation(a,2),{previous:null,next:3});
 const saved={id:'a',episode:2,ordinal:1,season:1,time:42};
 assert.equal(savedEpisodeIndex(saved,[1,2,3],a.episodeManifest),2);
 assert.equal(rebaseProgress({'a:2':saved},'a',[1,2,3],a.episodeManifest)['a:2'].time,42);
});
import {requireEpisodeCoverage} from '../scripts/seed-catalog.mjs';
import {allocateCatalogueId} from '../scripts/seed-catalog.mjs';
import {auditPlayerCatalogue} from '../scripts/lib/player-audit.mjs';
test('public ID collisions keep the published card stable and merge later dubs into the new card',async()=>{
 const cwd=process.cwd(),dir=await mkdtemp(join(tmpdir(),'kodik-public-id-'));
 try{
  process.chdir(dir);await mkdir('src');
  const old=await assembleRelease(release,dependencies);old.id='mal-10';
  const snapshot=JSON.stringify(old);
  await import('node:fs/promises').then(fs=>fs.writeFile('src/published-catalog.json',JSON.stringify({policyVersion:3,items:[old]})));
  const variants=[1,2].map(n=>({...release,id:'serial-new-'+n,shikimori_id:10,translation:{id:10+n,type:'voice',title:'Studio '+n}}));
  const api={async *pages(path){yield {results:path==='/list'?[variants[0]]:variants,page:'/list',next_page:null};}};
  const report=await seedCatalog({targetCount:1,api,assemble:r=>assembleRelease(r,{...dependencies,getMetadata:async()=>[{malId:10,poster:{originalUrl:'https://example.test/poster'}},null]})});
  const p=JSON.parse(await readFile('src/published-catalog.json'));
  assert.equal(report.added,1);assert.equal(p.items.length,2);
  assert.equal(JSON.stringify(p.items[0]),snapshot);
  assert.equal(p.items[1].id,'shikimori-10');assert.equal(p.items[1].episodes[0].audio.length,2);
  assert.deepEqual(auditPlayerCatalogue(p).errors,[]);
  const byId=new Map(p.items.map(a=>[a.id,a]));
  assert.throws(()=>allocateCatalogueId({id:'mal-10',ids:{mal:10,shikimori:10}},byId),/catalogue_id_conflict/);
  p.items[1].id='mal-10';
  assert.ok(auditPlayerCatalogue(p).errors.some(e=>e.code==='duplicate_catalogue_id'&&e.id==='mal-10'));
 }finally{process.chdir(cwd);await rm(dir,{recursive:true,force:true});}
});
test('future imports cannot pass a truncated release just because provider pagination is complete',()=>{
 const rows=Array.from({length:24},(_,i)=>({season:1,ordinal:i+1}));
 assert.throws(()=>requireEpisodeCoverage(rows,{status:'released',episodes:366}),/incomplete_catalogue_24_of_366/);
 assert.throws(()=>requireEpisodeCoverage(rows,{status:'ongoing',episodes:0,episodesAired:1180}),/incomplete_catalogue_24_of_1180/);
 assert.doesNotThrow(()=>requireEpisodeCoverage(rows,{status:'ongoing',episodes:100,episodesAired:24}));
});
import {completeRelease,linkedEpisodes} from '../scripts/lib/kodik-api.mjs';
import {createApprovedCatalogue} from '../src/approved-catalog.js';
test('light import stores exact episode links without resolving or probing media',async()=>{
 const a=await assembleRelease(release,{...dependencies,deepProbe:false,resolve:()=>{throw Error('must not resolve')},streamProbe:()=>{throw Error('must not probe')}});
 assert.equal(a.episodes.length,2);assert.equal(a.episodes[1].audio[0].providerRef.url,link(2));assert.deepEqual(a.episodes[0].audio[0].sources,[]);
 assert.equal(createApprovedCatalogue({policyVersion:3,items:[a]}).items.length,1);
 a.episodes[0].audio[0].providerRef.url='https://evil.test/seria/1/abc/720p';
 assert.equal(createApprovedCatalogue({policyVersion:3,items:[a]}).items.length,0);
});
test('incomplete list entry combines every search page before validating episode count',async()=>{
 const first={...release,seasons:{1:{episodes:{1:link(1)}}}};
 const api={async *pages(){yield {results:[first]};yield {results:[{...release,seasons:{1:{episodes:{2:link(2)}}}}]};}};
 assert.equal(allEpisodes(await completeRelease(api,first)).length,2);
 await assert.rejects(completeRelease({async *pages(){yield {results:[first]};}},first),/incomplete/);
});
test('specials and movies do not increment main season numbering, groups sort numerically',()=>{
 const make=(id,type,season)=>({id,type,episodeManifest:[{season,ordinal:1}]});
 const a=make('a','TV',1),b=make('b','TV',2),ova=make('ova','OVA',1),movie=make('movie','MOVIE',1),special=make('sp','SPECIAL',3);
 const entries=seasonMenu(a,[b,ova,special,movie,a]);
 assert.deepEqual(entries.filter(e=>!e.extra).map(e=>e.displaySeason),[1,2]);
 assert.equal(entries.filter(e=>e.extra).length,3);
 assert.equal(firstMainEpisode({episodeManifest:[{season:0,ordinal:1},{season:2,ordinal:1},{season:1,ordinal:2},{season:1,ordinal:1}]}),4);
});
test('light reimport retains direct stream cache only for the identical episode player',async()=>{
 const a=await assembleRelease(release,dependencies),incoming={...a,episodes:linkedEpisodes(release)};
 assert.equal(mergeKodikRelease(a,incoming).episodes[0].audio[0].sources.length,1);
 incoming.episodes[0].audio[0].providerRef.url=link(99);
 assert.equal(mergeKodikRelease(a,incoming).episodes[0].audio[0].sources.length,0);
});
test('fresh-video lookup keeps season and ordinal stable after catalogue reordering',async()=>{
 const options={season:1,ordinal:1,fetcher:async url=>{
  assert.ok(url.startsWith('https://raw.githubusercontent.com/yooickuu/anime_site/main/data/kodik/'));
  return {ok:true,json:async()=>({id:'mal-999992',episodes:[{tracks:[{audioId:'kodik-1',translationId:'1',season:0,ordinal:1,url:link(81)}]},{tracks:[{audioId:'kodik-1',translationId:'1',season:1,ordinal:1,url:link(82)}]}]})};
 },resolve:async url=>({sources:[{quality:720,url}]})};
 const m=await publishedKodikVideo('mal-999992',1,'kodik-1',options);
 assert.equal(m.sources[0].url,link(82));
 await assert.rejects(publishedKodikVideo('mal-999992',1,'kodik-1',{...options,ordinal:99}),/audio_missing/);
});
test('three existing dubs never prevent a longer translation adding missing episodes',async()=>{
 const cwd=process.cwd(),dir=await mkdtemp(join(tmpdir(),'kodik-complement-'));
 try{
  process.chdir(dir);await mkdir('src');
  const a=await assembleRelease(release,dependencies);
  for(const e of a.episodes)e.audio=Array.from({length:3},(_,i)=>({...e.audio[0],id:'kodik-'+(i+1),providerRef:{...e.audio[0].providerRef,translationId:String(i+1)}}));
  await import('node:fs/promises').then(fs=>fs.writeFile('src/published-catalog.json',JSON.stringify({policyVersion:3,items:[a]})));
  const r={...release,id:'serial-4',translation:{id:4,type:'voice',title:'Fourth dub'},episodes_count:3,seasons:{1:{episodes:{1:link(1),2:link(2),3:link(3)}}}};
  const api={async *pages(path){yield {results:path==='/list'?[r]:[],page:'/list',next_page:null};}};
  await seedCatalog({targetCount:1,api,assemble:r=>assembleRelease(r,{...dependencies,deepProbe:false})});
  const saved=JSON.parse(await readFile('src/published-catalog.json'));assert.equal(saved.items.length,1);assert.equal(saved.items[0].episodes.length,3);
 }finally{process.chdir(cwd);await rm(dir,{recursive:true,force:true});}
});

test('resolver failure never substitutes an embedded third-party player',async()=>{
 const media={audioId:'kodik-42',providerRef:{provider:'kodik',translationId:42,url:'https://kodikplayer.com/seria/123/abc123/720p'},sources:[]};
 const config={supabaseUrl:'https://example.test',supabaseKey:'public'};
 await assert.rejects(refreshKodikMedia(media,config,'mal-1',1,{fetcher:async()=>new Response('',{status:502})}),/providerError/);
 await assert.rejects(refreshKodikMedia(media,config,'mal-1',1,{fetcher:async()=>Response.json({audioId:'kodik-42',sources:[]})}),/audioUnavailable/);
});

import {kodikRequestParameters} from '../server/animego.js';
test('Kodik POST referrer is decoded once before form serialization; signatures stay intact',()=>{
 const original='https://yomiku.site/watch?next=%2Fcatalog&title=тест';
 const params={ref:encodeURIComponent(original),ref_sign:'signed:123',d:'yomiku.site',d_sign:'domain:123'};
 const form=new URLSearchParams(kodikRequestParameters(params));
 assert.equal(form.get('ref'),original);assert.equal(form.get('ref_sign'),'signed:123');
 assert.equal(form.get('d_sign'),'domain:123');assert.equal(kodikRequestParameters({}).ref,'');
 assert.throws(()=>kodikRequestParameters({ref:'%XX'}),/invalid_referrer_encoding/);
});
