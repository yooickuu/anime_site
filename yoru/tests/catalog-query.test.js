import test from 'node:test';import assert from 'node:assert/strict';
import {normalizeSearch,normalizeType,normalizeGenre,queryCatalogue,suggestions,selectSpotlight} from '../src/catalog-query.js';
const items=[{id:'one',title:'Чёрный клевер',type:'tv',genres:['Action'],year:2017},{id:'two',title:'Твоё имя',type:'movie',genres:['романтика'],year:2016},{id:'three',title:'Наруто: Ураганные хроники',type:'TV',genres:['Экшен'],year:2007},{id:'four',title:'Наруто. OVA',type:'oad',genres:['action'],year:2008}];
test('normalization ignores diacritics, signs, punctuation and letter variants',()=>{
 assert.equal(normalizeSearch('ЧЁРНЫЙ—КЛЕВЕР!'),'черный клевер');
 assert.equal(normalizeSearch('объект, жизнь'),'обект жизн');
 assert.equal(normalizeType('tv24'),'TV');assert.equal(normalizeType('OAD'),'OVA');assert.equal(normalizeType('фильм'),'MOVIE');assert.equal(normalizeGenre('ACTION'),'Экшен');
});
test('formats and bilingual genres filter together; an empty query does not hide matches',()=>{
 assert.deepEqual(queryCatalogue(items,{type:'TV',genre:'экшен'}).map(a=>a.id),['three','one']);
 assert.deepEqual(queryCatalogue(items,{type:'OVA,OAD'}).map(a=>a.id),['four']);
 assert.deepEqual(queryCatalogue(items,{type:'MOVIE'}).map(a=>a.id),['two']);
});
test('partial search, punctuation, ё/е, typo and transposition produce suggestions',()=>{
 for(const q of ['черный','чёрный-клевер','черныйклевер','клевре','клеер'])assert.equal(suggestions(items,q)[0]?.id,'one',q);
 assert.equal(suggestions(items,'тво')[0].id,'two');assert.equal(suggestions(items,'qwerty').length,0);
});
test('spotlight selects ten distinct titles and prioritizes ongoing releases',()=>{
 const data=Array.from({length:15},(_,i)=>({id:String(i),image:'poster',year:2000+i,ongoing:i===0}));const pool=selectSpotlight(data);
 assert.equal(pool.length,10);assert.equal(pool[0].id,'0');assert.equal(new Set(pool.map(a=>a.id)).size,10);
});
test('curated high-resolution promotions can never introduce unpublished titles',()=>{
 const a={id:'a',image:'poster'},extra=[{id:'a',hero:'assets/a.webp',popularity:100},{id:'unpublished',hero:'assets/b.webp',popularity:1000}];
 const pool=selectSpotlight([a,a],10,extra);assert.equal(pool.length,1);assert.equal(pool[0].hero,'assets/a.webp');assert.equal(pool[0].id,'a');
});
