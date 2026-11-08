import {test,afterEach} from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';
import {headerHTML,installShell} from '../src/ui-shell.js';import {recentReleases,WEEK} from '../src/recent-releases.js';
let dom;afterEach(()=>dom?.window.close());
function setup(search=async()=>({items:[]})){
 dom=new JSDOM('<body><div id="app"></div></body>',{url:'https://test.example/#watch/mal-1/1'});globalThis.document=dom.window.document;globalThis.window=dom.window;
 dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};dom.window.HTMLDialogElement.prototype.close=function(){this.open=false;};
 document.querySelector('#app').innerHTML=headerHTML({brand:'<a class="brand" href="#home">yomiku</a>',lang:'ru',user:{email:'private@example.test'},avatarUrl:'',page:'home',unreadCount:2,t:k=>k});
 return installShell({lang:()=> 'ru',title:a=>a.title,cover:a=>a.image||'https://test.example/art',local:()=>[{id:'mal-1',title:'Local',rating:8}],search,subtitle:()=> 'Explore'});
}
test('header routes through logo/catalog/drawer and search does not navigate or expose email',()=>{
 const shell=setup();assert.ok(!document.querySelector('header [data-nav="home"]'));assert.ok(!document.querySelector('header [data-nav="library"]'));assert.ok(!document.body.textContent.includes('private@example'));
 document.querySelector('[data-shell="catalog"]').click();assert.equal(document.querySelector('.shell-catalog [href="#social/people"]').textContent.includes('Пользователи'),true);shell.close();
 document.querySelector('[data-shell="search"]').click();assert.equal(document.activeElement.id,'shell-search');assert.match(document.querySelector('.shell-rating').textContent,/8/);assert.equal(window.location.hash,'#watch/mal-1/1');
 const input=document.querySelector('#shell-search');input.value='New';input.dispatchEvent(new window.Event('input',{bubbles:true}));assert.equal(window.location.hash,'#watch/mal-1/1');shell.close();assert.equal(document.activeElement.dataset.shell,'search');
 document.querySelector('[data-shell="drawer"]').click();assert.ok(document.querySelector('.shell-drawer [data-nav="history"]'));shell.close();
});
test('search discards slow stale responses and supports dismissal without pending updates',async()=>{
 const pending=[];const shell=setup((query,{current})=>new Promise(resolve=>pending.push({query,current,resolve})));
 document.querySelector('[data-shell="search"]').click();const input=document.querySelector('#shell-search');
 const type=async value=>{input.value=value;input.dispatchEvent(new window.Event('input',{bubbles:true}));await new Promise(r=>setTimeout(r,200));};
 await type('old');await type('new');assert.equal(pending[0].current(),false);pending[1].resolve({items:[{id:'mal-2',title:'New result',rating:9}]});await new Promise(r=>setTimeout(r,0));assert.match(document.querySelector('.shell-results').textContent,/New result/);
 pending[0].resolve({items:[{id:'mal-3',title:'Stale'}]});await new Promise(r=>setTimeout(r,0));assert.ok(!document.querySelector('.shell-results').textContent.includes('Stale'));
 shell.close();assert.equal(pending[1].current(),false);assert.equal(document.querySelector('dialog'),null);
});
test('recent row respects a rolling week, avoids future premieres and deduplicates IDs',()=>{
 const now=Date.parse('2026-11-08T12:00:00+05:00'),fresh={id:'mal-1',ongoing:true,catalogUpdatedAt:now-1000};
 const rows=recentReleases([fresh,fresh,{id:'mal-2',airedAt:'2026-11-05'},{id:'mal-3',ongoing:true,catalogUpdatedAt:now-WEEK-1},{id:'mal-4',airedAt:'2027-01-01'},{id:'mal-5',ongoing:false,catalogUpdatedAt:now}],now);
 assert.deepEqual(rows.map(a=>a.id),['mal-1','mal-2']);
});
test('drawer exposes all destinations, switches nested panels, and language dismissal restores focus',()=>{
 const shell=setup();document.querySelector('[data-shell="drawer"]').click();
 for(const selector of ['[data-nav="achievements"]','[data-nav="history"]','[href="#social/friends"]','[data-drawer-panel="style"]','[data-drawer-panel="language"]','[data-action="login"]'])assert.ok(document.querySelector('.shell-drawer '+selector),selector);
 document.querySelector('[data-drawer-panel="language"]').click();assert.equal(document.querySelector('.drawer-main').hidden,true);assert.equal(document.querySelectorAll('#language').length,1);assert.equal(document.querySelectorAll('#language option').length,3);
 document.querySelector('[data-drawer-back]').click();assert.equal(document.querySelector('.drawer-main').hidden,false);
 document.querySelector('[data-drawer-panel="style"]').click();assert.equal(document.querySelector('#language'),null);
 document.querySelector('[data-drawer-back]').click();document.querySelector('[data-drawer-panel="language"]').click();document.querySelector('#language').dispatchEvent(new window.Event('change',{bubbles:true}));assert.equal(document.querySelector('.shell-dialog'),null);assert.equal(document.activeElement.dataset.shell,'drawer');shell.close();
});
