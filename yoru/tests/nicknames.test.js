import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanNickname,checkNickname,nicknameErrorKey} from '../src/nicknames.js';
test('nickname validation normalizes Unicode and spaces before checking the server',async()=>{
 let args;const client={rpc:async(name,input)=>{args={name,input};return {data:true};}};
 assert.equal(await checkNickname(client,'  Ｙｏｏｉｃｋｕｕ　 Name  '),'Yooickuu Name');
 assert.deepEqual(args,{name:'yoru_nickname_available',input:{candidate:'Yooickuu Name'}});
 assert.equal(cleanNickname('海　　月'),'海 月');
});
test('taken names, unavailable database checks and blank names cannot pass validation',async()=>{
 await assert.rejects(checkNickname({rpc:async()=>({data:false})},'taken'),{message:'nicknameTaken'});
 await assert.rejects(checkNickname({rpc:async()=>({error:{code:'PGRST202'}})},'name'),{message:'nicknameCheckFailed'});
 await assert.rejects(checkNickname({},'  '),{message:'invalidName'});
 await assert.rejects(checkNickname({},'x'.repeat(41)),{message:'invalidName'});
});
test('a race rejected by the database is shown as a nickname collision only for its constraint',()=>{
 assert.equal(nicknameErrorKey({code:'23505',message:'duplicate key violates unique constraint "yoru_nicknames_unique"'}),'nicknameTaken');
 assert.equal(nicknameErrorKey({code:'23505',message:'different_constraint'}),null);
});
