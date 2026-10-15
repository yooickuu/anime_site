import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {transform} from 'esbuild';
import vm from 'node:vm';
const source=(await readFile(new URL('../supabase/functions/delete-account/index.ts',import.meta.url),'utf8')).replace(/^import .*;\n/m,'');
const code=(await transform(source,{loader:'ts',format:'iife'})).code;
function harness({authorized=true,configured=true,removeError=false}={}){
 let handler;const calls=[];let listed=0;
 const api={auth:{getUser:async()=>({data:{user:authorized?{id:'alice'}:null},error:authorized?null:Error()}),admin:{deleteUser:async(id,soft)=>{calls.push(['delete',id,soft]);return {};}}},rpc:async()=>({data:configured}),storage:{from:bucket=>({list:async uid=>{calls.push(['list',bucket,uid]);return {data:listed++?[]:[{id:'photo',name:'old.png'},{id:'other',name:'new.png'}]};},remove:async paths=>{calls.push(['remove',...paths]);return {error:removeError?Error():null};}})}};
 vm.runInNewContext(code,{Deno:{env:{get:()=> 'server-only-test-value'},serve:fn=>handler=fn},createClient:()=>api,Response,Error});
 const request=(body={confirm:true,expectedUserId:'alice'})=>handler(new Request('https://example.test/delete-account',{method:'POST',headers:{Authorization:'Bearer test-token','Content-Type':'application/json'},body:JSON.stringify(body)}));
 return {request,calls};
}
test('account deletion verifies identity and explicit confirmation before touching data',async()=>{
 for(const [options,body,expected] of [[{authorized:false},{confirm:true},401],[{}, {confirm:false},400],[{}, {confirm:true,expectedUserId:'bob'},409],[{configured:false},{confirm:true,expectedUserId:'alice'},503]]){
  const h=harness(options);assert.equal((await h.request(body)).status,expected);assert.deepEqual(h.calls,[]);
 }
});
test('all own avatars are removed before hard deletion of the authenticated account',async()=>{
 const h=harness();const response=await h.request();assert.equal(response.status,200);
 assert.deepEqual(await response.json(),{deleted:true});
 assert.deepEqual(h.calls,[['list','avatars','alice'],['remove','alice/old.png','alice/new.png'],['list','avatars','alice'],['delete','alice',false]]);
});
test('a storage cleanup failure stops account deletion so it can be retried',async()=>{
 const h=harness({removeError:true});assert.equal((await h.request()).status,500);assert.equal(h.calls.some(x=>x[0]==='delete'),false);
});
