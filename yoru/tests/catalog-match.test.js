import test from 'node:test';
import assert from 'node:assert/strict';
import {identityIndex,exactIdentity,adjacentMovieIdentity} from '../src/catalog-match.js';
import {normalizeVost,secureVostURL,filterVost,vostEpisode} from '../src/animevost.js';
import {availableEpisodes} from '../src/provider.js';
test('source identity requires an exact full title, year and type; season numbers survive',()=>{
 const index=identityIndex([{id:1,title:'Аниме',english:'Anime!',year:2024,type:'TV'},{id:2,title:'Аниме 2',english:'Anime 2',year:2025,type:'TV'}]);
 assert.equal(exactIdentity({names:['Anime'],year:2024,type:'TV'},index)?.id,1);
 for(const a of [{names:['Anime'],year:2025,type:'TV'},{names:['Anime'],year:2024,type:'MOVIE'},{names:['Anime 2'],year:2024,type:'TV'}])assert.equal(exactIdentity(a,index),null);
});
test('ambiguous identity is left separate rather than attaching a wrong season',()=>{const index=identityIndex([{id:1,title:'Same',year:2020,type:'TV'},{id:2,title:'Same',year:2020,type:'TV'}]);assert.equal(exactIdentity({title:'Same',year:2020,type:'TV'},index),null);});
test('only uniquely matching original film titles tolerate adjacent premiere years',()=>{
 const film={id:1,english:'Suzume no Tojimari',type:'MOVIE',year:2023},query={...film,year:2022};
 assert.equal(adjacentMovieIdentity(query,[film])?.id,1);
 assert.equal(adjacentMovieIdentity({...query,type:'TV'},[film]),null);
 assert.equal(adjacentMovieIdentity({...query,year:2020},[film]),null);
 assert.equal(adjacentMovieIdentity(query,[film,{...film,id:2}]),null);
});
test('unpublished episodes never become selectable and ordinal numbers stay intact',()=>{const data=[{ordinal:3,hls_720:'https://example.org/3.m3u8'},{ordinal:2,hls_720:null},{ordinal:1,hls_720:'https://example.org/1.m3u8'}];assert.deepEqual(availableEpisodes(data).map(e=>e.ordinal),[1,3]);});
test('AnimeVost metadata distinguishes films, ongoing series and completed seasons',()=>{
 const a=normalizeVost({id:999990,title:'Название / Title [1-4 из 12]',type:'ТВ',year:'2025',episodes:4,image:'https://example.org/poster.jpg'});assert.equal(a.ongoing,true);assert.equal(a.title,'Название');assert.equal(a.episodes,4);
 const film=normalizeVost({id:999991,title:'Фильм / Film',type:'полнометражный фильм',episodes:1});assert.equal(film.type,'MOVIE');assert.equal(film.ongoing,false);
});
test('additional catalogue excludes linked variants before pagination and respects filters',()=>{
 const items=[{id:1,title:'Same',type:'ТВ',libertyId:5},{id:2,title:'New / New [1-2 из 12]',type:'ТВ',year:'2026',genre:'романтика',votes:2},{id:3,title:'Film',type:'полнометражный фильм',year:'2025',votes:1}];
 assert.deepEqual(filterVost(items,{ongoing:true,genre:'Романтика'}).map(a=>a.animeVostId),[2]);assert.deepEqual(filterVost(items,{type:'MOVIE'}).map(a=>a.animeVostId),[3]);
});
test('only the known video host is upgraded from HTTP; unsafe schemes are rejected',()=>{
 assert.equal(secureVostURL('http://video.animetop.info/1.mp4'),'https://video.animetop.info/1.mp4');assert.equal(secureVostURL('http://untrusted.test/1.mp4'),null);assert.equal(secureVostURL('javascript:alert(1)'),null);
});
test('AnimeVost playlist uses its API links and keeps the sites own MP4 transport',async()=>{const old=fetch;globalThis.fetch=async()=>({ok:true,json:async()=>[{name:'2 серия',hd:'https://example.org/2.mp4'},{name:'1 серия',hd:'http://video.animetop.info/1.mp4',std:'http://video.animetop.info/low.mp4'}]});try{const e=await vostEpisode({animeVostId:999999},1);assert.equal(e.stream,false);assert.equal(e.url,'https://video.animetop.info/1.mp4');assert.equal(e.sources.length,2);assert.equal(await vostEpisode({animeVostId:999999},3),null);}finally{globalThis.fetch=old;}});
