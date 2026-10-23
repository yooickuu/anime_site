import {publishedKodikVideo} from '../../../server/published-kodik.js';
import {snapshotRelease as goRelease,snapshotVoices as goVoices,snapshotVideo as goVideo,snapshotHealth,positiveID} from '../../../server/animego.js';
const origins=new Set(['https://yomiku.site','https://www.yomiku.site','https://yooickuu.github.io','http://127.0.0.1:4173','http://localhost:4173','http://127.0.0.1:5500','http://localhost:5500']);
let healthCache:{at:number,ready:boolean,status:string,detail?:string}|null=null;
const limits=new Map<string,{at:number,count:number}>();
Deno.serve(async req=>{
 const origin=req.headers.get('Origin')||'';
 const headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin',...(origins.has(origin)?{'Access-Control-Allow-Origin':origin}:{})};
 const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
 if(origin&&!origins.has(origin))return reply({error:'origin_not_allowed'},403);
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'GET, POST, OPTIONS'}});
 if(req.method==='GET'&&new URL(req.url).searchParams.get('source')==='kodik'){
  try{const video=await publishedKodikVideo('mal-28285',1,'kodik-4243');return reply({ready:true,version:10,qualities:video.sources.map(s=>s.quality)});}
  catch(error){const message=error instanceof Error?error.message:'unknown';return reply({ready:false,version:10,detail:message.replace(/https?:\/\/[^\s)]+/g,'[upstream]').replace(/[a-zA-Z0-9]{24,}/g,'[redacted]').slice(0,220)},502);}
 }
 if(req.method==='GET'){if(!healthCache||Date.now()-healthCache.at>60000){try{await snapshotHealth();healthCache={at:Date.now(),ready:true,status:'ok'};}catch(e){const m=e instanceof Error?e.message:'unknown';healthCache={at:Date.now(),ready:false,status:/^[a-z_]+(?:_\d+)?$/.test(m)?m:'source_unavailable',detail:m.replace(/https?:\/\/[^\s)]+/g,'[upstream]').slice(0,180)};}}return reply({ready:healthCache.ready,version:10,kodikPlayback:true,guestPlayback:true,sourceStatus:healthCache.status,...(healthCache.detail?{detail:healthCache.detail}:{})});}
 if(req.method!=='POST')return reply({error:'method_not_allowed'},405);
 // Public read-only catalogue/video endpoint. Account data stays behind Auth/RLS.
 try{
  const key=req.headers.get('x-forwarded-for')?.split(',')[0].trim()||'unknown';
  const now=Date.now();let limit=limits.get(key);
  if(!limit||now-limit.at>60000)limit={at:now,count:0};
  limit.count++;limits.set(key,limit);
  if(limits.size>1000)for(const [id,l]of limits)if(now-l.at>60000)limits.delete(id);
  if(limit.count>60)return reply({error:'too_many_requests'},429);
  const raw=await req.text();if(raw.length>512)return reply({error:'invalid_request'},400);
  let body;try{body=JSON.parse(raw);}catch{return reply({error:'invalid_request'},400);}
  if(!body||typeof body!=='object')return reply({error:'invalid_request'},400);
  if(body.action==='kodik-video')return reply(await publishedKodikVideo(body.id,body.episode,body.audio));
  const id=Number(body.id),ordinal=Number(body.ordinal);
  if(!positiveID(id))return reply({error:'invalid_id'},400);
  if(body.action==='release')return reply(await goRelease(id));
  if(!Number.isFinite(ordinal)||ordinal<0||ordinal>10000)return reply({error:'invalid_episode'},400);
  if(body.action==='voices')return reply({voices:(await goVoices(id,ordinal)).map(({url,...v})=>v)});
  if(body.action==='video'&&/^go-\d+$/.test(body.audio||''))return reply(await goVideo(id,ordinal,body.audio));
  return reply({error:'invalid_request'},400);
 }catch(error){const message=error instanceof Error?error.message:'';console.warn('anime-source failure',/^[a-z_]+(?:_\d+)?$/.test(message)?message:(error instanceof Error?error.name:'unknown'));return reply({error:['episode_missing','audio_missing','incomplete_playlist','changed_playlist'].includes(message)?message:'source_unavailable',sourceStatus:/^[a-z_]+(?:_\d+)?$/.test(message)?message:'network_or_response_error'},502);}
});
