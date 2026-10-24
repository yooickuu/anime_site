import test from 'node:test';
import assert from 'node:assert/strict';
import {kodikEmbedURL,createKodikIframe} from '../src/kodik-iframe.js';
import {refreshKodikMedia} from '../src/kodik-playback.js';
import {attachPlaybackAutomation} from '../src/playback-automation.js';
const url='https://kodikplayer.com/seria/123/abc123/720p';
const media={audioId:'kodik-42',providerRef:{provider:'kodik',translationId:42,url,season:1,ordinal:3},sources:[]};
test('iframe accepts exact Kodik track and rejects arbitrary hosts or mismatched audio',()=>{
 assert.equal(kodikEmbedURL(media),url);
 for(const bad of ['http://kodikplayer.com/seria/123/abc123/','https://evil.test/seria/123/abc123/','https://kodikplayer.com@evil.test/seria/123/abc123/','https://kodikplayer.com/find-player','javascript:alert(1)'])assert.equal(kodikEmbedURL({...media,providerRef:{...media.providerRef,url:bad}}),null);
 assert.equal(kodikEmbedURL({...media,audioId:'kodik-99'}),null);
});
test('502, empty body, missing streams and wrong audio fall back to exact catalogue iframe',async()=>{
 for(const response of [new Response('',{status:502}),new Response(''),Response.json({audioId:'kodik-42',sources:[]}),Response.json({audioId:'kodik-99',sources:[{url:'wrong'}]})]){
  const result=await refreshKodikMedia(media,{supabaseUrl:'https://example.test',supabaseKey:'public'},'title',3,{fetcher:async()=>response});
  assert.equal(result.embedURL,url);assert.equal(result.audioId,'kodik-42');assert.equal(result.providerRef.ordinal,3);
 }
 const fresh=await refreshKodikMedia(media,{supabaseUrl:'https://example.test'},'title',3,{fetcher:async()=>Response.json({audioId:'kodik-42',sources:[{url:'valid'}]})});
 assert.equal(fresh.embedURL,undefined);assert.equal(fresh.sources[0].url,'valid');
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
