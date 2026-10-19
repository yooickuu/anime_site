import test from 'node:test';
import assert from 'node:assert/strict';
import {eveningPlan} from '../src/evening-plan.js';
import {normalizeStyle,styles} from '../src/appearance.js';
const title={id:'a',episodes:12,type:'TV'};
test('plan uses remaining time and offers only whole episodes inside the budget',()=>{
 const state={entries:{a:{status:'watching'}},progress:{a:{id:'a',episode:3,duration:1500,time:1200,updated:2}}};
 const [p]=eveningPlan(state,()=>title,30);assert.equal(p.start,3);assert.equal(p.count,2);assert.equal(p.minutes,30);assert.equal(p.estimated,true);
 const [short]=eveningPlan(state,()=>title,15);assert.equal(short.count,1);assert.equal(short.minutes,5);assert.equal(short.estimated,false);
});
test('plan excludes completed, dropped, unavailable and unknown-length movies',()=>{
 for(const status of ['completed','dropped'])assert.deepEqual(eveningPlan({entries:{a:{status}}},()=>title,60),[]);
 for(const a of [{...title,catalogOnly:true},{...title,blocked:true},{...title,type:'MOVIE',episodes:1}])assert.deepEqual(eveningPlan({entries:{a:{status:'planned'}}},()=>a,120),[]);
 assert.deepEqual(eveningPlan({progress:{a:{id:'a',episode:12,completed:true}}},()=>title,60),[]);
});
test('plan chooses newest progress, preserves episode numbering and labels estimates',()=>{
 const state={progress:{old:{id:'a',episode:1,updated:1},new:{id:'a',episode:2,completed:true,updated:3}}};
 const [p]=eveningPlan(state,()=>({...title,episodeNumbers:[100,101,102,103]}),30);assert.equal(p.start,3);assert.equal(p.ordinal,102);assert.equal(p.estimated,true);
});
test('legacy and unsupported appearances migrate to dark graphite',()=>{
 for(const value of ['light','dark','invalid',null])assert.equal(normalizeStyle(value),'graphite');
 for(const value of styles)assert.equal(normalizeStyle(value),value);
});
test('plan never includes episodes beyond the available manifest',()=>{
 const state={progress:{a:{id:'a',episode:2,duration:1440,time:500,updated:1}}};
 const [p]=eveningPlan(state,()=>({...title,episodes:24,episodeNumbers:[1,2]}),90);assert.equal(p.count,1);
 state.progress.a.completed=true;assert.deepEqual(eveningPlan(state,()=>({...title,episodes:24,episodeNumbers:[1,2]}),90),[]);
});
