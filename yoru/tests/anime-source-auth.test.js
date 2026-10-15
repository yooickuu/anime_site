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
