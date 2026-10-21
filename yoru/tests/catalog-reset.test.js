import test from 'node:test';import assert from 'node:assert/strict';
import {combinedCatalogue,findWatchRelease,resolveRelease,videoEpisode,discoveryIndex} from '../src/sources.js';
import {registerAnime} from '../src/catalog.js';
test('empty approved catalogue never falls back to cached cards or legacy providers',async()=>{
 const old=globalThis.fetch;globalThis.fetch=()=>{throw Error('Unexpected old source request');};
 try{
  registerAnime({id:'mal-52991',providerId:9542,animeGoId:4013});
  assert.ok(!((await combinedCatalogue({view:'popular'})).items.some(a=>a.id==='mal-52991')));
  assert.ok(!((await discoveryIndex()).some(a=>a.id==='mal-52991')));
  for(const id of ['mal-52991','go-4013','sintel'])assert.equal(await findWatchRelease(id),null);
  await assert.rejects(resolveRelease({id:'mal-52991'}),/notAdmitted/);
  await assert.rejects(videoEpisode({id:'mal-52991'},1),/notAdmitted/);
 }finally{globalThis.fetch=old;}
});
