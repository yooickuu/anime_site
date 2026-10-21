import test from 'node:test';
import assert from 'node:assert/strict';
import {createSubtitles,usableSubtitles} from '../src/subtitles.js';
const subs=['ru','en','ja'].map(language=>({language,format:'vtt',url:`https://example.test/${language}.vtt`}));
function fixture(){
 const nodes=[];
 const video={ownerDocument:{createElement(){return {track:{mode:'disabled'},listeners:{},addEventListener(k,v){this.listeners[k]=v;},remove(){nodes.splice(nodes.indexOf(this),1);}};}},append(n){nodes.push(n);}};
 return {nodes,video};
}
test('subtitle selection survives quality refresh, can be disabled, and stale recording tracks are removed',()=>{
 const {nodes,video}=fixture(),controller=createSubtitles(video);
 controller.set(subs,'ja');assert.deepEqual(nodes.map(n=>n.track.mode),['disabled','disabled','showing']);
 const original=nodes[2];controller.set(subs,'ja');assert.equal(nodes[2],original);
 controller.select('off');assert.ok(nodes.every(n=>n.track.mode==='disabled'));
 controller.set(subs.map(s=>({...s,url:s.url+'?cut=2'})),'en');
 assert.equal(nodes.length,3);assert.equal(original.track.mode,'disabled');assert.equal(nodes[1].track.mode,'showing');
 controller.destroy();assert.equal(nodes.length,0);controller.set(subs);assert.equal(nodes.length,0);
});
test('missing language does not activate another one; unsafe/unsupported/duplicate tracks are excluded',()=>{
 assert.equal(usableSubtitles([...subs,subs[0],{...subs[0],url:'javascript:bad'},{...subs[0],format:'ass'}]).length,3);
 const {nodes,video}=fixture();createSubtitles(video).set([subs[1]],'ja');assert.equal(nodes[0].track.mode,'disabled');
});
