import test from 'node:test';
import assert from 'node:assert/strict';
import {soundPreferences,preferredAudio,resumeTime} from '../src/playback-preferences.js';
import {defaults,applyOperation,normalize} from '../src/state.js';

test('player preferences survive saved account roundtrip, independently of lists/history',()=>{
 const state=applyOperation(defaults(),{type:'preferences',patch:{volume:.35,muted:true,speed:1.25,quality:1080,audio:'dub-b',audioByAnime:{a:'dub-a',b:'dub-b'}}});
 const restored=normalize(JSON.parse(JSON.stringify(state)));
 assert.deepEqual(soundPreferences(restored.preferences),{volume:.35,muted:true});
 assert.equal(restored.preferences.speed,1.25);
 assert.equal(restored.preferences.quality,1080);
 const choices=[{id:'dub-b'},{id:'dub-a'}];
 assert.equal(preferredAudio(choices,restored.preferences,'a'),'dub-a');
 assert.equal(preferredAudio(choices,restored.preferences,'b'),'dub-b');
 assert.equal(preferredAudio([{id:'available'}],restored.preferences,'a'),'available');
 assert.deepEqual(restored.entries,{});
 assert.deepEqual(restored.progress,{});
});
test('sound settings tolerate old accounts, silence and invalid values',()=>{
 assert.deepEqual(soundPreferences(),{volume:1,muted:false});
 assert.equal(soundPreferences({volume:0}).volume,0);
 assert.equal(soundPreferences({volume:5}).volume,1);
 assert.equal(soundPreferences({volume:-1}).volume,0);
 assert.equal(soundPreferences({volume:'bad'}).volume,1);
});
test('only signed-in viewers resume history; changing quality/audio retains exact transient position for everyone',()=>{
 const saved={time:123.456,completed:false};
 assert.equal(resumeTime(saved,true),123.456);
 assert.equal(resumeTime(saved,false),0);
 assert.equal(resumeTime({...saved,completed:true},true),0);
 for(const user of [true,false]){
   assert.equal(resumeTime(saved,user,75.25),75.25);
   assert.equal(resumeTime(saved,user,0),0);
 }
 assert.equal(resumeTime({time:NaN},true),0);
});
