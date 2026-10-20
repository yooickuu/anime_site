import test from 'node:test';
import assert from 'node:assert/strict';
import {assembleCandidates} from '../src/catalog-assembly.js';
import {auditAdmission} from '../src/catalog-admission.js';
const now=Date.parse('2026-10-21T12:00:00Z');
const proof=()=>({passed:true,checkedAt:new Date(now).toISOString()});
const track=(language,dubId)=>({id:dubId,dubId,language,original:language==='ja',duration:1400,
 recordingId:'recording-'+dubId,cutId:'broadcast-v1',mappingReview:{...proof(),releaseKey:'mal:1',episode:1},
 languageReview:proof(),sources:[360,480,720,1080].map(quality=>({quality,height:quality,url:`https://example.test/${dubId}/${quality}`,probe:{...proof(),decoded:true,browserPlayable:true}})),
 subtitles:['ru','en','ja'].map(language=>({language,format:'vtt',url:`https://example.test/${language}.vtt`,review:{...proof(),synchronized:true}})),
 opening:{start:30,end:120,review:proof()},ending:{absent:true,review:proof()}});
const row=(provider,audio)=>({id:provider+'-1',provider,ids:{mal:1,anilist:10},title:'Release',releasedEpisodes:[1],evidence:{identity:proof(),releaseManifest:proof(),playerDesktop:proof(),playerMobile:proof()},
 artwork:{poster:{url:'https://example.test/p',width:1000,height:1500,review:proof()},backdrop:{url:'https://example.test/b',width:1920,height:1080,review:proof()}},episodes:[{number:1,audio}]});
test('three sources form one release with two RU voices, EN and JA, requiring fresh assembled-player verification',()=>{
 const records=[row('one',[track('ru','studio-a')]),row('two',[track('ru','studio-b')]),row('three',[track('en','english'),track('ja','original')])];
 const before=JSON.stringify(records),{items,summary}=assembleCandidates(records,{now});
 assert.equal(items.length,1);assert.equal(summary.mergedRecords,2);
 assert.equal(items[0].episodes[0].audio.length,4);assert.equal(items[0].id,'mal-1');
 assert.equal(auditAdmission(items[0],{now,playerSubtitlesReady:true}).passed,false);
 items[0].evidence.playerDesktop=proof();items[0].evidence.playerMobile=proof();
 assert.equal(auditAdmission(items[0],{now,playerSubtitlesReady:true}).passed,true);
 assert.equal(JSON.stringify(records),before);
});
test('same voice mirrors combine renditions only after recording, cut and episode match',()=>{
 const a=track('ru','studio'),b=track('ru','studio');a.sources=a.sources.slice(0,2);b.sources=b.sources.slice(2);
 const merge=t=>assembleCandidates([row('a',[a]),row('b',[t])],{now}).items[0].episodes[0].audio;
 assert.equal(merge(b).length,1);assert.equal(merge(b)[0].sources.length,4);
 for(const mutate of [t=>t.cutId='film-cut',t=>t.duration+=1,t=>t.recordingId='another',t=>t.mappingReview.episode=2,t=>delete t.mappingReview]){
  const other=structuredClone(b);mutate(other);assert.equal(merge(other)[0].sources.length,2);
 }
});
test('alias bridges cannot hide contradictory IDs; equal titles with different release IDs stay separate',()=>{
 const a=row('a',[]),b=row('b',[]),c=row('c',[]);b.ids={anilist:10};c.ids={anilist:10,mal:2};
 const conflict=assembleCandidates([a,b,c],{now});assert.equal(conflict.summary.conflicts,1);
 assert.equal(auditAdmission(conflict.items[0],{now,playerSubtitlesReady:true}).passed,false);
 c.ids={anilist:11,mal:2};assert.equal(assembleCandidates([a,c],{now}).items.length,2);
});
test('episode lists are never manufactured from partial providers; contradictory verified manifests are held',()=>{
 const a=row('a',[]),b=row('b',[]);b.releasedEpisodes=[1,2];
 assert.ok(assembleCandidates([a,b],{now}).items[0].assemblyIssues.some(i=>i.code==='conflicting_release_manifests'));
 delete a.releasedEpisodes;delete b.releasedEpisodes;delete a.evidence.releaseManifest;delete b.evidence.releaseManifest;
 const merged=assembleCandidates([a,b],{now}).items[0];assert.equal(merged.releasedEpisodes,undefined);
});
test('same studio alias with whitespace or case differences is not a second Russian dub',()=>{
 const {items}=assembleCandidates([row('a',[track('ru','studio')]),row('b',[track('ru',' STUDIO ')])],{now});
 assert.equal(items[0].episodes[0].audio.length,1);
 assert.ok(auditAdmission(items[0],{now}).issues.some(i=>i.path==='episodes.1.audio.ru'));
});
test('an incomplete extra dub stays in quarantine without invalidating a complete core',()=>{
 const complete=row('complete',[track('ru','a'),track('ru','b'),track('en','en'),track('ja','ja')]);
 const bad=track('ru','extra');bad.sources=[];
 const result=assembleCandidates([complete,row('extra',[bad])],{now}).items[0];
 assert.equal(result.episodes[0].audio.length,4);assert.equal(result.episodes[0].heldAudio.length,1);
 result.evidence.playerDesktop=proof();result.evidence.playerMobile=proof();
 assert.equal(auditAdmission(result,{now,playerSubtitlesReady:true}).passed,true);
});
