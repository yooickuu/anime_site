export function cleanNickname(value){return String(value||'').normalize('NFKC').replace(/\s+/gu,' ').trim();}
export function nicknameErrorKey(error){return error?.code==='23505'&&/yoru_nicknames_unique/.test(error.message||'')?'nicknameTaken':null;}
export async function checkNickname(client,value){
 const name=cleanNickname(value);
 if(!name||[...name].length>40)throw Error('invalidName');
 const {data,error}=await client.rpc('yoru_nickname_available',{candidate:name});
 if(error||typeof data!=='boolean')throw Error('nicknameCheckFailed');
 if(!data)throw Error('nicknameTaken');
 return name;
}
export function nicknameChecker(check,show){
 let generation=0,timer;
 return {schedule(input){const current=++generation;clearTimeout(timer);show(input,'');
   if(!input.value.trim())return;
   timer=setTimeout(async()=>{try{await check(input.value);if(current===generation&&input.isConnected)show(input,'');}catch(e){if(current===generation&&input.isConnected)show(input,e.message);}},400);
 }};
}
