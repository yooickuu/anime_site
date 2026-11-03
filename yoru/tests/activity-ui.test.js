import {test} from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';import {build} from 'esbuild';import {mkdtemp,writeFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {pathToFileURL} from 'node:url';
test('activity renders server totals, unlocks a compact toast above controls and disposes on logout',async()=>{
 const dir=await mkdtemp(tmpdir()+'/yomiku-activity-');const compiled=await build({entryPoints:['src/activity/entry.js'],bundle:true,format:'esm',write:false,loader:{'.css':'empty'}});await writeFile(dir+'/entry.mjs',compiled.outputFiles[0].text);
 const dom=new JSDOM('<div id="app"><div id="profile-activity"></div></div><div class="video-controls"></div>',{url:'http://localhost/',pretendToBeVisual:true});const saved={};for(const k of ['window','document','MutationObserver','AbortController','localStorage']){saved[k]=globalThis[k];globalThis[k]=dom.window[k];}
 const realTimeout=globalThis.setTimeout;let expiry,delay,dispose;globalThis.setTimeout=(fn,ms,...args)=>{if(ms===3000){expiry=fn;delay=ms;return 0;}return realTimeout(fn,ms,...args);};
 let unlocked=false,user={id:'isolated-test'},calls=0;
 try{document.querySelector('.video-controls').getBoundingClientRect=()=>({top:600,bottom:700,left:0,right:1000});const {start}=await import(pathToFileURL(dir+'/entry.mjs'));
  dispose=start({user:()=>user,lang:()=> 'ru',watch:()=>({ready:false,key:''}),client:{rpc:async()=>{calls++;return {data:{seconds:3660,badges:unlocked?{message:'now'}:{}}};}}}).dispose;
  await new Promise(r=>realTimeout(r,10));assert.match(document.querySelector('h2').textContent,/1 ч 1 мин/);assert.equal(document.querySelectorAll('.achievement').length,18);assert.equal(document.querySelector('.achievement-toast'),null);
  unlocked=true;document.dispatchEvent(new window.Event('yomiku:activity-change'));await new Promise(r=>realTimeout(r,10));assert.match(document.querySelector('.achievement-toast').textContent,/Душа компании/);assert.equal(document.querySelector('.achievement-toast').style.bottom,'180px');assert.equal(delay,3000);expiry();assert.equal(document.querySelector('.achievement-toast'),null);
  const before=calls;user=null;document.dispatchEvent(new window.Event('yomiku:activity-change'));await new Promise(r=>realTimeout(r,10));assert.equal(calls,before);
 }finally{dispose?.();globalThis.setTimeout=realTimeout;for(const k in saved)globalThis[k]=saved[k];dom.window.close();await rm(dir,{recursive:true,force:true});}
});
