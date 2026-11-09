import {test} from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';
import {unreadCounts,paintUnread} from '../src/social/unread-counts.js';import {photoViewer} from '../src/social/photo-viewer.js';
test('unread counts exclude own messages, respect timestamp/id cursor and never fetch message bodies',async()=>{
 const calls=[];const cursor={room_id:'r1',last_read_at:'2026-11-09T01:00:00+00:00',last_read_id:'00000000-0000-4000-8000-000000000001'};
 function query(table,data){const args=[];const q={then(resolve,reject){calls.push({table,args});return Promise.resolve(table==='yoru_messages'?{count:237,error:null}:{data,error:null}).then(resolve,reject);}};for(const k of ['select','eq','neq','in','or','abortSignal'])q[k]=(...v)=>{args.push([k,...v]);return q;};return q;}
 const client={rpc:()=>query('rpc',[{room_id:'r1'},{room_id:'r1'},{room_id:'other'}]),from:table=>query(table,[cursor])};
 const counts=await unreadCounts({client,user:()=>({id:'self'})},{live:()=>true,signal:new AbortController().signal},['r1','r2']);assert.deepEqual([...counts],[['r1',237]]);
 const request=calls.find(c=>c.table==='yoru_messages');assert.deepEqual(request.args.find(a=>a[0]==='select'),['select','id',{count:'exact',head:true}]);assert.deepEqual(request.args.find(a=>a[0]==='neq'),['neq','author_id','self']);assert.match(request.args.find(a=>a[0]==='or')[1],/id.gt.00000000/);assert.equal(calls.filter(c=>c.table==='yoru_messages').length,1);
 const dom=new JSDOM('<span data-room-unread="r1"></span><span data-room-unread="r2"></span>');paintUnread(dom.window.document,counts,'ru');assert.equal(dom.window.document.querySelector('[data-room-unread=r1]').textContent,'237');assert.ok(dom.window.document.querySelector('[data-room-unread=r2]').hidden);paintUnread(dom.window.document,new Map(),'ru');assert.ok(dom.window.document.querySelector('[data-room-unread=r1]').hidden);dom.window.close();
});
test('photo viewer closes with Escape, restores focus, and discards a late signed URL after navigation',async()=>{
 const dom=new JSDOM('<div id="root"><button data-open-photo="m"><img alt="Photo"></button></div>',{url:'https://example.test/'}),doc=dom.window.document,controller=new dom.window.AbortController();
 dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};dom.window.HTMLDialogElement.prototype.close=function(){this.open=false;};
 let resolve;photoViewer(doc.querySelector('#root'),{signal:controller.signal,resolve:()=>new Promise(r=>resolve=r)});const b=doc.querySelector('button');b.click();resolve('https://example.test/signed.jpg');await Promise.resolve();assert.equal(doc.querySelector('dialog img').src,'https://example.test/signed.jpg');
 doc.querySelector('dialog').dispatchEvent(new dom.window.Event('cancel',{cancelable:true}));assert.equal(doc.querySelector('dialog'),null);assert.equal(doc.activeElement,b);
 b.click();controller.abort();resolve('https://example.test/late.jpg');await Promise.resolve();assert.equal(doc.querySelector('dialog'),null);dom.window.close();
});
