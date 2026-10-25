import test from 'node:test';import assert from 'node:assert/strict';
import {combinedCatalogue,findWatchRelease,resolveRelease,videoEpisode,discoveryIndex} from '../src/sources.js';
import {registerAnime} from '../src/catalog.js';
test('unpublished records never enter the live catalogue through cached cards or legacy providers',async()=>{
 const old=globalThis.fetch;globalThis.fetch=async value=>{
  const url=new URL(value);assert.equal(url.origin,'https://yomiku.site');assert.ok(url.pathname.startsWith('/data/catalog/'));
  try{return new Response(await (await import('node:fs/promises')).readFile('dist'+url.pathname));}catch(error){if(error.code==='ENOENT')return new Response('',{status:404});throw error;}
 };
 try{
  registerAnime({id:'mal-999999999',providerId:9542,animeGoId:4013});
  assert.ok(!((await combinedCatalogue({view:'popular'})).items.some(a=>a.id==='mal-999999999')));
  assert.ok(!((await discoveryIndex()).some(a=>a.id==='mal-999999999')));
  for(const id of ['mal-999999999','go-4013','sintel'])assert.equal(await findWatchRelease(id),null);
  await assert.rejects(resolveRelease({id:'mal-999999999'}),/notAdmitted/);
  await assert.rejects(videoEpisode({id:'mal-999999999'},1),/notAdmitted/);
 }finally{globalThis.fetch=old;}
});
