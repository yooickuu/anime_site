import test from 'node:test';
import assert from 'node:assert/strict';
import {defaults} from '../src/state.js';
import {applyGuestPlaybackOperation as apply} from '../src/guest-playback.js';
test('guests can adjust all playback settings without account operations',()=>{
 const original=defaults();
 const next=apply(original,{type:'preferences',patch:{speed:1.5,quality:720,audio:'go-1',autoSkip:true,autoNext:false,autoPlay:true}});
 assert.equal(next.preferences.speed,1.5);assert.equal(next.preferences.quality,720);
 assert.equal(next.preferences.autoSkip,true);assert.equal(next.preferences.autoNext,false);
 assert.equal(original.preferences.speed,1);
});
test('guest playback remembers a position in memory, with a clean state after reset',()=>{
 const next=apply(defaults(),{type:'progress',key:'a:1',value:{id:'a',episode:1,time:120,duration:1440}});
 assert.equal(next.progress['a:1'].time,120);
 assert.deepEqual(defaults().progress,{});
});
test('guest playback cannot mutate account details, lists, ratings or profile assets',()=>{
 for(const op of [{type:'entry',id:'a',patch:{rating:9}},{type:'createStatus',name:'test'},
  {type:'preferences',patch:{name:'test'}},{type:'preferences',patch:{avatar:'private/path'}},
  {type:'preferences',patch:{autoSkip:true,banner:'private/path'}}])assert.equal(apply(defaults(),op),null);
});
