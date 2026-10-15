import test from 'node:test';
import assert from 'node:assert/strict';
import {probeVideo} from '../scripts/probe-video.mjs';
test('media audit reads MP4 bytes with GET and accepts either full or range responses',async()=>{
 for(const status of [200,206]){
  let canceled=false;
  const result=await probeVideo('https://example.test/video.mp4',async(url,options)=>{
   assert.equal(options.headers.Range,'bytes=0-1023');assert.equal(options.method,undefined);
   return {ok:true,status,body:{getReader:()=>({read:async()=>({value:new Uint8Array([0,0,0,24,102,116,121,112,105,115,111,109])}),cancel:async()=>{canceled=true;}})}};
  });
  assert.equal(result,'ok');assert.equal(canceled,true);
 }
});
test('media audit rejects HTML errors disguised as successful video URLs',async()=>{
 assert.equal(await probeVideo('https://example.test/v',async()=>new Response('<html>Not found</html>')),'not_video');
 assert.equal(await probeVideo('https://example.test/v',async()=>new Response('',{status:404})),'http_404');
 assert.equal(await probeVideo(null),'no_stream');
});
