import {test} from 'node:test';
import assert from 'node:assert/strict';
import {syncVideo,validState,targetTime} from '../src/together/sync.js';
import {JSDOM} from 'jsdom';
import {build} from 'esbuild';
import {mkdtemp,writeFile,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
const stamp=Date.now(),state={anime_id:'mal-1',episode:1,position:60,playing:true,speed:1,revision:1,sent_at:new Date(stamp).toISOString()};
test('sync corrects only drift over two seconds without replacing media or changing sound',async()=>{
 const v={readyState:4,duration:1400,currentTime:60.5,playbackRate:1,paused:false,seeking:false,src:'original.m3u8',volume:.4,muted:true,pause(){this.paused=true;},async play(){this.paused=false;}};
 await syncVideo(v,state,{now:stamp});assert.equal(v.currentTime,60.5);
 v.currentTime=12;await syncVideo(v,state,{now:stamp+1000});assert.equal(v.currentTime,61);
 await syncVideo(v,{...state,position:170,playing:false},{now:stamp+20000});assert.equal(v.currentTime,170);assert.equal(v.paused,true);
 assert.equal(v.src,'original.m3u8');assert.equal(v.volume,.4);assert.equal(v.muted,true);
 v.seeking=true;await syncVideo(v,state,{now:stamp});assert.equal(v.currentTime,170);
 for(const bad of [{...state,position:Infinity},{...state,position:-1},{...state,episode:0},{...state,speed:100},{...state,sent_at:'bad'}])assert.equal(validState(bad),false);
 assert.equal(targetTime({...state,speed:2},stamp+1000),62);
});
test('Safari autoplay denial offers user activation and loading video is left untouched',async()=>{
 let blocked=0,plays=0;const v={readyState:0,duration:NaN,currentTime:0,paused:true,seeking:false,playbackRate:1,async play(){plays++;throw Error('NotAllowedError');}};
 assert.equal(await syncVideo(v,state,{onBlocked:()=>blocked++}),false);assert.equal(plays,0);
 v.readyState=4;v.duration=100;await syncVideo(v,state,{onBlocked:()=>blocked++});assert.equal(blocked,1);
 await syncVideo(v,state,{allowPlay:false});assert.equal(plays,1);
});
test('room guest loads initial episode, follows host seek/episode change, preserves local HLS and disposes subscriptions',async()=>{
 const dir=await mkdtemp(tmpdir()+'/yomiku-together-');const compiled=await build({entryPoints:['src/together/entry.js'],bundle:true,format:'esm',write:false,loader:{'.css':'empty'}});await writeFile(dir+'/entry.mjs',compiled.outputFiles[0].text);
 const dom=new JSDOM('<div id="watch-together"></div><select id="episode-picker"></select><video id="video"></video>',{url:'https://example.test/#watch/mal-1/1',pretendToBeVisual:true});
 const saved={};for(const k of ['document','window','location','AbortController']){saved[k]=globalThis[k];globalThis[k]=dom.window[k];}
 const v=document.querySelector('video');let media={anime:'mal-1',episode:1,ready:true,video:v},paused=true,position=0;Object.defineProperties(v,{readyState:{get:()=>4},duration:{get:()=>1500},paused:{get:()=>paused},currentTime:{get:()=>position,set:n=>position=n}});v.play=async()=>{paused=false;};v.pause=()=>{paused=true;};
 const rid='10000000-0000-4000-8000-000000000001',uid='guest',events={},calls=[],opened=[];let disposed=0,instance;
 const q=data=>{const p=Promise.resolve({data});p.abortSignal=()=>p;return p;};
 const initial={...state,id:rid,host_id:'host',revision:0,position:90,server_now:new Date().toISOString(),sent_at:new Date().toISOString()};
 const channel={on(kind,filter,fn){events[kind+':'+(filter.event||'')]=fn;return this;},subscribe(cb){queueMicrotask(()=>cb('SUBSCRIBED'));return this;},track:async()=>{},send:async m=>{calls.push(m);},presenceState:()=>({host:[{}],guest:[{}]})};
 const ctx={client:{rpc(name,args){calls.push({name,args});return q(name==='yoru_watch_join'||name==='yoru_watch_snapshot'?initial:name==='yoru_watch_messages'?[]:null);},channel:()=>channel,removeChannel:async()=>{disposed++;}},user:()=>({id:uid}),lang:()=> 'ru',name:()=> 'Guest',room:()=>{},notify:()=>{},ended:()=>{},media:()=>media,open:async(a,e)=>{opened.push([a,e]);media={...media,anime:a,episode:e};}};
 const tick=()=>new Promise(r=>setTimeout(r,15));
 try{const {start}=await import(pathToFileURL(dir+'/entry.mjs'));instance=start(ctx,rid);await tick();assert.ok(v.currentTime>=90);assert.equal(paused,false);assert.equal(document.querySelector('#episode-picker').disabled,true);
 events['broadcast:state']({payload:{...initial,revision:2,position:200,playing:false}});await tick();assert.equal(v.currentTime,200);assert.equal(paused,true);
 events['broadcast:state']({payload:{...initial,revision:1,position:5}});await tick();assert.equal(v.currentTime,200);
 events['broadcast:state']({payload:{...initial,anime_id:'mal-2',episode:3,revision:3,position:15}});await tick();assert.deepEqual(opened,[['mal-2',3]]);assert.ok(v.currentTime>=15&&v.currentTime<17);
 assert.ok(!calls.some(c=>c.type==='broadcast'||c.name==='yoru_watch_state'));
 instance.dispose();assert.ok(disposed>0);assert.equal(document.querySelector('#episode-picker').disabled,false);const before=v.currentTime;events['broadcast:state']({payload:{...initial,revision:4,position:400}});await tick();assert.equal(v.currentTime,before);
 ctx.user=()=>({id:'host'});instance=start(ctx,rid);await tick();v.currentTime=240;v.dispatchEvent(new window.Event('seeked'));await new Promise(r=>setTimeout(r,110));
 assert.ok(calls.some(c=>c.type==='broadcast'&&c.event==='state'&&c.payload.position===240));assert.ok(calls.some(c=>c.name==='yoru_watch_state'&&c.args.p_position===240));
 }finally{instance?.dispose();for(const k in saved)globalThis[k]=saved[k];dom.window.close();await rm(dir,{recursive:true,force:true});}
});
test('room synchronization and public sharing remain lazy and preserve standalone auto-skip preferences',async()=>{
 const app=await readFile('src/app.js','utf8');assert.match(app,/import\(new URL\(__TOGETHER_ASSET__/);assert.match(app,/togetherSession\?\.guest\?\{\.\.\.state.preferences,autoSkip:false,autoNext:false,autoPlay:false\}:state.preferences/);
 assert.match(app,/timing:skipTiming,preferences:roomPreferences\(\),episode/);
 const buildScript=await readFile('scripts/build.mjs','utf8');assert.match(buildScript,/p.includes\('\/together\/'\)/);
});
test('active room moves above season controls and leaving restores its slot without remounting video or selectors',async()=>{
 const {placeRoomPanel}=await import('../src/together/layout.js');const dom=new JSDOM('<div class="watch-main"><div class="video-shell"><video src="test.m3u8"></video></div><div class="season-tabs"></div><div class="player-pickers"><select><option>One</option></select></div><div class="episode-nav"></div><div id="watch-together"><input value="draft"></div><section id="episode-comments"></section></div>');
 const d=dom.window.document,panel=d.querySelector('#watch-together'),video=d.querySelector('video'),select=d.querySelector('select');const before=[...panel.parentNode.children];let changes=0;select.addEventListener('change',()=>changes++);
 placeRoomPanel(panel,true);assert.equal(panel.nextElementSibling.className,'season-tabs');assert.equal(panel.previousElementSibling.className,'video-shell');placeRoomPanel(panel,true);assert.equal(d.querySelector('video'),video);assert.equal(d.querySelector('select'),select);assert.equal(panel.querySelector('input').value,'draft');
 placeRoomPanel(panel,false);assert.deepEqual([...panel.parentNode.children],before);select.dispatchEvent(new dom.window.Event('change'));assert.equal(changes,1);assert.equal(video.getAttribute('src'),'test.m3u8');dom.window.close();
});
