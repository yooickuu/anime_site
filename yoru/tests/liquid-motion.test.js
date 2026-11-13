import {test} from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';import {installLiquidMotion} from '../src/liquid-motion.js';
test('glass reflections use one pointer frame, skip touch/reduced motion and never target media',()=>{
 const dom=new JSDOM('<div class="shell-dialog"><button>Menu</button></div><div class="video-shell"><video></video></div>');
 const previous=Object.fromEntries(['window','document','matchMedia','requestAnimationFrame','cancelAnimationFrame'].map(k=>[k,globalThis[k]]));
 const fine={matches:true,addEventListener(){}},reduce={matches:false,addEventListener(){}},pending=new Map();let seq=0;
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,matchMedia:q=>q.includes('reduce')?reduce:fine,requestAnimationFrame:f=>{pending.set(++seq,f);return seq;},cancelAnimationFrame:id=>pending.delete(id)});
 try{installLiquidMotion();const glass=document.querySelector('.shell-dialog');glass.getBoundingClientRect=()=>({left:0,top:0,width:200,height:100});
 const move=target=>target.dispatchEvent(new dom.window.MouseEvent('pointermove',{bubbles:true,clientX:100,clientY:25}));
 move(glass.firstChild);move(glass.firstChild);assert.equal(pending.size,1);for(const [id,f] of pending){pending.delete(id);f();}assert.equal(glass.style.getPropertyValue('--glow-x'),'50%');assert.equal(glass.style.getPropertyValue('--glow-y'),'25%');
 move(document.querySelector('video'));assert.equal(glass.classList.contains('is-tilting'),false);assert.equal(document.querySelector('video').getAttribute('style'),null);
 fine.matches=false;move(glass);assert.equal(pending.size,0);fine.matches=true;reduce.matches=true;move(glass);assert.equal(pending.size,0);
 reduce.matches=false;move(glass);document.dispatchEvent(new dom.window.Event('yomiku:navigation'));assert.equal(pending.size,0);assert.equal(glass.style.getPropertyValue('--glow-x'),'');
 }finally{dom.window.close();for(const [k,v] of Object.entries(previous)){if(v===undefined)delete globalThis[k];else globalThis[k]=v;}}
});
