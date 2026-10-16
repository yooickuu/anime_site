import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {build} from 'esbuild';
test('video resolver checks session, origin and input before upstream access',async()=>{
 const result=await build({entryPoints:['supabase/functions/anime-source/index.ts'],bundle:true,write:false,format:'iife',platform:'neutral',target:'es2022'});let handler,calls=[];
 const ctx={Request,Response,Headers,URL,URLSearchParams,AbortSignal,TextDecoder,Uint8Array,atob,fetch:async(url,opts)=>{calls.push(url);return new Response(JSON.stringify(opts.headers.Authorization==='Bearer good'?{id:'test-user'}:{error:'invalid'}),{status:opts.headers.Authorization==='Bearer good'?200:401});},Deno:{env:{get:key=>({SUPABASE_URL:'https://project.supabase.co',SUPABASE_ANON_KEY:'public'})[key]},serve:fn=>handler=fn}};
 vm.runInNewContext(result.outputFiles[0].text,ctx);
 const call=(body,headers={})=>handler(new Request('https://project.supabase.co/functions/v1/anime-source',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)}));
 assert.equal((await call({action:'release',id:65})).status,401);assert.equal(calls.length,0);
 assert.equal((await call({action:'release',id:65},{Origin:'https://evil.test',Authorization:'Bearer good'})).status,403);assert.equal(calls.length,0);
 assert.equal((await call({action:'release',id:65},{Authorization:'Bearer fake'})).status,401);
 assert.equal((await call({action:'release',id:'https://evil.test'},{Authorization:'Bearer good'})).status,400);
 assert.equal((await call({action:'video',id:65,ordinal:1,audio:'http://evil.test'},{Authorization:'Bearer good'})).status,400);
 assert.ok(calls.every(x=>x==='https://project.supabase.co/auth/v1/user'));
});

test('source health remains false when the upstream catalogue rejects server requests',async()=>{
 const result=await build({entryPoints:['supabase/functions/anime-source/index.ts'],bundle:true,write:false,format:'iife',platform:'neutral',target:'es2022'});let handler,requests=0;
 const ctx={Request,Response,Headers,URL,URLSearchParams,AbortSignal,TextDecoder,Uint8Array,atob,fetch:async()=>{requests++;return new Response('Unavailable',{status:500});},Deno:{env:{get:()=>''},serve:fn=>handler=fn}};
 vm.runInNewContext(result.outputFiles[0].text,ctx);
 for(let i=0;i<2;i++){const r=await handler(new Request('https://project.supabase.co/functions/v1/anime-source'));const d=await r.json();assert.equal(d.ready,false);assert.equal(d.sourceStatus,'upstream_500');}
 assert.equal(requests,1);
});
test('snapshot resolver serves authenticated episodes and checks video without calling AnimeGO',async()=>{
 const result=await build({entryPoints:['supabase/functions/anime-source/index.ts'],bundle:true,write:false,format:'iife',platform:'neutral',target:'es2022'});let handler;const calls=[];
 const snapshot={id:4013,total:1,episodes:[{id:10,ordinal:1,voices:[{id:'go-76',label:'Субтитры',language:'ja',subtitles:true,url:'https://kodikplayer.com/video/10/abcdef/720p'}]}]};
 const fetcher=async(url)=>{url=String(url);calls.push(url);
  if(url.endsWith('/auth/v1/user'))return Response.json({id:'user'});
  if(url.endsWith('/4013.json'))return Response.json(snapshot);
  if(url.includes('/video/10/'))return new Response(`var urlParams = '{}'; vInfo.type = 'video'; vInfo.id = '10'; vInfo.hash = 'abcdef'; <script src="/assets/js/app.player_single.abc.js"></script>`);
  if(url.endsWith('.js'))return new Response('type:"POST",url:atob("L2FwaQ==")');
  if(url.endsWith('/api'))return Response.json({links:{720:[{src:'https://cdn.example/720.m3u8'}]}});
  if(url==='https://cdn.example/720.m3u8')return new Response('#EXTM3U\n#EXTINF:10\n1.ts');
  throw Error('Unexpected upstream '+url);
 };
 vm.runInNewContext(result.outputFiles[0].text,{Request,Response,Headers,URL,URLSearchParams,AbortSignal,TextDecoder,Uint8Array,atob,fetch:fetcher,Deno:{env:{get:k=>k==='SUPABASE_URL'?'https://project.supabase.co':'public'},serve:fn=>handler=fn}});
 const health=await (await handler(new Request('https://project.supabase.co/functions/v1/anime-source'))).json();assert.equal(health.ready,true);assert.equal(health.version,5);
 const r=await handler(new Request('https://project.supabase.co/functions/v1/anime-source',{method:'POST',headers:{Authorization:'Bearer good'},body:JSON.stringify({action:'release',id:4013})}));
 assert.equal(r.status,200);const release=await r.json();assert.equal(release.episodes.length,1);assert.equal(release.voices[0].language,'ja');assert.equal(release.voices[0].url,undefined);
 assert.ok(calls.every(x=>!x.includes('animego.me')));
});
