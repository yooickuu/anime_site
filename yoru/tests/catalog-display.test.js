import test from 'node:test';import assert from 'node:assert/strict';
import {repairDisplayMetadata} from '../scripts/lib/catalog-display.mjs';
import {catalogueCard} from '../scripts/lib/catalog-chunks.mjs';
const row=(ordinal,season=1)=>({number:ordinal,ordinal,season,audio:[{providerRef:{provider:'kodik',releaseId:'serial-42',url:'https://kodik.cc/seria/'+ordinal}},{sources:[{quality:720,url:'https://example.com/video.m3u8'}]}]});
test('display counts use actual episode records, never ordinals or audio count; media stays byte-identical',()=>{
 const publication={items:[{id:'mal-1',type:'MOVIE',episodes:[row(32),row(55),row(55),row(1,2),{number:56,audio:[]}],releasedEpisodes:[32,55,56]}, {id:'mal-2',type:'MOVIE',episodes:[row(1)]}, {id:'mal-3',type:'MOVIE',episodes:[{number:1,audio:[{sources:[{url:'https://example.com/movie.mp4'}]}]}]}]};
 const media=JSON.stringify(publication.items.map(a=>[a.id,a.episodes,a.releasedEpisodes]));
 const stats=repairDisplayMetadata(publication);assert.equal(stats.types,2);assert.equal(publication.items[0].availableEpisodeCount,3);assert.equal(publication.items[0].type,'TV');assert.equal(publication.items[1].type,'TV');assert.equal(publication.items[2].type,'MOVIE');
 assert.equal(JSON.stringify(publication.items.map(a=>[a.id,a.episodes,a.releasedEpisodes])),media);
 assert.equal(catalogueCard({...publication.items[0],episodes:55}).episodes,3);
 assert.deepEqual(repairDisplayMetadata(publication),{titles:3,counts:0,types:0});
});
test('multi-episode films corrected while legitimate OVA formats remain',()=>{
 const data={items:[{type:'Фильм',episodes:[row(1),row(2)]},{type:'OVA',episodes:[row(1),row(2)]},{type:'anime-serial',episodes:[row(1)]}]};repairDisplayMetadata(data);assert.deepEqual(data.items.map(a=>a.type),['TV','OVA','TV']);
});
