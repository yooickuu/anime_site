import {hlsRenditions} from './hls-renditions.js';
const qualities=[360,480,720,1080];
function safeURL(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch{return null;}}

// Discovery output deliberately contains no successful probe. A label or
// manifest is not proof that the media decodes at the claimed resolution.
export function discoverRenditions({manifest,manifestURL,api}={}){
 if(manifest!==undefined)return hlsRenditions(manifest,manifestURL).filter(s=>qualities.includes(s.quality)).map(s=>({...s,stream:true}));
 const out=[];
 const add=(quality,value)=>{
  quality=Number(String(quality).replace(/p$/i,''));
  const url=safeURL(typeof value==='string'?value:value?.url||value?.src||value?.file);
  if(qualities.includes(quality)&&url)out.push({quality,url,stream:false});
 };
 if(Array.isArray(api))for(const s of api.slice(0,32))add(s?.quality||s?.height||s?.label,s);
 else if(api&&typeof api==='object'){
  for(const q of qualities)for(const key of [`url_${q}`,`mp4_${q}`,String(q),q+'p'])if(api[key])add(q,api[key]);
  for(const key of ['sources','files','links'])if(Array.isArray(api[key]))for(const s of api[key].slice(0,32))add(s?.quality||s?.height||s?.label,s);
  if(api.quality||api.height)add(api.quality||api.height,api);
 }
 return [...new Map(out.map(s=>[s.quality+':'+s.url,s])).values()].sort((a,b)=>a.quality-b.quality);
}
