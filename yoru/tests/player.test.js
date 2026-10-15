import test from 'node:test';
import assert from 'node:assert/strict';
import {episodeNavigation,profileStats,defaults} from '../src/state.js';
import {episodeSources,chooseQuality,franchiseReleases} from '../src/provider.js';
import {cropGeometry} from '../src/avatar-crop.js';

test('episode controls disappear at boundaries and for a film',()=>{
 assert.deepEqual(episodeNavigation(1,12),{previous:false,next:true});
 assert.deepEqual(episodeNavigation(6,12),{previous:true,next:true});
 assert.deepEqual(episodeNavigation(12,12),{previous:true,next:false});
 assert.deepEqual(episodeNavigation(1,1),{previous:false,next:false});
});
test('quality selection ignores unsafe/missing sources and keeps a playable fallback',()=>{
 const sources=episodeSources({hls_1080:'javascript:bad',hls_720:'https://media.example/720.m3u8',hls_480:'https://media.example/480.m3u8'});
 assert.equal(sources.length,2);
 assert.equal(chooseQuality(sources,480).quality,480);
 assert.equal(chooseQuality(sources,1080).quality,720);
 assert.equal(chooseQuality([],720),null);
});
test('seasons come from exact provider franchise relations in provider order',()=>{
 const data=[{franchise_releases:[{sort_order:2,release_id:990012,release:{id:990012,name:{main:'Second'},mal:{id:990012}}},{sort_order:1,release_id:990011,release:{id:990011,name:{main:'First'},mal:{id:990011}}}]}];
 assert.deepEqual(franchiseReleases(data,990011).map(a=>a.id),['mal-990011','mal-990012']);
 assert.deepEqual(franchiseReleases(data,123),[]);
});
test('avatar crop stays inside portrait, landscape and square images at all zoom/pan extremes',()=>{
 for(const [w,h] of [[400,1200],[1600,400],[512,512]])for(const z of [1,2,4])for(const x of [-1,0,.5,1,2])for(const y of [-1,0,.5,1,2]){
  const r=cropGeometry(w,h,z,x,y);
  assert.ok(r.x>=0 && r.y>=0 && r.x+r.size<=w+.001 && r.y+r.size<=h+.001);
  assert.equal(r.size,Math.min(w,h)/z);
 }
});
test('profile statistics exclude the demo and unrated titles',()=>{
 const s=defaults();s.progress={a:{id:'anime',completed:true},b:{id:'anime',completed:false},c:{id:'sintel',completed:true}};s.entries={a:{rating:9},b:{rating:7},c:{rating:0}};
 assert.deepEqual(profileStats(s),{completedEpisodes:1,averageRating:'8.0'});
});

test('cached full releases survive a sparse discovery catalogue overwrite',async()=>{
 const {fetchRelease}=await import('../src/provider.js');
 const {registerAnime}=await import('../src/catalog.js');
 const original=globalThis.fetch;
 globalThis.fetch=async url=>({ok:true,json:async()=>String(url).includes('/mappings?')?{data:[]}:{id:998877,name:{main:'Cache regression'},mal:{id:998877},episodes:[{id:'e1',ordinal:1,hls_720:'https://media.example/1.m3u8'}]}});
 try {
  const full=await fetchRelease('lib-998877');
  registerAnime({id:full.id,providerId:998877,animeVostId:123,episodes:99});
  const cached=await fetchRelease(full.id);
  assert.equal(cached.episodes,1);
  assert.deepEqual(cached.episodeNumbers,[1]);
  assert.equal(cached.animeVostId,123);
 } finally {globalThis.fetch=original;}
});
