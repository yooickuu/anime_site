import test from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';
import {watchView} from '../src/watch-view.js';import {catalogView} from '../src/catalog-view.js';
import {queryCatalogue,catalogueStatus} from '../src/catalog-query.js';import {similarTitles} from '../src/recommendations.js';import {createCatalogueStore} from '../src/catalog-store.js';
test('watch layout keeps a single native player, pickers, skip overlay and actions in the requested order',()=>{
 const dom=new JSDOM(watchView({a:{id:'mal-1',title:'<Title>',year:2026},t:k=>k,title:a=>a.title,cover:()=>'/art.webp'})),d=dom.window.document;
 assert.equal(d.querySelectorAll('video').length,1);assert.equal(d.querySelector('iframe'),null);assert.equal(d.querySelector('.player-settings'),null);
 const before=(a,b)=>assert.ok(d.querySelector(a).compareDocumentPosition(d.querySelector(b))&4);
 before('.watch-heading','.video-shell');before('.video-shell','.player-pickers');before('.player-pickers','.episode-nav');before('.episode-nav','#episode-comments');
 assert.ok(d.querySelector('.watch-heading [data-action="watch-together"]'));assert.equal(d.querySelectorAll('[data-action="watch-together"]').length,1);
 for(const id of ['video','skip-segment','season-picker','episode-picker','audio-picker','previous-episode','next-episode','source-status','source-empty','watch-together'])assert.ok(d.getElementById(id),id);
 assert.equal(d.querySelector('#player-title').textContent,'<Title>');dom.window.close();
});
test('catalogue offers the full score range and combines normalized genre, format, year and status',()=>{
 const rows=[{id:'a',title:'A',genres:['Action'],type:'tv',year:2026,ongoing:true,rating:8,popularity:30,catalogUpdatedAt:2},{id:'b',title:'B',genres:['Экшен'],type:'TV',year:2026,ongoing:false,rating:9,popularity:10,catalogUpdatedAt:3},{id:'c',title:'C',genres:['Action'],type:'OVA',year:2026,ongoing:false,rating:7,popularity:20,catalogUpdatedAt:1}];
 assert.deepEqual(queryCatalogue(rows,{type:'TV',genre:'экшен',year:'2026',minRating:7,maxRating:8,status:'airing'}).map(x=>x.id),['a']);
 assert.deepEqual(queryCatalogue(rows,{status:'finished',sort:'topRated'}).map(x=>x.id),['b','c']);
 assert.deepEqual(queryCatalogue(rows,{sort:'latest'}).map(x=>x.id),['b','a','c']);assert.deepEqual(queryCatalogue(rows,{sort:'picked'}).map(x=>x.id),['a','c','b']);
 assert.equal(catalogueStatus({status:'NOT_YET_AIRED'}),'announced');assert.equal(catalogueStatus({airedAt:'2030-01-01'},Date.parse('2026-01-01')),'announced');
 const dom=new JSDOM(catalogView({t:k=>k,lang:'ru',query:'<text>',sort:'picked',genre:'all',type:'all',year:'all',minRating:0,maxRating:10,status:'all',years:[2026],genres:[['Экшен','Экшен']]}));
 assert.equal(dom.window.document.querySelector('#rating-filter').options.length,11);assert.equal(dom.window.document.querySelector('#rating-max-filter').value,'10');assert.equal(dom.window.document.querySelector('#status-filter').options.length,4);assert.equal(dom.window.document.querySelector('#catalog-search').value,'<text>');dom.window.close();
});
test('status and maximum score trigger bounded chunk filtering instead of the unfiltered fast path',async()=>{
 const items=[{id:'mal-1',title:'One',type:'TV',genres:[],rating:9,ongoing:true},{id:'mal-2',title:'Two',type:'TV',genres:[],rating:6,ongoing:false}];let calls=0;
 const store=createCatalogueStore({items,total:2,chunkSize:120,chunks:1,revision:'test'},{fetcher:async()=>{calls++;return Response.json(items);}});
 assert.deepEqual((await store.query({status:'finished'})).items.map(a=>a.id),['mal-2']);assert.deepEqual((await store.query({maxRating:7})).items.map(a=>a.id),['mal-2']);assert.equal(calls,1);
});
test('similar sidebar deduplicates and prioritizes shared genres over unrelated popularity',()=>{
 const current={id:'mal-1',genres:['Action','Fantasy'],description:'магическая академия приключения'};
 const good={id:'mal-2',title:'Similar',genres:['Экшен','Фэнтези'],popularity:1};
 const candidates=[current,good,good,{id:'mal-3',genres:['Action'],popularity:100},{id:'mal-4',genres:['Sports'],popularity:999999}];
 assert.deepEqual(similarTitles(current,candidates).map(a=>a.id),['mal-2','mal-3']);
});
