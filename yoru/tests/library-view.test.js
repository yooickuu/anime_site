import test from 'node:test';import assert from 'node:assert/strict';
import {savedIds,savedCards,libraryPage,loadSavedCards} from '../src/library-view.js';
const freeze=x=>{Object.freeze(x);for(const v of Object.values(x))if(v&&typeof v==='object')freeze(v);return x;};
test('every saved title remains accessible after card 60, including absent catalogue cards, without modifying account data',()=>{
 const state=freeze({entries:Object.fromEntries(Array.from({length:185},(_,i)=>['mal-'+i,{status:'watching',favorite:i%2===0,anime:{title:'Saved '+i,episodes:55,genres:[]}}])),collections:[{id:'custom',items:['mal-184','missing','mal-184']}]});
 const before=JSON.stringify(state),cards=savedCards(state,'all',id=>id==='mal-0'?{title:'Current',episodes:24}:null);
 assert.equal(cards.length,185);assert.equal(cards[0].episodes,24);
 const rendered=[1,2,3,4].flatMap(p=>libraryPage(cards,p).items.map(a=>a.id));assert.deepEqual(rendered,Object.keys(state.entries));
 assert.equal(libraryPage(cards,4).total,185);assert.equal(libraryPage(cards,4).items.length,5);
 assert.equal(savedCards(state,'favorites',()=>null).length,93);assert.equal(savedIds(state,'watching').length,185);
 assert.deepEqual(savedCards(state,'custom',()=>null).map(a=>a.id),['mal-184','missing']);assert.equal(JSON.stringify(state),before);
});
test('saved card loading limits concurrency, tolerates failed metadata and cancels stale navigation',async()=>{
 let active=0,max=0;const seen=[];
 const failed=await loadSavedCards(Array.from({length:75},(_,i)=>'mal-'+i),async({id})=>{active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,1));active--;if(id==='mal-61')throw Error('offline');return{id};},{onCard:a=>seen.push(a.id)});
 assert.ok(max<=4);assert.equal(seen.length,74);assert.deepEqual(failed,['mal-61']);
 let current=true,calls=0;
 await loadSavedCards(Array.from({length:50},(_,i)=>String(i)),async({id})=>{calls++;current=false;return{id};},{current:()=>current});assert.equal(calls,1);
});

test('library grid exposes all pages and exact count even when no saved title is in bootstrap',async()=>{
 const {readFile}=await import('node:fs/promises'),{JSDOM}=await import('jsdom'),{runInNewContext}=await import('node:vm');
 const source=await readFile(new URL('../src/app.js',import.meta.url),'utf8');
 const gridCode=source.slice(source.indexOf('function renderGrid() {'),source.indexOf('const profileDraft ='));
 const dom=new JSDOM('<div id="anime-grid"></div><div id="empty"></div><div id="catalog-status"></div><div id="results-caption"></div>');
 const state=freeze({entries:Object.fromEntries(Array.from({length:125},(_,i)=>['mal-'+i,{status:'watching',favorite:true,anime:{title:'Saved '+i,genres:[],episodes:24}}])),collections:[]});
 const before=JSON.stringify(state),context={page:'library',list:'all',state,user:{id:'owner'},savedCards,libraryPage,ensureLibraryCards(){},libraryCards:new Map(),byId:()=>null,onlineItems:[],genre:'all',query:'',typeFilter:'all',ongoingOnly:false,sort:'picked',catalogError:false,catalogBusy:false,libraryKey:'',libraryBusy:false,libraryFailed:[],libraryPageNumber:1,libraryFilterKey:'',lang:'ru',searchScore:()=>1,matchesType:(_,v)=>v==='all',title:a=>a.title,cover:()=>'',esc:String,t:k=>k,icon:()=>'',bookmark:'',audienceHTML:()=>'',genreText:()=>'',revealSurfaces(){},$:s=>dom.window.document.querySelector(s)};
 runInNewContext(gridCode+';renderGrid();',context);
 assert.equal(context.$('#anime-grid').children.length,60);assert.equal(context.$('#results-caption').textContent,'found: 125');assert.ok(context.$('[data-library-page="2"]'));
 runInNewContext('libraryPageNumber=3;renderGrid();',context);assert.equal(context.$('#anime-grid').children.length,5);assert.match(context.$('#anime-grid').textContent,/Saved 124/);assert.equal(JSON.stringify(state),before);dom.window.close();
});
