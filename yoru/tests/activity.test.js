import {test} from 'node:test';
import assert from 'node:assert/strict';
import {deliveryState,roomRealtime} from '../src/social/realtime.js';
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
