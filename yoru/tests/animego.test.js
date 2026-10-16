import test from 'node:test';import assert from 'node:assert/strict';
import {decodeHTML,parseEpisodes,parseVoices,parsePlayer,parseStreams,goRelease,validateSnapshot} from '../server/animego.js';
import {audioChoices,watchRoute} from '../src/discovery.js';
const ep=(n,id)=>`<div data-action="click->player#go" data-episode-number="${n}" data-episode="${id}"></div>`;
const voice=(id,label,url='//kodikplayer.com/seria/123/abcdef/720p')=>`<button data-action="click->choose" data-player="${url}" data-provider-slug="kodik" data-ptranslation="${id}" data-translation-title="${label}"></button>`;
test('player attributes containing arrows do not truncate episodes or voices',()=>{assert.deepEqual(parseEpisodes(ep(0,1)+ep(1.5,2)+ep(0,1)),[{ordinal:0,id:1},{ordinal:1.5,id:2}]);assert.equal(parseVoices(voice(7,'AniMedia'))[0].label,'AniMedia');assert.throws(()=>parseEpisodes(ep(1,1)+ep(1,2)),/ambiguous/);});
test('untrusted embed URLs never become resolver targets',()=>{for(const url of ['http://kodikplayer.com/seria/1/a/720p','https://evil.test/seria/1/a/720p','https://kodikplayer.com@evil.test/seria/1/a/720p','https://kodikplayer.com:999/seria/1/a/720p','https://kodikplayer.com/admin'])assert.deepEqual(parseVoices(voice(1,'Test',url)),[]);});
test('subtitled original and available dubs retain their language; duplicates collapse',()=>{const v=parseVoices(voice(76,'Субтитры')+voice(7,'AniMedia')+voice(76,'Субтитры'));assert.equal(v.length,2);assert.equal(v[0].language,'ja');assert.equal(v[1].language,'ru');});
test('quality list only contains actual safe manifests; no fabricated 1080 option',()=>{const sources=parseStreams({'360':[{src:'//cdn.example/360.m3u8'}],'720':[{src:'javascript:alert(1)'}],'1080':[]});assert.deepEqual(sources,[{quality:360,url:'https://cdn.example/360.m3u8'}]);});
test('episode-specific audio cannot leak from the previously viewed episode',()=>{const a={providerId:1,episodeManifest:[{ordinal:1,audio:['liberty']},{ordinal:2,audio:[]}],goVoiceOrdinal:1,currentGoVoices:[{id:'go-76',label:'Субтитры',language:'ja'}]};assert.equal(audioChoices(a,1).length,2);assert.deepEqual(audioChoices(a,2),[]);assert.deepEqual(watchRoute('#watch/go-65/216'),{id:'go-65',episode:216});});
test('all episode pages are loaded and incomplete responses are rejected',async()=>{const original=globalThis.fetch;const header=total=>`<div data-action="click->go" data-anime-player-episodes-total-value="${total}" data-anime-player-episodes-pages-value="[{&quot;page&quot;:0},{&quot;page&quot;:1}]"></div>`;let incomplete=false;globalThis.fetch=async url=>new Response(JSON.stringify({status:'success',data:String(url).includes('/episodes?')?{page:1,total:3,content:incomplete?'':ep(3,103)}:{content:header(3)+ep(1,101)+ep(2,102)}}));try{const d=await goRelease(9999001);assert.deepEqual(d.episodes.map(e=>e.ordinal),[1,2,3]);incomplete=true;await assert.rejects(goRelease(9999002),/incomplete_playlist/);}finally{globalThis.fetch=original;}});
test('a film whose initial player omits episodes loads page zero instead of failing',async()=>{
 const original=fetch;let pages=0;
 globalThis.fetch=async url=>{const page=String(url).includes('/episodes?page=0');if(page)pages++;return new Response(JSON.stringify({status:'success',data:page?{page:0,total:1,content:ep(1,500)}:{content:'<div data-anime-player-episodes-total-value="1" data-anime-player-episodes-pages-value="[{&quot;page&quot;:0,&quot;count&quot;:1}]"></div>'+voice(7,'AniMedia')}}));};
 try{const d=await goRelease(9999003);assert.equal(pages,1);assert.deepEqual(d.episodes,[{ordinal:1,id:500}]);}finally{globalThis.fetch=original;}
});
test('published snapshots reject incomplete playlists, duplicate ordinals and unsafe embed URLs',()=>{
 const data={id:1,total:1,episodes:[{id:10,ordinal:1,voices:parseVoices(voice(7,'AniMedia'))}]};
 assert.equal(validateSnapshot(data,1),data);
 assert.throws(()=>validateSnapshot({...data,total:2},1),/invalid_snapshot/);
 assert.throws(()=>validateSnapshot(data,2),/invalid_snapshot/);
 assert.throws(()=>validateSnapshot({...data,total:2,episodes:[...data.episodes,...data.episodes]},1),/invalid_snapshot/);
 const bad=structuredClone(data);bad.episodes[0].voices[0].url='https://evil.test/video/1/a/720p';assert.throws(()=>validateSnapshot(bad,1),/invalid_snapshot/);
});
