import test from 'node:test';import assert from 'node:assert/strict';
import {combinedCatalogue,findWatchRelease,resolveRelease,iframeEpisode,discoveryIndex} from '../src/sources.js';
import {registerAnime} from '../src/catalog.js';
test('unpublished records never enter the live catalogue through cached cards or legacy providers',async()=>{
 const old=globalThis.fetch;globalThis.fetch=()=>{throw Error('Unexpected old source request');};
 try{
  registerAnime({id:'mal-999999999',providerId:9542,animeGoId:4013});
  assert.ok(!((await combinedCatalogue({view:'popular'})).items.some(a=>a.id==='mal-999999999')));
  assert.ok(!((await discoveryIndex()).some(a=>a.id==='mal-999999999')));
  for(const id of ['mal-999999999','go-4013','sintel'])assert.equal(await findWatchRelease(id),null);
  await assert.rejects(resolveRelease({id:'mal-999999999'}),/notAdmitted/);
  await assert.rejects(iframeEpisode({id:'mal-999999999'},1),/notAdmitted/);
 }finally{globalThis.fetch=old;}
});
