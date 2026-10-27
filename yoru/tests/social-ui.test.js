import {test,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {mount as comments} from '../src/social/comments.js';
import {mount as profile} from '../src/social/profile.js';
import {mount as chat} from '../src/social/chat.js';
const uid='00000000-0000-4000-8000-000000000001',room='10000000-0000-4000-8000-000000000001';
const author={user_id:uid,nickname:'Alice',avatar_path:null};
let cleanup,dom;
const pause=()=>new Promise(resolve=>setTimeout(resolve,15));
afterEach(()=>{cleanup?.();cleanup=null;dom?.window.close();});
function environment(user={id:uid}){
 dom=new JSDOM('<main id="root"></main>',{url:'https://example.test/',pretendToBeVisual:true});
 globalThis.document=dom.window.document;globalThis.window=dom.window;globalThis.location=dom.window.location;globalThis.AbortController=dom.window.AbortController;globalThis.matchMedia=()=>({matches:false});
 const calls=[],tables={yoru_comments:[{id:'c1',author_id:uid,author,body:'<script>bad()</script>',parent_id:null,created_at:'2026-10-26T10:00:00Z'}],yoru_public_profiles:{...author,bio:'Hello',history_public:false,stats:{saved:1,lists:6,completed:2,rating:10},email:'must-not-render@test'},yoru_conversations:{id:room,kind:'dm',title:'',owner_id:uid},yoru_chat_members:[{user_id:uid,profile:author}],yoru_messages:[]};
 const client={from(table){const filters=[];let query={then(resolve,reject){calls.push({table,filters});return Promise.resolve({data:tables[table]??[],error:null}).then(resolve,reject);}};for(const name of ['select','eq','is','order','range','limit','maybeSingle','abortSignal','in','or','ilike'])query[name]=(...args)=>{filters.push([name,...args]);return query;};return query;},rpc(name,args){calls.push({rpc:name,args});const q=Promise.resolve({data:name==='yoru_social_history'?tables.history||[]:'created',error:null});q.abortSignal=()=>q;return q;},storage:{from(){return {getPublicUrl:path=>({data:{publicUrl:'https://example.test/'+path}})};}}};
 let logins=0;const ctx={client,user:()=>user,lang:()=> 'ru',login:()=>logins++,active:()=>true,confirm:async()=>true,preferences:()=>({}),title:a=>a.title,cover:()=>'',details:()=>{},card:async()=>null,searchAnime:async()=>[]};
 return {root:document.getElementById('root'),ctx,calls,tables,get logins(){return logins;},setUser:u=>user=u};
}
test('guest reads escaped comments and a submit opens auth without a write',async()=>{
 const e=environment(null);cleanup=comments(e.root,e.ctx,{anime:'mal-1',season:2,episode:3});await pause();
 assert.equal(e.root.querySelector('script'),null);assert.match(e.root.textContent,/<script>bad/);
 const form=e.root.querySelector('form');form.elements.body.value='hello';form.requestSubmit();await pause();assert.equal(e.logins,1);assert.ok(!e.calls.some(c=>c.rpc));
 assert.ok(e.calls[0].filters.some(f=>f[0]==='eq'&&f[1]==='episode'&&f[2]===3));
});
test('registered reply/edit form sends exact current episode and owned ID',async()=>{
 const e=environment();cleanup=comments(e.root,e.ctx,{anime:'mal-5',season:3,episode:9});await pause();
 e.root.querySelector('[data-reply]').click();let form=e.root.querySelector('form');form.elements.body.value='Reply';form.requestSubmit();await pause();
 assert.deepEqual(e.calls.find(c=>c.rpc==='yoru_social_comment').args,{p_anime:'mal-5',p_season:3,p_episode:9,p_body:'Reply',p_parent:'c1'});
 e.root.querySelector('[data-edit]').click();form.elements.body.value='Edited';form.requestSubmit();await pause();assert.equal(e.calls.find(c=>c.rpc==='yoru_social_edit_comment').args.p_id,'c1');
});
test('public profile renders four stats and never renders an email even if supplied',async()=>{
 const e=environment(null);cleanup=profile(e.root,e.ctx,uid);await pause();
 assert.equal(e.root.querySelectorAll('.social-stats>div').length,4);assert.ok(!e.root.textContent.includes('must-not-render'));assert.equal(e.root.querySelector('[data-edit]'),null);
 e.root.querySelector('[data-friend]').click();await pause();assert.equal(e.logins,1);assert.ok(!e.calls.some(c=>c.rpc));
});
test('chat is guest-gated with zero message or membership requests',async()=>{
 const e=environment(null);cleanup=chat(e.root,e.ctx,room);await pause();assert.equal(e.calls.length,0);assert.equal(e.logins,1);assert.ok(!e.root.querySelector('textarea'));
});
test('chat sends an idempotency key and only an anime ID, not catalogue data',async()=>{
 const e=environment();cleanup=chat(e.root,e.ctx,room);await pause();
 const form=e.root.querySelector('.social-compose');form.elements.body.value='hello';form.requestSubmit();await pause();const sent=e.calls.find(c=>c.rpc==='yoru_social_message');assert.equal(sent.args.p_room,room);assert.equal(sent.args.p_body,'hello');assert.match(sent.args.p_id,/^[0-9a-f-]{36}$/);assert.equal(sent.args.p_anime,null);
});
test('changing account stops a pending public/profile response from repainting',async()=>{
 const e=environment();let resolve;e.ctx.client.from=()=>{const q={then:r=>new Promise(done=>resolve=()=>done({data:e.tables.yoru_public_profiles})).then(r)};for(const n of ['select','eq','maybeSingle','abortSignal'])q[n]=()=>q;return q;};
 cleanup=profile(e.root,e.ctx,uid);await pause();e.setUser({id:'another'});resolve();await pause();assert.ok(!e.root.querySelector('.social-stats'));
});

test('desktop Enter sends, while Shift+Enter, IME and mobile Enter keep composing',async()=>{
 const e=environment();cleanup=comments(e.root,e.ctx,{anime:'mal-1',season:1,episode:1});await pause();const input=e.root.querySelector('textarea');input.value='Desktop';globalThis.matchMedia=()=>({matches:true});
 const key=options=>input.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true,...options}));
 key({shiftKey:true});key({isComposing:true});await pause();assert.ok(!e.calls.some(c=>c.rpc));
 key({});await pause();assert.equal(e.calls.filter(c=>c.rpc==='yoru_social_comment').length,1);
 globalThis.matchMedia=()=>({matches:false});input.value='Mobile';key({});await pause();assert.equal(e.calls.filter(c=>c.rpc==='yoru_social_comment').length,1);
 e.root.querySelector('[data-send]').click();await pause();assert.equal(e.calls.filter(c=>c.rpc==='yoru_social_comment').length,2);
});
test('visitor history contains art, title and date but no episode or timestamp',async()=>{
 const e=environment(null);e.tables.yoru_public_profiles.history_public=true;e.tables.history=[{anime_id:'mal-1',watched_date:'2026-10-27',season:99,episode:999,watched_at:'12:34:56'}];e.ctx.card=async()=>({title:'Example'});e.ctx.cover=()=>'/poster.jpg';cleanup=profile(e.root,e.ctx,uid);await pause();await pause();
 const box=e.root.querySelector('[data-history]');assert.ok(box.querySelector('img'));assert.match(box.textContent,/Example/);assert.doesNotMatch(box.textContent,/99|12:34|Серия|Сезон/);
});
test('own public profile opens the main editor instead of a second settings form',async()=>{
 const e=environment();cleanup=profile(e.root,e.ctx,uid);await pause();assert.ok(e.root.querySelector('a[href="#profile"]'));assert.equal(e.root.querySelector('form'),null);
});

test('a temporary profile sync failure keeps the existing profile readable',async()=>{
 const e=environment();e.ctx.profileReady=()=>true;e.ctx.client.rpc=async()=>({error:new Error('Failed to fetch')});cleanup=profile(e.root,e.ctx,uid);await pause();await pause();assert.equal(e.root.querySelectorAll('.social-stats>div').length,4);assert.ok(e.root.querySelector('a[href="#profile"]'));assert.ok(e.root.querySelector('[data-status]').textContent);
});

test('chats show conversations and friends without community tabs or public-profile settings',async()=>{
 const {mount}=await import('../src/social/community.js');const e=environment(),peer={user_id:'00000000-0000-4000-8000-000000000002',nickname:'Bob'};
 e.tables.yoru_chat_members=[];e.tables.yoru_friendships=[{status:'accepted',requester:uid,recipient:peer.user_id,to:peer,from:author}];
 cleanup=mount(e.root,e.ctx,'chats');await pause();assert.match(e.root.querySelector('h1').textContent,/Чаты/);assert.equal(e.root.querySelector('[data-tab]'),null);assert.equal(e.root.querySelector('a[href^="#user/"]')?.textContent,'BBob');assert.ok(e.root.querySelector('[data-dm]'));assert.doesNotMatch(e.root.textContent,/Сообщество|Публичный профиль|Найти пользователя/);
 e.root.querySelector('[data-group]').click();await pause();const form=e.root.querySelector('[data-group-form] form');form.elements.title.value='Night';form.querySelector('input[name=members]').checked=true;form.querySelector('button').click();await pause();
 const request=e.calls.find(x=>x.rpc==='yoru_social_room');assert.deepEqual(request.args,{p_users:[peer.user_id],p_title:'Night'});assert.equal(location.hash,'#chat/created');
});
test('comment heading is generic but queries still isolate the episode',async()=>{
 const e=environment(null);cleanup=comments(e.root,e.ctx,{anime:'mal-3',season:2,episode:13});await pause();assert.equal(e.root.querySelector('h2').textContent,'Комментарии');assert.ok(e.calls[0].filters.some(f=>f[0]==='eq'&&f[1]==='episode'&&f[2]===13));
});
test('phone chat viewport follows keyboard height and cleans up on navigation',async()=>{
 const {chatViewport}=await import('../src/social/chat-viewport.js');const e=environment();const viewport=new dom.window.EventTarget();viewport.height=400;viewport.offsetTop=50;Object.defineProperty(dom.window,'visualViewport',{value:viewport});cleanup=chatViewport(e.root,dom.window);
 assert.equal(e.root.style.getPropertyValue('--chat-height'),'400px');assert.ok(document.body.classList.contains('chat-open'));viewport.height=700;viewport.dispatchEvent(new dom.window.Event('resize'));await new Promise(r=>setTimeout(r,30));assert.equal(e.root.style.getPropertyValue('--chat-height'),'700px');cleanup();cleanup=null;assert.ok(!document.body.classList.contains('chat-open'));
});
test('notification badge counts rooms rather than messages and stops after account switch',async()=>{
 const {start}=await import('../src/social/notifications.js');const e=environment();Object.defineProperty(document,'hidden',{value:false,configurable:true});let calls=0;const counts=[];e.ctx.client.rpc=()=>{calls++;const q=Promise.resolve({data:[{room_id:'a'},{room_id:'a'},{room_id:'b'}]});q.abortSignal=()=>q;return q;};cleanup=start(e.ctx,n=>counts.push(n));await pause();assert.deepEqual(counts,[2]);e.setUser({id:'another'});document.dispatchEvent(new dom.window.Event('yomiku:chat-read'));await pause();assert.equal(calls,1);
});

test('comment pagination requests ten and appends by cursor; deletion leaves no tombstone',async()=>{
 const e=environment();e.tables.yoru_comments=Array.from({length:10},(_,i)=>({id:'c'+i,author_id:uid,author,body:'Comment '+i,created_at:'2026-10-27T10:00:00Z'}));cleanup=comments(e.root,e.ctx,{anime:'mal-1',season:1,episode:1});await pause();assert.equal(e.root.querySelectorAll('[data-comment]').length,10);assert.ok(e.calls[0].filters.some(f=>f[0]==='limit'&&f[1]===10));e.tables.yoru_comments=[{id:'c10',author_id:uid,author,body:'Next',created_at:'2026-10-27T11:00:00Z'}];e.root.querySelector('[data-more]').click();await pause();assert.equal(e.root.querySelectorAll('[data-comment]').length,11);assert.ok(e.calls.some(c=>c.filters?.some(f=>f[0]==='or'&&f[1].includes('id.gt.c9'))));e.root.querySelector('[data-remove="c0"]').click();await pause();assert.equal(e.root.querySelector('[data-comment="c0"]'),null);assert.doesNotMatch(e.root.textContent,/Комментарий удалён/);
});
