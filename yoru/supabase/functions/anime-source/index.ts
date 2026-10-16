import {snapshotRelease as goRelease,snapshotVoices as goVoices,snapshotVideo as goVideo,snapshotHealth,positiveID} from '../../../server/animego.js';
const origins=new Set(['https://yooickuu.github.io','http://127.0.0.1:4173','http://localhost:4173','http://127.0.0.1:5500','http://localhost:5500']);
let healthCache:{at:number,ready:boolean,status:string,detail?:string}|null=null;
const limits=new Map<string,{at:number,count:number}>();
Deno.serve(async req=>{
 const origin=req.headers.get('Origin')||'';
 const headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin',...(origins.has(origin)?{'Access-Control-Allow-Origin':origin}:{})};
 const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
 if(origin&&!origins.has(origin))return reply({error:'origin_not_allowed'},403);
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'GET, POST, OPTIONS'}});
 if(req.method==='GET'){if(!healthCache||Date.now()-healthCache.at>60000){try{await snapshotHealth();healthCache={at:Date.now(),ready:true,status:'ok'};}catch(e){const m=e instanceof Error?e.message:'unknown';healthCache={at:Date.now(),ready:false,status:/^[a-z_]+(?:_\d+)?$/.test(m)?m:'source_unavailable',detail:m.replace(/https?:\/\/[^\s)]+/g,'[upstream]').slice(0,180)};}}return reply({ready:healthCache.ready,version:5,sourceStatus:healthCache.status,...(healthCache.detail?{detail:healthCache.detail}:{})});}
 if(req.method!=='POST')return reply({error:'method_not_allowed'},405);
 const authorization=req.headers.get('Authorization');
 if(!authorization?.startsWith('Bearer '))return reply({error:'unauthorized'},401);
 try{
  const auth=await fetch(Deno.env.get('SUPABASE_URL')+'/auth/v1/user',{headers:{Authorization:authorization,apikey:Deno.env.get('SUPABASE_ANON_KEY')||''},signal:AbortSignal.timeout(10000)});
  if(!auth.ok){await auth.body?.cancel();return reply({error:'unauthorized'},401);}
  const user=await auth.json();if(!user.id)return reply({error:'unauthorized'},401);
  const now=Date.now();let limit=limits.get(user.id);if(!limit||now-limit.at>60000)limit={at:now,count:0};limit.count++;limits.set(user.id,limit);if(limits.size>1000)for(const [id,l]of limits)if(now-l.at>60000)limits.delete(id);
  if(limit.count>60)return reply({error:'too_many_requests'},429);
  const raw=await req.text();if(raw.length>512)return reply({error:'invalid_request'},400);
  const body=JSON.parse(raw),id=Number(body.id),ordinal=Number(body.ordinal);
  if(!positiveID(id))return reply({error:'invalid_id'},400);
  if(body.action==='release')return reply(await goRelease(id));
  if(!Number.isFinite(ordinal)||ordinal<0||ordinal>10000)return reply({error:'invalid_episode'},400);
  if(body.action==='voices')return reply({voices:(await goVoices(id,ordinal)).map(({url,...v})=>v)});
  if(body.action==='video'&&/^go-\d+$/.test(body.audio||''))return reply(await goVideo(id,ordinal,body.audio));
  return reply({error:'invalid_request'},400);
 }catch(error){const message=error instanceof Error?error.message:'';console.warn('anime-source failure',/^[a-z_]+(?:_\d+)?$/.test(message)?message:(error instanceof Error?error.name:'unknown'));return reply({error:['episode_missing','audio_missing','incomplete_playlist','changed_playlist'].includes(message)?message:'source_unavailable'},502);}
});
