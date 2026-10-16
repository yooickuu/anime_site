// Public sign-in endpoint. No email address is returned before password verification.
const allowed=new Set(['https://yooickuu.github.io','http://127.0.0.1:4173','http://localhost:4173','http://127.0.0.1:5500','http://localhost:5500']);
Deno.serve(async request=>{
 const origin=request.headers.get('origin');
 const headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin',
  'Access-Control-Allow-Origin':origin&&allowed.has(origin)?origin:'https://yooickuu.github.io',
  'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS'};
 const reply=(status:number,body:object)=>new Response(JSON.stringify(body),{status,headers});
 if(origin&&!allowed.has(origin))return reply(403,{code:'forbidden'});
 if(request.method==='OPTIONS')return new Response(null,{headers});
 if(request.method!=='POST')return reply(405,{code:'method_not_allowed'});
 const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),anon=Deno.env.get('SUPABASE_ANON_KEY');
 if(!url||!key||!anon)return reply(503,{code:'login_unavailable'});
 try{
  if(Number(request.headers.get('content-length'))>4096)return reply(400,{code:'invalid_credentials'});
  const raw=await request.text();if(raw.length>4096)return reply(400,{code:'invalid_credentials'});
  let body;try{body=JSON.parse(raw);}catch{return reply(400,{code:'invalid_credentials'});}
  if(typeof body.nickname!=='string'||!body.nickname.trim()||body.nickname.length>160||typeof body.password!=='string'||!body.password||body.password.length>128)return reply(400,{code:'invalid_credentials'});
  const encoder=new TextEncoder();
  const hmac=await crypto.subtle.importKey('raw',encoder.encode(key),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const ip=request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||'unknown';
  const digest=await crypto.subtle.sign('HMAC',hmac,encoder.encode(ip));
  const client_key=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
  const lookup=await fetch(url+'/rest/v1/rpc/yoru_login_lookup',{method:'POST',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({candidate:body.nickname,client_key}),signal:AbortSignal.timeout(10000)});
  if(!lookup.ok)return reply(503,{code:'login_unavailable'});
  const account=await lookup.json();
  if(account.limited)return reply(429,{code:'over_request_rate_limit'});
  if(!account.email)return reply(400,{code:'invalid_credentials'});
  const auth=await fetch(url+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:anon,'Content-Type':'application/json'},body:JSON.stringify({email:account.email,password:body.password}),signal:AbortSignal.timeout(15000)});
  const session=await auth.json();
  if(!auth.ok)return reply(auth.status===429?429:400,{code:auth.status===429?'over_request_rate_limit':session.code==='email_not_confirmed'?'email_not_confirmed':'invalid_credentials'});
  if(!session.access_token||!session.refresh_token)return reply(503,{code:'login_unavailable'});
  return reply(200,{access_token:session.access_token,refresh_token:session.refresh_token});
 }catch{return reply(503,{code:'login_unavailable'});}
});
