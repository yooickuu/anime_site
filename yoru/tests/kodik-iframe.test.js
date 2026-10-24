import test from 'node:test';
import assert from 'node:assert/strict';
import {kodikEmbedURL,createKodikIframe} from '../src/kodik-iframe.js';
import {attachPlaybackAutomation} from '../src/playback-automation.js';
const url='https://kodikplayer.com/seria/123/abc123/720p';
const media={audioId:'kodik-42',providerRef:{provider:'kodik',translationId:42,url,season:1,ordinal:3},sources:[]};
test('iframe accepts exact Kodik track and rejects arbitrary hosts or mismatched audio',()=>{
 assert.equal(kodikEmbedURL(media),url);
 for(const bad of ['http://kodikplayer.com/seria/123/abc123/','https://evil.test/seria/123/abc123/','https://kodikplayer.com@evil.test/seria/123/abc123/','https://kodikplayer.com/find-player','javascript:alert(1)'])assert.equal(kodikEmbedURL({...media,providerRef:{...media.providerRef,url:bad}}),null);
 assert.equal(kodikEmbedURL({...media,audioId:'kodik-99'}),null);
});
function fixture(){
 const host=new EventTarget(),frame=new EventTarget(),sent=[];
 frame.contentWindow={postMessage:(data,target)=>sent.push({data,target})};frame.remove=()=>{frame.removed=true;};
 const player=createKodikIframe({url,title:'Anime',autoplay:true,startAt:73,sound:{volume:.4,muted:true},host,doc:{createElement:()=>frame},container:{append:()=>{}}});
 const message=(key,value,origin='https://kodikplayer.com',source=frame.contentWindow)=>{const event=new Event('message');Object.assign(event,{data:{key,value},origin,source});host.dispatchEvent(event);};
 return {player,frame,sent,message};
}
test('iframe bridge validates messages, restores position and uses targeted commands',()=>{
 const {player,frame,sent,message}=fixture();
 message('kodik_player_time_update',999,'https://evil.test');message('kodik_player_time_update',999,undefined,{});assert.equal(player.currentTime,0);
 frame.dispatchEvent(new Event('load'));message('kodik_player_duration_update',1400);
 assert.equal(player.duration,1400);assert.equal(player.currentTime,73);
 assert.ok(sent.some(x=>x.data.value.method==='seek'&&x.data.value.seconds===73));assert.ok(sent.every(x=>x.target==='https://kodikplayer.com'));
 message('kodik_player_play');assert.equal(player.paused,false);message('kodik_player_time_update',80);assert.equal(player.currentTime,80);
 player.destroy();message('kodik_player_time_update',100);assert.equal(player.currentTime,80);assert.equal(frame.removed,true);
});
test('existing skip and next-episode automation also operates on iframe events once',()=>{
 const {player,message,sent}=fixture();let ended=0,skips=0;
 const cleanup=attachPlaybackAutomation(player,{context:()=>({ready:true,token:1,timing:{opening:{start:10,end:90}},preferences:{autoSkip:true,autoNext:true,autoPlay:true},episode:1,total:3,hasNext:true}),onSkip:()=>skips++,onEnded:()=>ended++});
 message('kodik_player_duration_update',1400);message('kodik_player_play');message('kodik_player_time_update',20);
 assert.equal(skips,1);assert.ok(sent.some(x=>x.data.value.method==='seek'&&x.data.value.seconds===90));
 message('kodik_player_video_ended');message('kodik_player_video_ended');assert.equal(ended,1);
 cleanup();player.destroy();
});

import {watchView} from '../src/watch-view.js';
test('watch view has one iframe mount and no native video or duplicated controls',()=>{
 const html=watchView({a:{id:'mal-1',title:'Anime',year:2026},t:k=>k,title:a=>a.title,cover:()=>''});
 assert.equal((html.match(/id="kodik-player"/g)||[]).length,1);
 assert.ok(!/<video\b|class="video-controls"|id="quality"|data-video=/.test(html));
 assert.ok(html.includes('id="episode-picker"'));assert.ok(html.includes('id="season-picker"'));
});

import {readFile} from 'node:fs/promises';
import {iframeEpisode,publishedItems} from '../src/sources.js';
test('iframe playback reads saved media only, without any Supabase or stream request',async()=>{
 const data=JSON.parse(await readFile(new URL('../../data/media/mal-28285.json',import.meta.url),'utf8'));
 const old=globalThis.fetch,requests=[];globalThis.fetch=async url=>{requests.push(new URL(url));return Response.json(data);};
 try{
  const a=publishedItems.find(x=>x.id==='mal-28285');const result=await iframeEpisode(a,1,'kodik-4243');
  assert.equal(result.audioId,'kodik-4243');assert.equal(result.embedURL,result.providerRef.url);
  assert.equal(requests.length,1);assert.equal(requests[0].pathname,'/data/media/mal-28285.json');
 }finally{globalThis.fetch=old;}
});
