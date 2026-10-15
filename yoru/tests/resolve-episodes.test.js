import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveRelease,videoEpisode} from '../src/sources.js';
import {registerAnime} from '../src/catalog.js';
import {audioChoices} from '../src/discovery.js';
test('resolving a linked release merges playlists and retrieves the selected ordinal',async()=>{
 const old=globalThis.fetch;
 globalThis.fetch=async(url,options)=>{
  const u=String(url);
  if(u==='data/animevost-index.json')return {ok:true,json:async()=>({items:[{id:998811,libertyId:998812}]})};
  if(u.includes('/playlist'))return {ok:true,json:async()=>[1,2,3,5].map(n=>({name:n+' серия',std:`https://example.test/vost-${n}.mp4`}))};
  if(u.includes('/anime/releases/'))return {ok:true,json:async()=>({id:998812,name:{main:'Full series'},description:'Description',episodes_total:5,episodes:[{ordinal:1,hls_720:'https://example.test/lib-1.m3u8'},{ordinal:4,hls_720:'https://example.test/lib-4.m3u8'}]})};
  throw Error('Unexpected URL');
 };
 try{
  const a=await resolveRelease(registerAnime({id:'lib-998812',providerId:998812,title:'Full series',description:'Description'}));
  assert.deepEqual(a.episodeNumbers,[1,2,3,4,5]);assert.equal(a.episodes,5);
  assert.deepEqual(audioChoices(a,4).map(x=>x.id),['liberty']);
  assert.equal((await videoEpisode(a,4,false,'liberty')).url,'https://example.test/lib-4.m3u8');
  assert.equal((await videoEpisode(a,5,false,'vost')).url,'https://example.test/vost-5.mp4');
 }finally{globalThis.fetch=old;}
});
