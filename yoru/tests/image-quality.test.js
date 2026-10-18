import test from 'node:test';import assert from 'node:assert/strict';
import {sharperImage,localPoster} from '../src/image-quality.js';
test('a thumbnail cannot replace an original, including wide crops',()=>{
 const original={url:'original',width:1000,height:1500};
 assert.equal(sharperImage(original,{width:460,height:650}),original);
 assert.equal(sharperImage(original,{width:2000,height:300}),original);
 assert.equal(sharperImage(original,null),original);
 const better={width:1600,height:2400};assert.equal(sharperImage(original,better),better);
});
test('local originals use canonical IDs only',()=>{assert.equal(localPoster({malId:32281}),'assets/yourname.jpg');assert.equal(localPoster({title:'Your Name',malId:999}), '');});
