import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {findWatchRelease,resolveRelease,videoEpisode} from '../src/sources.js';
test('lazy title hydration preserves all long-series episodes and sends the exact chosen dub to v17',async()=>{
 const old=globalThis.fetch,oldWindow=globalThis.window;let request;
 globalThis.window={YORU_CONFIG:{supabaseUrl:'https://project.supabase.co',supabaseKey:'public'}};
 globalThis.fetch=async(input,options)=>{
  const u=new URL(input);
  if(u.origin==='https://project.supabase.co'){
   request=JSON.parse(options.body);return Response.json({audioId:request.audio,proxied:true,stream:true,sources:[{quality:720,url:'https://project.supabase.co/functions/v1/anime-source?stream=1&p=signed&s=test'}]});
  }
  assert.equal(u.origin,'https://yomiku.site');assert.match(u.pathname,/^\/data\/(catalog|media)\//);
  try{return new Response(await readFile('dist'+u.pathname));}catch(e){if(e.code==='ENOENT')return new Response('',{status:404});throw e;}
 };
 try{
  const raw=JSON.parse(await readFile('dist/data/media/mal-21.json')).items[0];
  const title=await findWatchRelease('mal-21');assert.ok(title.episodes>1000);assert.equal(title.episodeManifest.length,raw.episodes.length);
  const resolved=await resolveRelease(title);assert.deepEqual(resolved.episodeManifest,title.episodeManifest);
  const index=raw.episodes.findIndex(e=>e.audio.some(t=>t.providerRef?.provider==='kodik'));
  const track=raw.episodes[index].audio.find(t=>t.providerRef?.provider==='kodik');
  const media=await videoEpisode(resolved,index+1,false,track.id);
  assert.equal(request.audio,track.id);assert.equal(request.ordinal,track.providerRef.ordinal);assert.equal(media.audioId,track.id);assert.equal(media.proxied,true);
 }finally{globalThis.fetch=old;globalThis.window=oldWindow;}
});
