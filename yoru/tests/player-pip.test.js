import {test} from 'node:test';import assert from 'node:assert/strict';
import {supportsPiP,togglePiP} from '../src/player-pip.js';
test('Safari uses native PiP and returns to inline without touching the source',async()=>{
 let mode;const video={src:'unchanged.m3u8',webkitSupportsPresentationMode:m=>m==='picture-in-picture',webkitSetPresentationMode:m=>mode=m,webkitPresentationMode:'inline'};
 assert.equal(supportsPiP(video,{}),true);await togglePiP(video,{});assert.equal(mode,'picture-in-picture');video.webkitPresentationMode=mode;await togglePiP(video,{});assert.equal(mode,'inline');assert.equal(video.src,'unchanged.m3u8');
});
test('standard PiP is used where available and unsupported platforms stay disabled',async()=>{
 let entered=0,exited=0;const video={requestPictureInPicture:async()=>entered++},doc={pictureInPictureEnabled:true,exitPictureInPicture:async()=>exited++};await togglePiP(video,doc);doc.pictureInPictureElement=video;await togglePiP(video,doc);assert.equal(entered,1);assert.equal(exited,1);assert.equal(supportsPiP({},{}),false);
});
