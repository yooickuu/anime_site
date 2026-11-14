import test from 'node:test';import assert from 'node:assert/strict';
import {probeStream,probeImage} from '../scripts/lib/media-probe.mjs';
const playlist='#EXTM3U\n#EXT-X-TARGETDURATION:10\n#EXTINF:10,\nsegment.ts\n#EXT-X-ENDLIST';
const headers={'Access-Control-Allow-Origin':'*','Content-Type':'application/vnd.apple.mpegurl'};
test('stream validation checks playlist, segment and site CORS; does not approve HTML or blocked media',async()=>{
 const previous=globalThis.fetch;
 try{
  globalThis.fetch=async url=>new Response(String(url).endsWith('.ts')?new Uint8Array([0x47,1,2,3]):playlist,{headers});
  assert.equal((await probeStream({quality:720,url:'https://video.test/720.m3u8'}))[0].duration,10);
  globalThis.fetch=async()=>new Response(playlist,{headers:{'Content-Type':'application/vnd.apple.mpegurl'}});
  await assert.rejects(probeStream({quality:720,url:'https://video.test/720.m3u8'}),/cors/);
  globalThis.fetch=async()=>new Response('<html>blocked</html>',{headers});
  await assert.rejects(probeStream({quality:720,url:'https://video.test/720.m3u8'}),/not_hls/);
  globalThis.fetch=async()=>new Response('<html>missing poster</html>');
  await assert.rejects(probeImage('https://image.test/broken.jpg'));
 }finally{globalThis.fetch=previous;}
});
import {retryMedia} from '../scripts/lib/media-probe.mjs';
test('temporary CDN failures retry three times without admitting invalid media',async()=>{
 let calls=0;const waits=[];
 assert.equal(await retryMedia(async()=>{if(++calls<3)throw Error('segment_http_503');return 'checked';},{pause:async ms=>waits.push(ms)}),'checked');
 assert.equal(calls,3);assert.deepEqual(waits,[1500,3000]);
 calls=0;await assert.rejects(retryMedia(async()=>{calls++;throw Error('media_http_404');},{pause:async()=>{}}),/404/);assert.equal(calls,1);
 calls=0;await assert.rejects(retryMedia(async()=>{calls++;throw TypeError('fetch failed');},{pause:async()=>{}}),/fetch failed/);assert.equal(calls,3);
 calls=0;await assert.rejects(retryMedia(async()=>{calls++;throw Error('invalid_media_segment');},{pause:async()=>{}}),/invalid_media/);assert.equal(calls,1);
});
