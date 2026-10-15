import test from 'node:test';
import assert from 'node:assert/strict';
import {episodeManifest,rebaseProgress} from '../src/episode-manifest.js';
import {audioChoices} from '../src/discovery.js';
import {vostEpisodeNumbers} from '../src/animevost.js';
import {providerEpisode} from '../src/provider.js';
test('short dubbing does not cap a long series; absent episodes are not invented',()=>{
 const lib=Array.from({length:20},(_,i)=>i+1),vost=Array.from({length:1180},(_,i)=>i+1).filter(n=>n!==216);
 const manifest=episodeManifest(lib,vost);
 assert.equal(manifest.length,1179);assert.equal(manifest.at(-1).ordinal,1180);
 assert.ok(!manifest.some(e=>e.ordinal===216));
 const a={providerId:1,animeVostId:2,episodeManifest:manifest};
 assert.deepEqual(audioChoices(a,1).map(x=>x.id),['liberty','vost']);
 assert.deepEqual(audioChoices(a,21).map(x=>x.id),['vost']);
});
test('union preserves fractional specials, deduplicates numbers and ignores invalid entries',()=>{
 assert.deepEqual(episodeManifest([1,2,4],[2,3,3,3.5,NaN,-1]).map(e=>e.ordinal),[1,2,3,3.5,4]);
 assert.deepEqual(vostEpisodeNumbers([{name:'2 серия',std:'https://example.test/2.mp4'},{name:'1 серия'},{name:'2 серия',hd:'https://example.test/2.mp4'}]),[2]);
});
test('provider retrieves an actual ordinal instead of the union position',async()=>{
 const old=globalThis.fetch;
 globalThis.fetch=async()=>({ok:true,json:async()=>({id:999401,name:{main:'Late episodes'},episodes:[{ordinal:101,hls_720:'https://example.test/101.m3u8'},{ordinal:102,hls_720:'https://example.test/102.m3u8'}]})});
 try{assert.equal((await providerEpisode('lib-999401',102,false,102)).ordinal,102);assert.equal(await providerEpisode('lib-999401',1,false,1),null);}finally{globalThis.fetch=old;}
});
test('progress follows episode numbers after another dubbing fills a gap',()=>{
 const progress={'mal-1:1':{id:'mal-1',episode:1,time:40,updated:1,anime:{episodeNumbers:[101,102]}},'mal-1:2':{id:'mal-1',episode:2,time:90,updated:2,anime:{episodeNumbers:[101,102]}},'mal-2:1':{id:'mal-2',episode:1,time:8}};
 const result=rebaseProgress(progress,'mal-1',[1,2,101,102]);
 assert.equal(result['mal-1:3'].time,40);assert.equal(result['mal-1:4'].ordinal,102);assert.equal(result['mal-1:1'],undefined);assert.equal(result['mal-2:1'].time,8);
 assert.deepEqual(rebaseProgress(result,'mal-1',[1,2,101,102]),result);
});
test('a complete second season with continued numbering is not duplicated',()=>{
 const lib=Array.from({length:12},(_,i)=>i+13),vost=Array.from({length:12},(_,i)=>i+1);
 const manifest=episodeManifest(lib,vost,12);
 assert.equal(manifest.length,12);assert.equal(manifest[0].ordinal,13);
 assert.deepEqual(manifest[0].sources,{liberty:13,vost:1});
 assert.equal(episodeManifest(lib,vost,null).length,24);
 assert.equal(episodeManifest([101,102],[1,2],500).length,4);
});
test('episode zero and fractional specials are preserved',()=>{
 assert.deepEqual(episodeManifest([0,1],[0,1,1.5]).map(e=>e.ordinal),[0,1,1.5]);
});
