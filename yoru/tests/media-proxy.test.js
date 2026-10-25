import test from 'node:test';import assert from 'node:assert/strict';
import {createMediaProxy,mediaURL} from '../server/media-proxy.js';
const endpoint='https://project.supabase.co/functions/v1/anime-source',base='https://cloud.solodcdn.com/anime/master.m3u8';
const make=(options={})=>createMediaProxy({secret:'test-only-secret',endpoint,...options});
test('proxy rejects unsigned, tampered, expired and private/foreign destinations before network',async()=>{
 let requests=0;const proxy=make({fetcher:async()=>{requests++;throw Error();}});
 assert.equal((await proxy.handle(new Request(endpoint+'?stream=1&url=https://127.0.0.1'))).status,403);
 const signed=await proxy.sign(base),tampered=new URL(signed);tampered.searchParams.set('p',tampered.searchParams.get('p')+'a');assert.equal((await proxy.handle(new Request(tampered))).status,403);
 const expired=await proxy.sign(base,Math.floor(Date.now()/1000)-1);assert.equal((await proxy.handle(new Request(expired))).status,403);
 for(const url of ['http://cloud.solodcdn.com/a.ts','https://127.0.0.1/a.ts','https://cloud.solodcdn.com.evil.test/a.ts','https://user@cloud.solodcdn.com/a.ts'])assert.throws(()=>mediaURL(url));
 assert.equal(requests,0);
});
test('master variants, media segments, encryption keys and init fragments all stay behind proxy',async()=>{
 const proxy=make();const input='#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,URI="audio/list.m3u8"\n#EXT-X-STREAM-INF:BANDWIDTH=300000\n720/list.m3u8\n#EXT-X-KEY:METHOD=AES-128,URI="key.bin"\n#EXT-X-MAP:URI="init.mp4"\n#EXTINF:6,\n//sky.solodcdn.com/part.ts';
 const output=await proxy.playlist(input,base,Math.floor(Date.now()/1000)+600);
 const links=[...output.matchAll(/URI="([^"]+)"/g)].map(x=>x[1]).concat(output.split('\n').filter(x=>x&&!x.startsWith('#')));
 assert.equal(links.length,5);for(const link of links){assert.equal(new URL(link).origin,new URL(endpoint).origin);const decoded=await proxy.verify(new URL(link));assert.ok(decoded.url.includes('solodcdn.com/'));}
 await assert.rejects(proxy.playlist('#EXTM3U\nhttps://evil.test/steal.ts',base,9999999999),/not_allowed/);
});
test('HLS manifests and ranged segments are served with CORS, types and required origin headers',async()=>{
 const requests=[];const proxy=make({fetcher:async(url,options)=>{requests.push({url,options});return url.endsWith('.m3u8')?new Response('#EXTM3U\n#EXTINF:6,\npart.ts'):new Response(new Uint8Array([71,0,1]),{status:206,headers:{'Content-Range':'bytes 0-2/10','Accept-Ranges':'bytes'}});}});
 const signed=await proxy.sign(base),manifest=await proxy.handle(new Request(signed));assert.equal(manifest.status,200);assert.equal(manifest.headers.get('content-type'),'application/x-mpegURL');assert.equal(manifest.headers.get('access-control-allow-origin'),'*');
 const segment=(await manifest.text()).split('\n').at(-1);const response=await proxy.handle(new Request(segment,{headers:{Range:'bytes=0-2'}}));assert.equal(response.status,206);assert.equal(response.headers.get('content-type'),'video/mp2t');assert.equal(response.headers.get('content-range'),'bytes 0-2/10');assert.equal((await response.arrayBuffer()).byteLength,3);
 assert.equal(requests[1].options.headers.Range,'bytes=0-2');assert.equal(requests[0].options.headers.Referer,'https://kodik.cc/');assert.equal(requests[0].options.headers.Origin,'https://kodik.cc/');
});
test('upstream redirect cannot turn signed CDN access into an open proxy',async()=>{
 const proxy=make({fetcher:async()=>new Response(null,{status:302,headers:{Location:'http://169.254.169.254/latest/'}})});
 const response=await proxy.handle(new Request(await proxy.sign(base)));assert.equal(response.status,502);
});
test('browser only accepts exact-audio signed proxy sources, never old direct URLs on failure',async()=>{
 const {refreshKodikMedia}=await import('../src/kodik-playback.js');const proxy=make(),media={audioId:'kodik-1',sources:[{url:base,quality:720}]},config={supabaseUrl:'https://project.supabase.co',supabaseKey:'public'};
 const fresh=await proxy.video(media);const result=await refreshKodikMedia(media,config,'mal-1',1,{fetcher:async()=>Response.json(fresh)});assert.equal(result.proxied,true);assert.equal(result.sources.length,1);
 await assert.rejects(refreshKodikMedia(media,config,'mal-1',1,{fetcher:async()=>Response.json(media)}),/proxyUnavailable/);
 await assert.rejects(refreshKodikMedia(media,config,'mal-1',1,{fetcher:async()=>new Response('',{status:502})}),/providerError/);
});
test('VOD cache survives proxy instances, expires after ten minutes and never caches live playlists',async()=>{
 let time=Date.now(),calls=0;const cache=new Map();
 const options={cache,now:()=>time,fetcher:async()=>{calls++;return new Response('#EXTM3U\n#EXTINF:6,\npart.ts\n#EXT-X-ENDLIST');}};
 let proxy=make(options),signed=await proxy.sign(base);
 assert.equal((await proxy.handle(new Request(signed))).headers.get('cache-control'),'private, max-age=600');
 proxy=make(options);await proxy.handle(new Request(signed));assert.equal(calls,1);
 time+=600001;await proxy.handle(new Request(signed));assert.equal(calls,2);
 const live=make({...options,cache:new Map(),fetcher:async()=>{calls++;return new Response('#EXTM3U\n#EXTINF:6,\npart.ts');}});
 assert.equal((await live.handle(new Request(signed))).headers.get('cache-control'),'no-store');await live.handle(new Request(signed));assert.equal(calls,4);
});
test('network retries use three attempts and 1500ms pauses, not retries for HTTP or caller cancellation',async()=>{
 const {networkRetry}=await import('../server/network-retry.js');let attempts=0;const pauses=[];
 const result=await networkRetry(async()=>{if(++attempts<3)throw new DOMException('timeout','TimeoutError');return 'ok';},{wait:async ms=>pauses.push(ms)});
 assert.equal(result,'ok');assert.equal(attempts,3);assert.deepEqual(pauses,[1500,1500]);
 attempts=0;await assert.rejects(networkRetry(async()=>{attempts++;throw Error('upstream_403');},{wait:async()=>{}}),/403/);assert.equal(attempts,1);
 attempts=0;await assert.rejects(networkRetry(async()=>{attempts++;throw TypeError('fetch failed');},{wait:async()=>{}}));assert.equal(attempts,3);
 const signal=AbortSignal.abort();await assert.rejects(networkRetry(async()=>{attempts++;},{signal}));assert.equal(attempts,3);
});
