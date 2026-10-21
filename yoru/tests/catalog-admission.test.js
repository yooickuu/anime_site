import test from 'node:test';
import assert from 'node:assert/strict';
import {auditAdmission,auditBatch} from '../src/catalog-admission.js';
const now=Date.parse('2026-10-21T12:00:00Z');
const proof=()=>({passed:true,checkedAt:new Date(now).toISOString()});
function valid(){return {id:'mal-1',ids:{mal:1,anilist:10},releasedEpisodes:[1,2],ongoing:true,
 updates:{adapter:'fixture',schedule:'hourly',probe:proof()},
 evidence:{identity:proof(),releaseManifest:proof(),playerDesktop:proof(),playerMobile:proof()},
 artwork:{poster:{url:'https://example.test/poster.jpg',width:1000,height:1500,review:proof()},backdrop:{url:'https://example.test/bg.jpg',width:1920,height:1080,review:proof()}},
 episodes:[1,2].map(number=>({number,audio:['ru','ru','en','ja'].map((language,i)=>({id:'track-'+i,dubId:'studio-'+i,language,original:language==='ja',languageReview:proof(),duration:1400,
 sources:[360,480,720,1080].map(quality=>({quality,height:quality,url:`https://example.test/${number}/${i}/${quality}.m3u8`,probe:{...proof(),decoded:true,browserPlayable:true}})),
 subtitles:['ru','en','ja'].map(language=>({language,format:'vtt',url:'https://example.test/'+language+'.vtt',review:{...proof(),synchronized:true}})),opening:{start:20,end:100,review:proof()},ending:{absent:true,review:proof()}}))}))};}
const options={now,playerSubtitlesReady:true};
test('all requirements must be verified, including every episode/audio rendition',()=>{
 assert.equal(auditAdmission(valid(),options).passed,true);
 for(const mutate of [a=>a.episodes[1].audio.pop(),a=>a.episodes[1].audio[1].sources.splice(2),a=>a.episodes[1].audio[2].subtitles.pop(),a=>a.episodes.pop(),a=>a.artwork.backdrop.width=300,a=>a.updates.probe.passed=false,a=>a.episodes[1].audio[0].opening.end=2000]){
  const a=valid();mutate(a);assert.equal(auditAdmission(a,options).passed,false);
 }
});
test('no admission from labels or HTTP success alone, stale reports, or absent subtitle support',()=>{
 const a=valid();a.episodes[0].audio[0].sources[0].probe.decoded=false;assert.equal(auditAdmission(a,options).passed,false);
 assert.equal(auditAdmission(valid(),{now,playerSubtitlesReady:false}).passed,false);
 assert.equal(auditAdmission(valid(),{...options,now:now+2*86400000}).passed,false);
 const b=valid();b.episodes[0].audio[1].dubId='  STUDIO-0 ';assert.equal(auditAdmission(b,options).passed,false);
});
test('deduplicate inside batch and against previous batches by any shared canonical ID',()=>{
 const a=valid(),b=structuredClone(a);b.id='other-provider';
 assert.deepEqual(auditBatch([a,b],options).map(r=>r.passed),[true,false]);
 b.ids={anilist:10};assert.equal(auditBatch([b],{...options,existing:[a]})[0].passed,false);
 const sequel=valid();sequel.id='mal-2';sequel.ids={mal:2,anilist:11};assert.deepEqual(auditBatch([a,sequel],options).map(r=>r.passed),[true,true]);
});
