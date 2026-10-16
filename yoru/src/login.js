export async function signInIdentifier(client,identifier,password,config,fetcher=fetch){
 const value=String(identifier).trim();
 let emailResult;
 if(value.includes('@')){
  emailResult=await client.auth.signInWithPassword({email:value,password});
  if(!emailResult.error||emailResult.error.code!=='invalid_credentials')return emailResult;
 }
 try{
  const response=await fetcher(config.supabaseUrl+'/functions/v1/login-nickname',{method:'POST',headers:{apikey:config.supabaseKey,'Content-Type':'application/json'},body:JSON.stringify({nickname:value,password}),signal:AbortSignal.timeout(25000)});
  const data=await response.json();
  if(!response.ok)return emailResult||{error:{code:data.code||'login_unavailable',status:response.status}};
  if(typeof data.access_token!=='string'||typeof data.refresh_token!=='string')return {error:{code:'login_unavailable'}};
  return client.auth.setSession({access_token:data.access_token,refresh_token:data.refresh_token});
 }catch{return emailResult||{error:{code:'login_unavailable'}};}
}
