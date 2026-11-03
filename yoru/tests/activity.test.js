import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createWatchClock} from '../src/activity/watch-clock.js';
import {activityStore} from '../src/activity/store.js';
import {deliveryState,roomRealtime} from '../src/social/realtime.js';
import {badges,watchLabel} from '../src/activity/badges.js';
test('watch clock counts real elapsed playback, excludes pauses, seeks, buffers and long hidden gaps',()=>{
 let now=0,total=0;const clock=createWatchClock({now:()=>now,credit:s=>total+=s});
 const sample=(time,active=true,rate=1,key='episode')=>clock.sample({time,active,rate,key});
 sample(0);now=1000;sample(1);assert.equal(total,1);
 now=2000;sample(2,false);now=3000;sample(2,false);assert.equal(total,1);
 now=4000;sample(2);now=5000;sample(100);assert.equal(total,1);
 now=6000;sample(101);assert.equal(total,2);
 now=7000;sample(101);assert.equal(total,2);
 now=90000;sample(200);assert.equal(total,2);
 clock.reset();now=91000;sample(200);now=92000;sample(202,true,2);assert.equal(total,3);
 now=93000;sample(0,true,1,'other');assert.equal(total,3);
});
function storage(){const m=new Map();return {get length(){return m.size;},key:i=>[...m.keys()][i],getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};}
test('activity cache isolates users, retains offline seconds and merges tabs without overwriting',()=>{
 const disk=storage(),a=activityStore(disk,'alice','tab1'),b=activityStore(disk,'alice','tab2'),other=activityStore(disk,'bob','tab');
 a.credit(30.5,true);a.save();b.credit(10.5,false);b.save();assert.equal(a.total(),40);assert.equal(other.total(),0);
 a.accept({seconds:30,badges:{first:'date'}},'tab1',30);assert.equal(a.total(),40);
 b.accept({seconds:20,badges:{}},'tab2',10);assert.equal(b.snapshot.seconds,30);assert.ok(b.snapshot.badges.first);
 a.credit(5,false);a.save();const resumed=activityStore(disk,'alice','new');assert.equal(resumed.total(),35);assert.equal(resumed.dirty()[0][1].seconds,35.5);
 resumed.accept({seconds:35,badges:{}},'tab1',35);a.credit(2,false);a.save();assert.equal(a.dirty()[0][1].acked,35);
});
test('denied storage never breaks watch tracking and badges are bounded/localized',()=>{
 const disk={getItem(){throw Error();},setItem(){throw Error();}},a=activityStore(disk,'a','s');a.credit(3,false);a.save();assert.equal(a.total(),3);assert.equal(a.dirty().length,1);
 assert.equal(badges.length,18);assert.equal(new Set(badges.map(b=>b[0])).size,18);assert.match(watchLabel(3661,'ru'),/1 ч 1 мин/);
});
test('read receipts compare actual dates and IDs; group read requires all peers',()=>{
 const m={id:'b',created_at:'2026-11-03T10:00:00Z'};const peer={user_id:'b',last_read_at:'2026-11-03T12:00:00+02:00',last_read_id:'b'};
 assert.equal(deliveryState(m,[peer],'a'),'read');assert.equal(deliveryState(m,[{...peer,last_read_id:'a'}],'a'),'sent');assert.equal(deliveryState(m,[peer,{user_id:'c'}],'a'),'sent');assert.equal(deliveryState({...m,_delivery:'sending'},[peer],'a'),'sending');
});
test('room channels are private, send only presence and dispose on hidden page/navigation',()=>{
 const doc=new EventTarget();doc.hidden=false;let removed=0,tracked=[],options,handlers={},subscription;const hints=[],typing=[];
 const channel={on(type,filter,fn){handlers[type+filter.event]=fn;return this;},subscribe(fn){subscription=fn;return this;},track:async p=>tracked.push(p),presenceState:()=>({b:[{user_id:'b',typing_until:Date.now()+2000}]})};
 const ctx={user:()=>({id:'a'}),client:{channel(name,o){options=o;return channel;},removeChannel:async()=>removed++}};
 const rt=roomRealtime(ctx,'room',{live:()=>true,onMessage:id=>hints.push(id),onRead:()=>{},onTyping:p=>typing.push(p),onReady:()=>{}},doc);
 subscription('SUBSCRIBED');assert.equal(options.config.private,true);rt.typing(true);assert.equal(tracked.length,1);
 handlers.presencesync();assert.deepEqual(typing.at(-1),['b']);handlers.broadcastmessage({payload:{id:'00000000-0000-4000-8000-000000000001',body:'untrusted'}});assert.equal(hints.at(-1),'00000000-0000-4000-8000-000000000001');
 doc.hidden=true;doc.dispatchEvent(new Event('visibilitychange'));assert.equal(removed,1);rt.typing(true);assert.equal(tracked.length,1);rt.dispose();assert.equal(removed,1);
});

test('media observer stops on buffering, pause, scroll, hidden tab, account loss and video replacement',async()=>{
 const {JSDOM}=await import('jsdom'),{observeWatch}=await import('../src/activity/watch-clock.js');const dom=new JSDOM('<video id="video"></video>',{pretendToBeVisual:true});const doc=dom.window.document,win=dom.window;
 const original={interval:globalThis.setInterval,clear:globalThis.clearInterval,performance:globalThis.performance,AbortController:globalThis.AbortController};let tick,now=0,total=0,hidden=false,uid='a',state={time:0,paused:false,ready:4};
 globalThis.setInterval=fn=>(tick=fn,1);globalThis.clearInterval=()=>{};globalThis.performance={now:()=>now};globalThis.AbortController=win.AbortController;
 Object.defineProperty(doc,'hidden',{get:()=>hidden});doc.hasFocus=()=>true;
 const video=doc.querySelector('video');Object.defineProperties(video,{paused:{get:()=>state.paused},readyState:{get:()=>state.ready},currentTime:{get:()=>state.time}});video.getBoundingClientRect=()=>({top:0,bottom:300,width:500,height:300});
 let stop;try{stop=observeWatch({doc,win,identity:()=>uid,context:()=>({ready:true,key:'ep'}),credit:n=>total+=n});const step=()=>{now+=500;state.time+=.5;tick();};step();assert.equal(total,.5);
  video.dispatchEvent(new win.Event('waiting'));step();step();assert.equal(total,.5);
  video.dispatchEvent(new win.Event('playing'));step();step();assert.equal(total,1);
  state.paused=true;video.dispatchEvent(new win.Event('pause'));step();step();assert.equal(total,1);
  state.paused=false;video.dispatchEvent(new win.Event('playing'));step();step();assert.equal(total,1.5);
  doc.dispatchEvent(new win.Event('scroll'));now+=100;state.time+=.1;tick();step();assert.equal(total,1.5);step();assert.equal(total,2);
  hidden=true;doc.dispatchEvent(new win.Event('visibilitychange'));step();step();assert.equal(total,2);
  hidden=false;doc.dispatchEvent(new win.Event('visibilitychange'));step();step();assert.equal(total,2.5);
  uid=null;step();step();assert.equal(total,2.5);uid='a';video.remove();step();assert.equal(total,2.5);
 }finally{stop?.();globalThis.setInterval=original.interval;globalThis.clearInterval=original.clear;globalThis.performance=original.performance;globalThis.AbortController=original.AbortController;dom.window.close();}
});
