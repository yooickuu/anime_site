import {transportOptions} from './animego.js';
// Signed, read-only Kodik CDN proxy. Never accepts an unsigned destination.
const encoder=new TextEncoder(),decoder=new TextDecoder();
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, HEAD, OPTIONS','Access-Control-Allow-Headers':'Range','Access-Control-Expose-Headers':'Content-Range, Accept-Ranges, Content-Length','X-Content-Type-Options':'nosniff'};
const encode=bytes=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const decode=value=>Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
export function mediaURL(value,base){
 const u=new URL(value,base);
 if(u.protocol!=='https:'||u.username||u.password||u.port||!(u.hostname==='solodcdn.com'||u.hostname.endsWith('.solodcdn.com')))throw Error('media_host_not_allowed');
 if(u.href.length>6000)throw Error('media_url_too_long');
 return u;
}
export function createMediaProxy({secret,endpoint,fetcher=fetch,now=Date.now,cryptoAPI=crypto}){
 if(!secret)throw Error('proxy_not_configured');
 const key=cryptoAPI.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
 async function sign(url,expires=Math.floor(now()/1000)+7200){
  const target=mediaURL(url).href,payload=encode(encoder.encode(JSON.stringify({url:target,expires})));
  const signature=encode(new Uint8Array(await cryptoAPI.subtle.sign('HMAC',await key,encoder.encode(payload))));
  const result=new URL(endpoint);result.search='';result.searchParams.set('stream','1');result.searchParams.set('p',payload);result.searchParams.set('s',signature);return result.href;
 }
 async function verify(url){
  const p=url.searchParams.get('p')||'',s=url.searchParams.get('s')||'';
  if(p.length>9000||!s||!p)throw Error('invalid_media_signature');
  let data;try{if(!await cryptoAPI.subtle.verify('HMAC',await key,decode(s),encoder.encode(p)))throw Error();data=JSON.parse(decoder.decode(decode(p)));}catch{throw Error('invalid_media_signature');}
  if(!Number.isSafeInteger(data.expires)||data.expires<=now()/1000||data.expires>now()/1000+7210)throw Error('media_signature_expired');
  return {...data,url:mediaURL(data.url).href};
 }
 async function playlist(text,base,expires){
  if(!text.trimStart().startsWith('#EXTM3U'))throw Error('invalid_media_playlist');
  return (await Promise.all(text.split(/\r?\n/).map(async line=>{
   if(!line.trim())return line;
   if(!line.startsWith('#'))return sign(mediaURL(line.trim(),base).href,expires);
   // Covers keys, initialization fragments, alternate audio and child manifests.
   const matches=[...line.matchAll(/\bURI="([^"]+)"/g)];
   for(const m of matches)line=line.replace(m[0],`URI="${await sign(mediaURL(m[1],base).href,expires)}"`);
   return line;
  }))).join('\n');
 }
 async function upstream(url,request){
  let target=mediaURL(url);const range=request.headers.get('range');
  if(range&&!/^bytes=(?:\d+-\d*|-\d+)$/.test(range))throw Error('invalid_media_range');
  for(let i=0;i<4;i++){
   const response=await fetcher(target.href,{...transportOptions(),method:request.method==='HEAD'?'HEAD':'GET',redirect:'manual',signal:AbortSignal.any([request.signal,AbortSignal.timeout(25000)]),headers:{Referer:'https://kodik.cc/',Origin:'https://kodik.cc/','Accept-Encoding':'identity',...(range?{Range:range}:{})}});
   if([301,302,303,307,308].includes(response.status)){const location=response.headers.get('location');await response.body?.cancel();if(!location)throw Error('invalid_media_redirect');target=mediaURL(location,target);continue;}
   return {response,url:target.href};
  }
  throw Error('media_redirect_loop');
 }
 async function handle(request){
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405,headers:cors});
  let token;try{token=await verify(new URL(request.url));}catch{return new Response('Invalid or expired media link',{status:403,headers:{...cors,'Cache-Control':'no-store'}});}
  try{
   const {response:r,url}=await upstream(token.url,request);
   if(!r.ok){await r.body?.cancel();return new Response(null,{status:[403,404,410,416].includes(r.status)?r.status:502,headers:{...cors,'Cache-Control':'no-store'}});}
   const isPlaylist=/\.m3u8(?:$|\?)/i.test(url)||/mpegurl/i.test(r.headers.get('content-type')||'');
   const headers={...cors,'Cache-Control':'private, max-age=30','Content-Type':isPlaylist?'application/x-mpegURL':/\.ts(?:$|\?)/i.test(url)?'video/mp2t':/\.(?:m4s|mp4)(?:$|\?)/i.test(url)?'video/mp4':'application/octet-stream'};
   if(request.method==='HEAD'){await r.body?.cancel();return new Response(null,{status:r.status,headers});}
   if(isPlaylist){
    const reader=r.body.getReader();let size=0,parts=[];
    try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2000000)throw Error('media_playlist_too_large');parts.push(value);}}finally{await reader.cancel().catch(()=>{});}
    const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
    return new Response(await playlist(decoder.decode(bytes),url,token.expires),{headers});
   }
   for(const name of ['content-range','accept-ranges'])if(r.headers.has(name))headers[name]=r.headers.get(name);
   return new Response(r.body,{status:r.status,headers});
  }catch{return new Response('Media upstream unavailable',{status:502,headers:{...cors,'Cache-Control':'no-store'}});}
 }
 async function video(value){
  const sources=await Promise.all(value.sources.map(async s=>({...s,url:await sign(s.url),stream:true})));
  return {...value,sources,url:(sources.find(s=>s.quality===720)||sources[0])?.url,stream:true,proxied:true};
 }
 return {sign,verify,playlist,handle,video};
}
