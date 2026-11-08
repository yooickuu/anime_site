import {historyAgo} from '../src/history-display.js';
import {test} from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';import {recentHistory,HISTORY_AGE} from '../src/profile-history.js';import {receiptText} from '../src/social/realtime.js';import {swipeReply} from '../src/social/swipe-reply.js';
test('history keeps last 14 days, deduplicates titles and leaves resume/completion data untouched',()=>{
 const now=Date.now(),progress={old:{id:'mal-1',updated:now-HISTORY_AGE,completed:true,time:500},one:{id:'mal-2',episode:1,updated:now-1000},two:{id:'mal-2',episode:2,updated:now-500},other:{id:'mal-3',updated:now-2000},demo:{id:'sintel',updated:now}};const frozen=JSON.stringify(progress);for(const p of Object.values(progress))Object.freeze(p);Object.freeze(progress);
 assert.deepEqual(recentHistory(progress,now).map(p=>[p.id,p.episode]),[['mal-2',2],['mal-3',undefined]]);assert.equal(JSON.stringify(progress),frozen);assert.equal(recentHistory(progress,now+HISTORY_AGE).length,0);
});
test('receipts use actual seen time and never mistake send time for read time',()=>{
 const now=Date.parse('2026-11-03T12:00:00Z'),m={id:'b',created_at:'2026-11-03T08:00:00Z'},peer={user_id:'other',last_read_id:'b',last_read_at:m.created_at,last_seen_at:'2026-11-03T11:57:00Z'};
 assert.equal(receiptText(m,[peer],'me','ru',{now}),'Просмотрено 3 мин назад');assert.equal(receiptText(m,[{...peer,last_seen_at:null}],'me','ru',{now}),'Просмотрено');assert.equal(receiptText(m,[peer],'me','ru',{now,unanswered:false}),'Просмотрено');assert.equal(receiptText(m,[{...peer,last_read_at:null}],'me','ru',{now}),'Отправлено');assert.equal(receiptText(m,[{...peer,last_seen_at:'2026-11-03T10:00:00Z'}],'me','ru',{now}),'Просмотрено 2 ч назад');
});
test('reply gesture ignores vertical scrolling, cancels taps after swipes and offers keyboard reply',()=>{
 const dom=new JSDOM('<div id="root"><article data-message="one" tabindex="0"><div class="social-bubble">text</div></article></div>'),root=dom.window.document.querySelector('#root'),node=root.querySelector('article'),controller=new dom.window.AbortController(),calls=[];swipeReply(root,id=>calls.push(id),controller.signal);
 const event=(type,x,y)=>{const e=new dom.window.Event(type,{bubbles:true,cancelable:true});Object.assign(e,{pointerId:1,clientX:x,clientY:y,button:0,isPrimary:true});node.dispatchEvent(e);return e;};
 event('pointerdown',100,100);event('pointermove',103,150);event('pointerup',103,150);assert.equal(calls.length,0);
 event('pointerdown',100,100);event('pointermove',165,102);assert.ok(node.classList.contains('is-swiping'));event('pointerup',165,102);assert.deepEqual(calls,['one']);assert.equal(node.style.getPropertyValue('--reply-drag'),'');assert.ok(event('click',165,102).defaultPrevented);
 node.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));assert.equal(calls.length,2);controller.abort();event('pointerdown',100,100);event('pointermove',180,100);event('pointerup',180,100);assert.equal(calls.length,2);dom.window.close();
});

test('profile previews five titles and the history page can display all recent titles in batches',async()=>{
 const {readFile}=await import('node:fs/promises'),{runInNewContext}=await import('node:vm');const source=await readFile('src/app.js','utf8');const code=source.slice(source.indexOf('function historyHTML('),source.indexOf('function ensureHistoryCards('));const now=Date.now(),progress=Object.fromEntries(Array.from({length:65},(_,i)=>['p'+i,{id:'mal-'+i,updated:now-i*1000,episode:2,time:60}]));const before=JSON.stringify(progress);
 const ctx={historyAgo,state:{progress,preferences:{}},recentHistory,historyVisible:40,lang:'ru',t:x=>x,displayCards:new Map(),byId:id=>({id,title:id}),esc:x=>String(x),title:a=>a.title,cover:()=>'/cover.webp',savedEpisodeNumber:p=>p.episode,timeLabel:x=>String(x),icon:()=>''};runInNewContext(code,ctx);
 let dom=new JSDOM(ctx.historyHTML());assert.equal(dom.window.document.querySelectorAll('[data-watch]').length,5);assert.equal(dom.window.document.querySelector('.history-more').getAttribute('href'),'#history');dom.window.close();
 dom=new JSDOM(ctx.historyHTML(true));assert.equal(dom.window.document.querySelectorAll('[data-watch]').length,40);assert.ok(dom.window.document.querySelector('[data-action="history-more"]'));dom.window.close();
 ctx.historyVisible=80;dom=new JSDOM(ctx.historyHTML(true));assert.equal(dom.window.document.querySelectorAll('[data-watch]').length,65);assert.equal(dom.window.document.querySelector('[data-action="history-more"]'),null);assert.equal(JSON.stringify(progress),before);dom.window.close();
});
