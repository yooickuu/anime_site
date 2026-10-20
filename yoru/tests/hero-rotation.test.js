import test from 'node:test';
import assert from 'node:assert/strict';
import {nextHero,within,fadeHero} from '../src/hero-rotation.js';
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
