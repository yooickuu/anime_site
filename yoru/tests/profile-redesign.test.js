import test from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';
import {ownProfileView,settingsView,mountOwnLists} from '../src/profile-redesign.js';import {badgeCache} from '../src/activity/badge-cache.js';
const t=k=>k;
test('own profile exposes four compact stats and separate settings without email or time tracker',()=>{
 const d=new JSDOM(ownProfileView({p:{bio:'Hello <b>',email:'private'},name:'Alice',avatar:'/a.jpg',banner:'/b.jpg',stats:{completedEpisodes:4,averageRating:9},saved:7,t,lang:'ru'}));const root=d.window.document;
 assert.equal(root.querySelectorAll('.profile-v3-stats>div').length,4);assert.ok(root.querySelector('[data-action="profile-settings"]'));assert.ok(root.querySelector('#profile-saved'));assert.equal(root.querySelector('form'),null);assert.ok(!root.body.textContent.includes('private'));assert.ok(!root.body.innerHTML.includes('profile-watch-time'));d.window.close();
});
test('settings keep existing edit form, upload IDs, watch toggles and account actions',()=>{
 const d=new JSDOM(settingsView({draft:{name:'A"<>',bio:'<script>'},p:{banner:'b'},t,lang:'ru',preferences:'<input type="checkbox" data-preference="autoSkip">',appearance:'themes',avatar:'/a.jpg',banner:'/b.jpg',deletion:true,close:''}));const root=d.window.document;
 assert.equal(root.querySelector('#profile-form input[name=name]').value,'A"<>');assert.equal(root.querySelector('#profile-form textarea').value,'<script>');assert.ok(root.querySelector('#avatar-file'));assert.ok(root.querySelector('#banner-file'));assert.ok(root.querySelector('[data-action="switch-account"]'));assert.ok(root.querySelector('[data-action="delete-account"]'));assert.equal(root.querySelectorAll('[role=tabpanel]').length,3);assert.equal(root.querySelector('[data-action=logout]'),null);assert.ok(root.querySelector('.settings-avatar-stage .profile-avatar img'));assert.equal(root.querySelector('[data-action=avatar]').textContent,'Сменить аватар');assert.ok(root.querySelector('[data-preference=autoSkip]'));d.window.close();
});
test('profile lists render cache immediately, paginate all saved IDs and search only the chosen list without writes',async()=>{
 const dom=new JSDOM('<div id="root"></div>'),original=globalThis.AbortController;globalThis.AbortController=dom.window.AbortController;
 const state={entries:Object.fromEntries(Array.from({length:75},(_,i)=>['mal-'+i,{favorite:i<2,status:'watching',anime:{title:'Anime '+i,genres:[],image:'/art.jpg'}}])),statuses:[{id:'favorites',name:'Favorites'},{id:'watching',name:'Watching'}],collections:[]},before=JSON.stringify(state);let active=true;const root=dom.window.document.querySelector('#root');let cleanup;
 try{cleanup=mountOwnLists(root,{state,view:{},t,lang:'ru',statusName:s=>s.name,title:a=>a.title,cover:a=>a.image,lookup:()=>null,resolve:async()=>null,remember:()=>{},live:()=>active});
 const menu=root.querySelector('.profile-lists-dialog');menu.showModal=()=>menu.setAttribute('open','');menu.close=()=>menu.removeAttribute('open');
 root.querySelector('[data-list-menu-open]').click();assert.equal(menu.open,true);
 menu.querySelector('[data-profile-list="favorites"]').click();assert.equal(menu.open,false);assert.equal(root.querySelectorAll('.anime-card').length,2);
 root.querySelector('[data-list-menu-open]').click();menu.querySelector('[data-action="manage-statuses"]').click();assert.equal(menu.open,false);assert.equal(JSON.stringify(state),before);
 assert.equal(menu.querySelector('[data-action="create-status"]').textContent,'createStatus');
 root.querySelector('.profile-list-nav [data-profile-list="all"]').click();
 assert.equal(root.querySelectorAll('.anime-card').length,60);root.querySelector('[data-profile-more]').click();assert.equal(root.querySelectorAll('.anime-card').length,75);
 root.querySelector('[data-profile-list="favorites"]').click();assert.equal(root.querySelectorAll('.anime-card').length,2);
 const search=root.querySelector('[data-profile-query]');search.value='Anime 74';search.dispatchEvent(new dom.window.Event('input',{bubbles:true}));assert.equal(root.querySelectorAll('.anime-card').length,0);assert.equal(root.querySelector('[data-profile-count]').textContent,'0 / 2');assert.equal(JSON.stringify(state),before);
 active=false;cleanup();await new Promise(r=>setTimeout(r,0));
 }finally{cleanup?.();globalThis.AbortController=original;dom.window.close();}
});
test('achievement cache reads legacy earned badges but never credits or persists seconds',()=>{
 const data=new Map([['yomiku.activity.v1.a.snapshot',JSON.stringify({seconds:3600,badges:{hour_1:'old'}})]]),storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};
 const a=badgeCache(storage,'a'),b=badgeCache(storage,'b');assert.ok(a.snapshot.badges.hour_1);assert.deepEqual(b.snapshot.badges,{});a.accept({seconds:999,badges:{message:'now'}});assert.deepEqual(Object.keys(JSON.parse(data.get('yomiku.badges.v1.a'))),['badges']);assert.ok(a.snapshot.badges.hour_1);assert.equal(JSON.parse(data.get('yomiku.activity.v1.a.snapshot')).seconds,3600);
});
