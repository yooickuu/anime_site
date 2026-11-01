import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {JSDOM} from 'jsdom';
const source=await readFile(new URL('../src/app.js',import.meta.url),'utf8');
const inputCode=source.slice(source.indexOf('document.addEventListener("input",'),source.indexOf('document.addEventListener("change",'));
test('header typing never changes page, catalogue filters or playback',()=>{
 for(const page of ['home','catalog','library','watch','profile']){
  let callback,updates=0;
  const context={page,query:'catalogue query',headerQuery:'',headerSearchTimer:null,clearTimeout(){},updateHeaderSearch(){updates++;},document:{addEventListener:(_,fn)=>callback=fn}};
  runInNewContext(inputCode,context);callback({target:{id:'search',value:'Frieren'}});
  assert.equal(context.page,page);assert.equal(context.query,'catalogue query');assert.equal(context.headerQuery,'Frieren');assert.equal(updates,1);
 }
});
test('catalogue filters independently without opening suggestions or overwriting header',()=>{
 let callback,loads=0,closed=0;
 const context={page:'catalog',query:'',headerQuery:'Hunter',searchTimer:null,clearTimeout(){},setTimeout:fn=>fn(),loadCatalogue(){loads++;},closeSearchSuggestions(){closed++;},document:{addEventListener:(_,fn)=>callback=fn}};
 runInNewContext(inputCode,context);callback({target:{id:'catalog-search',value:'Naruto'}});
 assert.equal(context.query,'Naruto');assert.equal(context.headerQuery,'Hunter');assert.equal(loads,1);assert.equal(closed,1);
});
test('header results ignore outdated searches, closed dropdowns and focus changes',async()=>{
 const dom=new JSDOM('<label><input id="search"></label><input id="catalog-search">'),input=dom.window.document.getElementById('search');input.focus();
 const calls=[],paint=[],timers=[];
 const context={document:dom.window.document,headerQuery:'first',searchSuggestionsVersion:0,headerSearchTimer:null,setTimeout:fn=>{timers.push(fn);},showSearchSuggestions:(id,pool)=>{context.searchSuggestionsVersion++;paint.push(pool);},searchCatalogue:(query,{current})=>new Promise(resolve=>calls.push({query,current,resolve}))};
 const start=source.indexOf('function updateHeaderSearch('),end=source.indexOf("document.addEventListener('keydown'",start);
 runInNewContext(source.slice(start,end),context);
 input.value='first';context.updateHeaderSearch(input);const first=timers.shift()();
 input.value='second';context.headerQuery='second';context.updateHeaderSearch(input);const second=timers.shift()();
 assert.equal(calls[0].current(),false);calls[0].resolve({items:['old']});await first;assert.ok(!paint.some(p=>p?.[0]==='old'));
 calls[1].resolve({items:['new']});await second;assert.deepEqual(paint.at(-1),['new']);
 context.updateHeaderSearch(input);const dismissed=timers.shift()();context.searchSuggestionsVersion++;calls[2].resolve({items:['dismissed']});await dismissed;assert.ok(!paint.some(p=>p?.[0]==='dismissed'));
 context.updateHeaderSearch(input);const blurred=timers.shift()();dom.window.document.getElementById('catalog-search').focus();assert.equal(calls[3].current(),false);calls[3].resolve({items:['blurred']});await blurred;assert.ok(!paint.some(p=>p?.[0]==='blurred'));dom.window.close();
});
