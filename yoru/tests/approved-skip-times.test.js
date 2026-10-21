import test from 'node:test';
import assert from 'node:assert/strict';
import {approvedSkipTimes} from '../src/approved-skip-times.js';
import {subtitleOffers,inspectVtt} from '../src/subtitle-intake.js';
test('reviewed skips are used only with the matching duration and valid bounds',()=>{
 const info={duration:1400,opening:{start:20,end:110,review:{passed:true}},ending:{absent:true,review:{passed:true}}};
 assert.equal(approvedSkipTimes(info,1400.4).opening.end,110);
 assert.deepEqual(approvedSkipTimes(info,1430),{opening:null,ending:null});
 info.opening.review.passed=false;assert.equal(approvedSkipTimes(info,1400).opening,null);
 info.opening.review.passed=true;info.opening.end=1500;assert.equal(approvedSkipTimes(info,1400).opening,null);
 assert.equal(approvedSkipTimes(info,NaN).ending,null);
});
test('subtitle intake notices mislabeled languages, rejects signs-only and never certifies synchronization',()=>{
 const offers=subtitleOffers([{lang:'en',label:'Russian',src:'https://example.test/ru.vtt'},
  {lang:'en',label:'Japanese (SDH)',src:'https://example.test/ja.vtt'},
  {lang:'en',label:'English (Japanese - [Signs/Songs])',src:'https://example.test/signs.vtt'},
  {lang:'en',label:'French',src:'https://example.test/fr.vtt'}]);
 assert.deepEqual(offers.map(o=>o.language),['ru','ja']);assert.ok(offers.every(o=>o.languageConflict&&!o.verified));
 const file='WEBVTT\n\n00:01.000 --> 00:03.000\nПроверяем русский текст субтитров.\n';
 const result=inspectVtt(file,'ru');assert.equal(result.valid,true);assert.equal(result.languageSupported,true);assert.equal(result.synchronizationVerified,false);
 assert.equal(inspectVtt(file,'ja').languageSupported,false);
 assert.equal(inspectVtt(file.replace('00:03.000','00:00.000'),'ru').valid,false);
});
