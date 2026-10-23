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
const dependencies={getMetadata:async()=>[{russian:'Название',malId:9,description:'Описание',poster:{originalUrl:'https://example.test/poster'}},null],imageProbe:async url=>({url,width:800,height:1200}),resolve:async url=>({sources:[{quality:720,url}]}),streamProbe:async s=>[{...s,duration:1400,checkedAt:'2026-10-22'}]};
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
