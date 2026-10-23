import sharp from 'sharp';
const siteOrigin=process.env.SITE_ORIGIN||'https://yomiku.site';
const mediaHeaders={Origin:siteOrigin,Referer:siteOrigin+'/'};
function requireCORS(response){const allow=response.headers.get('access-control-allow-origin');if(allow!=='*'&&allow!==siteOrigin)throw Error('media_cors_unavailable');}
import {hlsRenditions} from '../../src/hls-renditions.js';
export async function bytes(url,max=12000000,{headers={},cors=false}={}){
 const u=new URL(url);if(u.protocol!=='https:'||u.username||u.password)throw Error('unsafe_media_url');
 const r=await fetch(u,{headers,signal:AbortSignal.timeout(18000)});if(!r.ok)throw Error(`media_http_${r.status}`);
 if(cors)requireCORS(r);
 const reader=r.body.getReader(),parts=[];let size=0;
 try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>max)throw Error('media_too_large');parts.push(value);}}finally{await reader.cancel();}
 return {data:Buffer.concat(parts),type:r.headers.get('content-type')||''};
}
const images=new Map();
export function probeImage(url){
 if(!images.has(url))images.set(url,(async()=>{
  const {data}=await bytes(url);const img=sharp(data,{failOn:'warning',limitInputPixels:50000000});
  const {width,height}=await img.metadata();await img.resize({width:8,height:8,fit:'inside'}).raw().toBuffer();
  if(width<200||height<200)throw Error('artwork_too_small');return {url,width,height};
 })().catch(e=>{images.delete(url);throw e;}));return images.get(url);
}
export async function probeStream(source,depth=0){
 if(depth>3)throw Error('playlist_recursion');
 const {data}=await bytes(source.url,2000000,{headers:mediaHeaders,cors:true});const text=data.toString('utf8');
 if(!text.startsWith('#EXTM3U'))throw Error('not_hls');
 const variants=hlsRenditions(text,source.url);
 if(variants.length){const out=[];for(const v of variants)if([360,480,720,1080].includes(v.quality))out.push(...await probeStream({...v,stream:true},depth+1));return out;}
 const lines=text.split(/\r?\n/),segment=lines.find(l=>l.trim()&&!l.startsWith('#'));
 const duration=[...text.matchAll(/#EXTINF:([\d.]+)/g)].reduce((s,m)=>s+Number(m[1]),0);
 if(!segment||!duration||!text.includes('#EXT-X-ENDLIST'))throw Error('incomplete_media_playlist');
 for(const match of text.matchAll(/#EXT-X-(?:KEY|MAP):[^\n]*URI="([^"]+)"/g))await bytes(new URL(match[1],source.url).href,2000000,{headers:mediaHeaders,cors:true});
 const u=new URL(segment.trim(),source.url);
 const r=await fetch(u,{headers:{...mediaHeaders,Range:'bytes=0-1023'},signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw Error(`segment_http_${r.status}`);
 requireCORS(r);
 const reader=r.body.getReader();let chunk;try{chunk=(await reader.read()).value;}finally{await reader.cancel();}
 if(!chunk?.length||/text\/html|application\/json/i.test(r.headers.get('content-type')||''))throw Error('invalid_media_segment');
 return [{...source,stream:true,duration,checkedAt:new Date().toISOString()}];
}
