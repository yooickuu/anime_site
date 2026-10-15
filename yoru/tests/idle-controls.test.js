import test from 'node:test';
import assert from 'node:assert/strict';
import {idleControls} from '../src/idle-controls.js';
test('fullscreen controls hide after inactivity and wake on interaction',()=>{
 let active=true,blocked=false,visible=true,next=null,delay;
 const controller=idleControls({active:()=>active,blocked:()=>blocked,show:()=>visible=true,hide:()=>visible=false,schedule:(f,ms)=>{next=f;delay=ms;return 1;},cancel:()=>{next=null;}});
 const tick=()=>{const fn=next;next=null;fn();};
 controller.reveal();assert.equal(delay,3000);tick();assert.equal(visible,false);
 controller.reveal();assert.equal(visible,true);
 blocked=true;tick();assert.equal(visible,true);assert.ok(next);
 blocked=false;tick();assert.equal(visible,false);
 active=false;controller.reveal();assert.equal(visible,true);assert.equal(next,null);
 active=true;controller.reveal();controller.dispose();assert.equal(next,null);assert.equal(visible,true);
});
test('leaving fullscreen or pausing before the timeout never hides controls',()=>{
 let active=true,hidden=false,tick;
 const c=idleControls({active:()=>active,blocked:()=>false,show:()=>hidden=false,hide:()=>hidden=true,schedule:f=>{tick=f;return 1;},cancel:()=>{}});
 c.reveal();active=false;tick();assert.equal(hidden,false);c.dispose();
});
