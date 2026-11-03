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

import {sharperBackdrop,improveDetailImage} from '../src/detail-image-quality.js';
import {styles,styleColors} from '../src/appearance.js';
import {readFile} from 'node:fs/promises';

test('ten appearance IDs retain all old preferences and have distinct image assets',async()=>{
 assert.equal(styles.length,10);assert.equal(new Set(styles).size,10);const scenes=JSON.parse(await readFile(new URL('../src/scene-artwork.json',import.meta.url)));
 assert.deepEqual(Object.keys(scenes),styles);assert.equal(new Set(Object.values(scenes).map(s=>s.image)).size,10);
 for(const id of styles){assert.match(styleColors[id],/^#[0-9a-f]{6}$/);assert.ok(scenes[id].width>=1600);assert.ok(scenes[id].height>=900);await readFile(new URL('../dist/'+scenes[id].image,import.meta.url));}
});
test('backdrop scoring rejects thumbnails and chooses more actual detail at display size',()=>{
 const original={url:'small',width:460,height:650},better={url:'large',width:1672,height:941};
 assert.equal(sharperBackdrop(original,better),better);assert.equal(sharperBackdrop(better,original),better);assert.equal(sharperBackdrop(better,null),better);
 assert.equal(sharperBackdrop(better,{url:'tiny-strip',width:1920,height:100}),better);
});
test('a sharp landscape does not request metadata; closed dialogs cannot be repainted',async()=>{
 const oldFetch=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('unexpected network');};
 try{const img={naturalWidth:2560,naturalHeight:1440,dataset:{},getAttribute:()=> 'sharp',parentElement:{getBoundingClientRect:()=>({width:1280,height:700})},isConnected:true,closest:()=>({open:true})};await improveDetailImage(img,{id:'sharp-test',malId:1});assert.equal(calls,0);
 const closed={...img,naturalWidth:460,naturalHeight:650,dataset:{},closest:()=>({open:false})};await improveDetailImage(closed,{id:'closed-test',malId:2});assert.equal(calls,0);
 }finally{globalThis.fetch=oldFetch;}
});
test('a measured higher-resolution same-title image replaces a low resolution backdrop',async()=>{
 const originalImage=globalThis.Image,originalFetch=globalThis.fetch;let queried;
 globalThis.Image=class{set src(value){this.naturalWidth=value.includes('large')?1920:460;this.naturalHeight=value.includes('large')?1080:650;queueMicrotask(()=>this.onload?.());}};
 globalThis.fetch=async(_,options)=>{queried=JSON.parse(options.body);return {ok:true,json:async()=>({data:{Media:{idMal:123456,bannerImage:'https://test.example/large.jpg'}}})};};
 try{let src='https://test.example/small.jpg';const img={naturalWidth:460,naturalHeight:650,dataset:{},getAttribute:()=>src,set src(v){src=v;},parentElement:{getBoundingClientRect:()=>({width:1440,height:700})},isConnected:true,closest:()=>({open:true})};await improveDetailImage(img,{id:'upgrade-test',ids:{mal:123456}});assert.equal(queried.variables.id,123456);assert.equal(src,'https://test.example/large.jpg');}
 finally{globalThis.Image=originalImage;globalThis.fetch=originalFetch;}
});
test('an unrelated metadata response cannot replace the anime image',async()=>{
 const oldFetch=globalThis.fetch;globalThis.fetch=async()=>({ok:true,json:async()=>({data:{Media:{idMal:999999,bannerImage:'https://test.example/wrong.jpg'}}})});
 try{let src='https://test.example/own.jpg';const img={naturalWidth:460,naturalHeight:650,dataset:{},getAttribute:()=>src,set src(v){src=v;},isConnected:true,closest:()=>({open:true})};await improveDetailImage(img,{id:'identity-test',ids:{mal:123457}});assert.equal(src,'https://test.example/own.jpg');}finally{globalThis.fetch=oldFetch;}
});
