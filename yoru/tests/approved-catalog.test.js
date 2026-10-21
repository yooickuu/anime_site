import test from 'node:test';
import assert from 'node:assert/strict';
import {createApprovedCatalogue} from '../src/approved-catalog.js';
import {valid,now} from './fixtures/admitted.js';
import {audioChoices} from '../src/discovery.js';
test('approved manifest resolves exact episode and dub, independent of stale provider IDs',()=>{
 const a=valid();a.episodes.reverse();a.providerId=999;
 const c=createApprovedCatalogue({policyVersion:2,items:[a]},{now});
 const model=c.find(a.id);assert.equal(model.episodes,2);assert.deepEqual(model.episodeNumbers,[1,2]);
 assert.equal(audioChoices(model,1).filter(a=>a.language==='en').length,1);
 const media=c.video(a.id,2,'track-3');assert.equal(media.ordinal,2);assert.match(media.sources[0].url,/\/2\/3\//);
 assert.equal(media.subtitles.length,3);
 media.sources.length=0;assert.equal(c.video(a.id,2,'track-3').sources.length,4);
 assert.throws(()=>c.video(a.id,3),/episodeUnavailable/);assert.throws(()=>c.video(a.id,1,'unknown'),/audioUnavailable/);
 assert.throws(()=>c.video('lib-999',1),/notAdmitted/);
});
test('publication still rejects duplicates, unsafe URLs and missing evidence',()=>{
 const a=valid(),b=structuredClone(a);b.id='mirror';
 assert.equal(createApprovedCatalogue({policyVersion:2,items:[a,b]},{now}).items.length,1);
 a.episodes[0].audio[0].subtitles[0].url='javascript:bad';
 assert.equal(createApprovedCatalogue({policyVersion:2,items:[a]},{now}).items.length,0);
});
