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
 globalThis.document=dom.window.document;globalThis.window=dom.window;globalThis.location=dom.window.location;globalThis.AbortController=dom.window.AbortController;
 const calls=[],tables={yoru_comments:[{id:'c1',author_id:uid,author,body:'<script>bad()</script>',parent_id:null,created_at:'2026-10-26T10:00:00Z'}],yoru_public_profiles:{...author,bio:'Hello',history_public:false,stats:{saved:1,lists:6,completed:2,rating:10},email:'must-not-render@test'},yoru_conversations:{id:room,kind:'dm',title:'',owner_id:uid},yoru_chat_members:[{user_id:uid,profile:author}],yoru_messages:[]};
 const client={from(table){const filters=[];let query={then(resolve,reject){calls.push({table,filters});return Promise.resolve({data:tables[table]??[],error:null}).then(resolve,reject);}};for(const name of ['select','eq','is','order','range','limit','maybeSingle','abortSignal','in','or','ilike'])query[name]=(...args)=>{filters.push([name,...args]);return query;};return query;},async rpc(name,args){calls.push({rpc:name,args});return {data:'created',error:null};},storage:{from(){return {getPublicUrl:path=>({data:{publicUrl:'https://example.test/'+path}})};}}};
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
