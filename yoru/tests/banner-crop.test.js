import test from 'node:test';
import assert from 'node:assert/strict';
import {bannerGeometry,cropGeometry,fitImageDimensions} from '../src/avatar-crop.js';
test('banner crop stays inside portrait, landscape and panorama originals at every edge',()=>{
 for(const [w,h] of [[1000,2000],[3840,2160],[8000,800]])for(const z of [1,2,4])for(const x of [-1,0,.5,1,2])for(const y of [-1,0,.5,1,2]){
  const r=bannerGeometry(w,h,z,x,y);assert.ok(Math.abs(r.width/r.height-3.2)<.0001);assert.ok(r.x>=0&&r.y>=0&&r.x+r.width<=w+.001&&r.y+r.height<=h+.001);
 }
});
test('square avatar geometry keeps its previous result',()=>assert.deepEqual(cropGeometry(1000,800),{size:800,x:100,y:0}));

test("full banner preserves portrait and landscape proportions without upscaling",()=>{
 for(const [w,h] of [[800,1200],[4000,2000],[1000,300]]){const r=fitImageDimensions(w,h);assert.ok(r.width<=w&&r.height<=h);assert.ok(r.width<=2560&&r.height<=1600);assert.ok(Math.abs(r.width/r.height-w/h)<.005);}
});
