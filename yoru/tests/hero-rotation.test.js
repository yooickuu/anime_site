import test from 'node:test';
import assert from 'node:assert/strict';
import {nextHero,within,fadeHero} from '../src/hero-rotation.js';
import {scheduledHeroes,PROMO_PERIOD,PROMO_EPOCH} from '../src/hero-rotation.js';
import {readFile} from 'node:fs/promises';
test('two disjoint groups alternate every 48 hours and repeat after four days',()=>{
 const items=Array.from({length:20},(_,id)=>({id}));
 const first=scheduledHeroes(items,PROMO_EPOCH),second=scheduledHeroes(items,PROMO_EPOCH+PROMO_PERIOD);
 assert.equal(first.length,10);assert.equal(second.length,10);
 assert.equal(new Set([...first,...second].map(x=>x.id)).size,20);
 assert.deepEqual(scheduledHeroes(items,PROMO_EPOCH+PROMO_PERIOD-1),first);
 assert.deepEqual(scheduledHeroes(items,PROMO_EPOCH+PROMO_PERIOD*2-1),second);
 assert.deepEqual(scheduledHeroes(items,PROMO_EPOCH+PROMO_PERIOD*2),first);
 // The same instant has one schedule regardless of the browser's timezone.
 assert.deepEqual(scheduledHeroes(items,Date.parse('2026-10-31T00:00:00+05:00')),scheduledHeroes(items,Date.parse('2026-10-30T19:00:00Z')));
});
test('duplicate IDs cannot enter separate rotations and small collections remain usable',()=>{
 const items=Array.from({length:10},(_,id)=>({id}));
 assert.equal(scheduledHeroes([...items,...items],PROMO_EPOCH+PROMO_PERIOD).length,10);
 assert.deepEqual(scheduledHeroes([],PROMO_EPOCH),[]);
});
test('published promo configuration has exactly twenty distinct cards and local landscape assets',async()=>{
 const slides=JSON.parse(await readFile(new URL('../src/promo.json',import.meta.url)));
 assert.equal(slides.length,20);assert.equal(new Set(slides.map(a=>a.id)).size,20);
 assert.equal(new Set(slides.map(a=>a.ids.mal)).size,20);
 for(const a of slides){
  assert.equal(a.heroWidth,1920);assert.equal(a.heroHeight,1000);
  assert.ok(Math.abs(a.heroWidth/a.heroHeight-1.92)<.01);
  for(const path of [a.hero,a.heroMobile])assert.ok((await readFile(new URL('../dist/'+path,import.meta.url))).length>0);
 }
});
test('carousel visits all ten slides and wraps to the first',async()=>{
 const pool=Array.from({length:10},(_,id)=>({id}));let index=0;const seen=[];
 for(let n=0;n<10;n++){const next=await nextHero(pool,index,1,async()=>{});index=next.index;seen.push(index);}
 assert.deepEqual(seen,[1,2,3,4,5,6,7,8,9,0]);
});
test('a failed image does not prevent later slides appearing',async()=>{
 const next=await nextHero([0,1,2,3],1,1,async item=>{if(item===2)throw Error('decode failed');});
 assert.equal(next.index,3);
});
test('a never-resolving decode is bounded',async()=>{
 await assert.rejects(within(new Promise(()=>{}),10),/timed out/);
});
test('suspended Safari animation does not hold carousel and gets removed',async()=>{
 let removed=false;const result=fadeHero({remove(){removed=true;},animate(){return {finished:new Promise(()=>{})};}},0);
 assert.equal(result,undefined);
 await new Promise(resolve=>setTimeout(resolve,120));assert.equal(removed,true);
});
