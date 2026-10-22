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
