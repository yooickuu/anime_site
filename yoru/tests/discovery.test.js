import test from 'node:test';
import assert from 'node:assert/strict';
import {discoveryChoice,watchRoute,audioChoices} from '../src/discovery.js';
import {compatibleSkipTimes,automaticSkipTimes} from '../src/autoskip.js';

test('watch URLs survive refresh and reject malformed episode numbers',()=>{
 for(const id of ['mal-52991','lib-9542','vost-4038','kitsu-100','sintel'])assert.deepEqual(watchRoute(`#watch/${id}/2`),{id,episode:2});
 for(const hash of ['#home','#watch/mal-1/0','#watch/mal-1/-1','#watch/mal-1/Infinity','#watch/mal-1/999999999999999999','#watch/unknown/1','#watch/mal-1/1/x'])assert.equal(watchRoute(hash),null);
});
test('discovery avoids repeats, finished/dropped titles and metadata-only results',()=>{
 const items=['seen','finished','dropped','new','new','blocked','metadata'].map(id=>({id,blocked:id==='blocked',catalogOnly:id==='metadata'}));
 const entries={finished:{status:'completed'},dropped:{status:'dropped'}};
 for(const random of [0,.2,.99])assert.equal(discoveryChoice(items,entries,['seen'],()=>random).id,'new');
 assert.equal(discoveryChoice([{id:'seen'}],{},['seen']),null);
 assert.equal(discoveryChoice([]),null);
});
test('planned anime receives three slots while duplicate IDs receive one',()=>{
 const items=[{id:'planned'},{id:'new'},{id:'new'}],entries={planned:{status:'planned'}};
 assert.equal(discoveryChoice(items,entries,[],()=>.70).id,'planned');
 assert.equal(discoveryChoice(items,entries,[],()=>.80).id,'new');
});
test('audio menu includes only connected audio providers',()=>{
 assert.deepEqual(audioChoices({}),[]);
 assert.deepEqual(audioChoices({providerId:1}).map(a=>a.id),['liberty']);
 assert.deepEqual(audioChoices({providerId:1,animeVostId:2}).map(a=>[a.id,a.language]),[['liberty','ru'],['vost','ru']]);
});
test('automatic skips reject other cuts and malformed intervals',()=>{
 const row=(skipType,start,end,episodeLength=1440)=>({skipType,interval:{startTime:start,endTime:end},episodeLength});
 assert.deepEqual(compatibleSkipTimes({results:[row('op',10,100),row('ed',1350,1440)]},1440),{opening:{start:10,end:100},ending:{start:1350,end:1440}});
 for(const r of [row('op',0,90,1500),row('op',-1,90),row('op',100,10),row('ed',1400,1600),row('recap',0,90)])assert.deepEqual(compatibleSkipTimes({results:[r]},1440),{opening:null,ending:null});
 assert.deepEqual(compatibleSkipTimes({results:[row('op',0,90)]},NaN),{opening:null,ending:null});
});
test('skip API caches metadata but revalidates each audio cut duration',async()=>{
 const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async url=>{calls++;const u=new URL(url);assert.deepEqual(u.searchParams.getAll('types'),['op','ed']);assert.ok(Number(u.searchParams.get('episodeLength'))>0);return {ok:true,json:async()=>({results:[{skipType:'op',episodeLength:1440,interval:{startTime:10,endTime:100}}]})};};
 try{
  assert.deepEqual((await automaticSkipTimes(999901,1,1440)).opening,{start:10,end:100});
  assert.equal((await automaticSkipTimes(999901,1,1500)).opening,null);
  await automaticSkipTimes(999901,1,1440);
  assert.equal(calls,2);
 }finally{globalThis.fetch=original;}
});
