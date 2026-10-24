import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlayback} from '../src/playback.js';
class Video extends EventTarget {
 readyState=0;src='';duration=1200;
 pause(){}load(){}removeAttribute(){this.src='';}getAttribute(){return this.src;}
}
function harness(){
 let next=0;const timers=new Map(),states=[],video=new Video();
 const player=createPlayback(video,state=>states.push(state),{schedule:fn=>{timers.set(++next,fn);return next;},cancel:id=>timers.delete(id)});
 return {player,states,video,timers};
}
test('a silent initial video stall reaches the existing quality fallback',()=>{
 const h=harness();h.player.load({url:'https://example.test/stalled.mp4'});
 assert.deepEqual(h.states,['loading']);
 [...h.timers.values()][0]();assert.deepEqual(h.states,['loading','error']);assert.equal(h.timers.size,0);
});
test('playable, replaced and destroyed video loads cannot time out later',()=>{
 const h=harness();h.player.load({url:'https://example.test/first.mp4'});const old=[...h.timers.values()][0];
 h.player.load({url:'https://example.test/second.mp4'});old();assert.deepEqual(h.states,['loading','loading']);
 h.video.readyState=3;h.video.dispatchEvent(new Event('canplay'));assert.equal(h.timers.size,0);
 h.player.load({url:'https://example.test/third.mp4'});h.player.destroy();assert.equal(h.timers.size,0);
});
test('paused metadata-only preload is not treated as a broken video',()=>{
 const h=harness();h.player.load({url:'https://example.test/paused.mp4',autoplay:false});
 h.video.readyState=1;h.video.dispatchEvent(new Event('loadedmetadata'));
 assert.equal(h.timers.size,0);assert.deepEqual(h.states,['loading','ready']);
});
test('autoplay policy rejection is distinct from real decode errors and old play promises',async()=>{
 for(const [name,expected] of [['NotAllowedError','autoplayBlocked'],['NotSupportedError','error'],['AbortError',null]]){
  const h=harness();h.video.play=()=>Promise.reject(Object.assign(Error(),{name}));h.player.load({url:'https://example.test/auto.mp4',autoplay:true});h.video.dispatchEvent(new Event('loadedmetadata'));await Promise.resolve();if(expected)assert.equal(h.states.at(-1),expected);else assert.deepEqual(h.states,['loading']);h.player.destroy();
 }
 const h=harness();let reject;h.video.play=()=>new Promise((_,r)=>reject=r);h.player.load({url:'https://example.test/first.mp4',autoplay:true});h.video.dispatchEvent(new Event('loadedmetadata'));h.player.load({url:'https://example.test/next.mp4'});reject(Object.assign(Error(),{name:'NotAllowedError'}));await Promise.resolve();assert.deepEqual(h.states,['loading','loading']);h.player.destroy();
});
test('episode/quality replacement keeps native video attached without an empty source or forced pause',()=>{
 const h=harness(),actions=[];
 h.video.pause=()=>actions.push('pause');
 h.video.removeAttribute=()=>actions.push('empty-src');
 h.player.load({url:'https://example.test/episode1.mp4'});
 h.player.suspend();
 h.player.load({url:'https://example.test/episode2.mp4',startAt:65.25,speed:1.5});
 h.video.dispatchEvent(new Event('loadedmetadata'));
 assert.deepEqual(actions,[]);
 assert.equal(h.video.currentTime,65.25);
 assert.equal(h.video.playbackRate,1.5);
 h.player.destroy();
 assert.deepEqual(actions,['pause','empty-src']);
});

test('Safari native HLS loads the signed proxy URL and preserves its position',()=>{
 const h=harness();h.video.canPlayType=type=>type==='application/vnd.apple.mpegurl'?'probably':'';
 const url='https://project.supabase.co/functions/v1/anime-source?stream=1&p=signed&s=signature';
 h.player.load({url,stream:true,startAt:42});assert.equal(h.video.src,url);
 h.video.dispatchEvent(new Event('loadedmetadata'));assert.equal(h.video.currentTime,42);
 h.player.destroy();
});
