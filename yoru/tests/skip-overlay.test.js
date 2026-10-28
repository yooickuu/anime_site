import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {activeSkip,attachSkipOverlay} from '../src/skip-overlay.js';
import {automaticSkipTimes,compatibleSkipTimes} from '../src/autoskip.js';
import {attachPlaybackAutomation} from '../src/playback-automation.js';

test('manual button follows exact boundaries, seeks to the exact end and respects settings',()=>{
 const dom=new JSDOM('<video></video><button hidden></button>'),{document,Event}=dom.window;
 const video=document.querySelector('video'),button=document.querySelector('button');
 Object.defineProperty(video,'duration',{value:1440});
 const s={ready:true,preferences:{autoSkip:false},timing:{opening:{start:10.5,end:100.25},ending:{start:1340,end:1440}}};
 const ui=attachSkipOverlay(button,video,{context:()=>s,t:k=>k});
 const at=time=>{video.currentTime=time;video.dispatchEvent(new Event('timeupdate'));};
 at(10.49);assert.equal(button.hidden,true);
 at(10.5);assert.equal(button.hidden,false);assert.equal(button.textContent,'skipOpening');
 button.click();assert.equal(video.currentTime,100.25);assert.equal(button.hidden,true);
 at(1340);assert.equal(button.textContent,'skipEnding');assert.equal(button.hidden,false);
 button.click();assert.equal(video.currentTime,1440);assert.equal(button.hidden,true);
 at(20);s.preferences.autoSkip=true;ui.update();assert.equal(button.hidden,true);
 s.preferences.autoSkip=false;s.ready=false;ui.update();assert.equal(button.hidden,true);
 s.ready=true;s.timing={};ui.update();assert.equal(button.hidden,true);
 s.timing={opening:{start:10,end:100}};at(20);ui.destroy();button.click();assert.equal(video.currentTime,20);assert.equal(button.hidden,true);
 dom.window.close();
});
test('stale button clicks recheck source state instead of skipping a new episode',()=>{
 const dom=new JSDOM('<video></video><button></button>'),video=dom.window.document.querySelector('video'),button=dom.window.document.querySelector('button');
 Object.defineProperty(video,'duration',{value:1440});video.currentTime=40;
 const state={ready:true,preferences:{autoSkip:false},timing:{opening:{start:10,end:100}}};
 const ui=attachSkipOverlay(button,video,{context:()=>state,t:k=>k});assert.equal(button.hidden,false);
 state.ready=false;button.click();assert.equal(video.currentTime,40);ui.destroy();dom.window.close();
});
test('invalid, absent and mismatched AniSkip data produces no manual or automatic intervals',()=>{
 const row={skipType:'op',episodeLength:1440,interval:{startTime:10,endTime:100}};
 for(const data of [{found:false,results:[row]},{results:{}},{results:[{...row,episodeLength:1500}]},{results:[{...row,interval:{startTime:10,endTime:1441}}]}]){
  const timing=compatibleSkipTimes(data,1440);assert.equal(activeSkip(20,timing,1440),null);
 }
 assert.equal(activeSkip(20,{opening:{start:10,end:1500}},1440),null);
});
test('closest matching cut wins without shifting or rounding the supplied timestamps',()=>{
 const row=(length,start)=>({skipType:'op',episodeLength:length,interval:{startTime:start,endTime:start+90.125}});
 assert.deepEqual(compatibleSkipTimes({results:[row(1440,10.25),row(1445,15)]},1440).opening,{start:10.25,end:100.375});
});
test('AniSkip absence and network failure do not interrupt playback or throw',async()=>{
 const saved=globalThis.fetch;
 try{
  globalThis.fetch=async()=>({status:404,ok:false});assert.equal((await automaticSkipTimes(999911,1,1440)).opening,null);
  globalThis.fetch=async()=>{throw Error('offline');};assert.equal((await automaticSkipTimes(999912,1,1440)).ending,null);
 }finally{globalThis.fetch=saved;}
});
test('exact ending seek leaves post-credit scenes and next-episode handling intact',()=>{
 const video=new EventTarget();Object.assign(video,{duration:1440,currentTime:1350,paused:false,seeking:false,ended:false});
 const timing=compatibleSkipTimes({found:true,results:[{skipType:'ed',episodeLength:1440,interval:{startTime:1340,endTime:1420}}]},1440);
 const ends=[];const dispose=attachPlaybackAutomation(video,{context:()=>({ready:true,token:1,timing,preferences:{autoSkip:true,autoNext:true,autoPlay:true},episode:1,total:2,hasNext:true}),onEnded:v=>ends.push(v)});
 video.dispatchEvent(new Event('timeupdate'));assert.equal(video.currentTime,1420);assert.equal(ends.length,0);
 video.ended=true;video.dispatchEvent(new Event('ended'));video.dispatchEvent(new Event('ended'));assert.deepEqual(ends,[{episode:2,play:true}]);dispose();
});
