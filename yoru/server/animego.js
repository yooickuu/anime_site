// Public AnimeGO player metadata. Never accepts user-supplied upstream URLs.
export const GO_ORIGIN='https://animego.me';
export function decodeHTML(s=''){return s.replace(/&#(x[0-9a-f]+|\d+);|&(amp|quot|apos|lt|gt|nbsp);/gi,(_,n,k)=>{if(n){const c=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n);return c<=0x10ffff?String.fromCodePoint(c):'';}return {amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',nbsp:' '}[k.toLowerCase()];});}
export function plain(s=''){return decodeHTML(s.replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim();}
export function attrs(tag){return Object.fromEntries([...tag.matchAll(/([\w-]+)\s*=\s*"([^"]*)"/g)].map(m=>[m[1],decodeHTML(m[2])]));}
function tags(html){return html.match(/<(?:[^>"']|"[^"]*"|'[^']*')+>/g)||[];}
export function positiveID(n){return Number.isSafeInteger(Number(n))&&Number(n)>0&&Number(n)<100000000;}
export function parseEpisodes(html){const map=new Map();for(const tag of tags(html).filter(t=>t.includes('data-episode-number="'))){const a=attrs(tag),ordinal=Number(a['data-episode-number']),id=Number(a['data-episode']);if(Number.isFinite(ordinal)&&ordinal>=0&&positiveID(id)){if(map.has(ordinal)&&map.get(ordinal).id!==id)throw Error('ambiguous_episode');map.set(ordinal,{ordinal,id});}}return [...map.values()].sort((a,b)=>a.ordinal-b.ordinal);}
export function parseVoices(html){const map=new Map();for(const tag of tags(html).filter(t=>t.includes('data-player="'))){const a=attrs(tag);if(a['data-provider-slug']!=='kodik'||!positiveID(a['data-ptranslation']))continue;let u;try{u=new URL(a['data-player'],GO_ORIGIN);}catch{continue;}if(u.protocol!=='https:'||u.hostname!=='kodikplayer.com'||u.port||u.username||u.password||!/^\/(?:seria|serial|video)\/\d+\/[a-z0-9]+\//.test(u.pathname))continue;const label=plain(a['data-translation-title']).slice(0,100),id='go-'+a['data-ptranslation'];map.set(id,{id,label,language:/субтитр/i.test(label)?'ja':'ru',subtitles:/субтитр/i.test(label),url:u.href});}return [...map.values()];}
export function parseCatalogue(html){return html.split(/<div class="ani-list__item\s/).slice(1).flatMap(block=>{const link=block.match(/href="(\/anime\/[^"/?]+-(\d+))"/);if(!link)return [];const title=plain(block.match(/<a[^>]*class="text-line-clamp"[^>]*>([\s\S]*?)<\/a>/)?.[1]);const english=plain(block.match(/<div class="fw-lighter small[^>]*>([\s\S]*?)<\/div>/)?.[1]);const type=block.match(/href="\/anime\/type\/([^"/]+)"/)?.[1];const image=decodeHTML(block.match(/<img[^>]*src="([^"]+)"/)?.[1]||'');if(!title||!image.startsWith('https://img.cdngos.com/'))return [];return [{id:Number(link[2]),path:link[1],title,english,year:Number(block.match(/href="\/anime\/season\/(\d{4})"/)?.[1])||null,type:({tv:'TV',movie:'MOVIE',ova:'OVA',ona:'ONA',special:'SPECIAL'})[type]||null,image,genres:[...block.matchAll(/href="\/anime\/genre\/[^\"]+"[^>]*>([^<]+)</g)].map(m=>plain(m[1])),description:plain(block.match(/<div class="ani-list__item-description[^>]*>([\s\S]*?)<\/div>/)?.[1])}];});}
export function parsePlayer(html){const tag=tags(html).find(t=>t.includes('data-anime-player-episodes-total-value="'))||'';const a=attrs(tag),episodes=parseEpisodes(html),voices=parseVoices(html);const total=Number(a['data-anime-player-episodes-total-value']);const ranges=JSON.parse(a['data-anime-player-episodes-pages-value']||'[]');if(!Number.isSafeInteger(total)||total<0||total>10000||!Array.isArray(ranges)||ranges.length>100)throw Error('invalid_episode_count');return {total,ranges,episodes,voices};}
export function decodeStream(value){if(/^https?:|^\/\//.test(value))return value;const base64=value.replace(/[a-z]/gi,c=>{const base=c<='Z'?65:97;return String.fromCharCode(base+(c.charCodeAt(0)-base+18)%26);});return atob(base64);}
export function parseStreams(links={}){const result=[];for(const [q,list]of Object.entries(links)){const quality=Number(q);if(![240,360,480,720,1080,1440,2160].includes(quality)||!Array.isArray(list))continue;for(const item of list){try{const u=new URL(decodeStream(item.src),'https://kodikplayer.com');if(u.protocol==='https:'&&!u.username&&!u.password&&/\.m3u8(?:$|\?)/.test(u.href)){result.push({quality,url:u.href});break;}}catch{}}}return result.sort((a,b)=>b.quality-a.quality);}
const cache=new Map();
async function cached(key,ttl,load){const old=cache.get(key);if(old&&old.until>Date.now())return old.promise;const promise=load();cache.set(key,{until:Date.now()+ttl,promise});if(cache.size>600)cache.delete(cache.keys().next().value);try{return await promise;}catch(e){cache.delete(key);throw e;}}
let upstreamClient;
function transportOptions(){
 if(typeof globalThis.Deno?.createHttpClient!=='function')return {};
 // Some upstream servers terminate Deno HTTP/2 connections prematurely.
 upstreamClient??=globalThis.Deno.createHttpClient({http1:true,http2:false,poolMaxIdlePerHost:0});
 return {client:upstreamClient};
}
export async function textFetch(url,options={}){
 for(let attempt=0;attempt<2;attempt++){
  try{return await readUpstream(url,options);}
  catch(error){if(attempt||!/unexpected EOF|connection (?:reset|closed)|http2/i.test(error.message))throw error;}
 }
}
async function readUpstream(url,options={}){
 const allowed=new Set([new URL(url).hostname,'kodikplayer.com','kodik.info','kodik.biz','kodik.cc','yomiku.site','www.yomiku.site']);
 let current=new URL(url),method=options.method||'GET',body=options.body;
 for(let hop=0;hop<4;hop++){
  const r=await fetch(current,{...options,...transportOptions(),method,body,headers:{'Accept-Encoding':'identity','User-Agent':'yomiku/1.0 (+https://yomiku.site/)',...options.headers},redirect:'manual',signal:AbortSignal.timeout(15000)});
  if([301,302,303,307,308].includes(r.status)){
   const location=r.headers.get('location');await r.body?.cancel();
   if(!location)throw Error('upstream_redirect_missing');const next=new URL(location,current);
   if(next.protocol!=='https:'||!allowed.has(next.hostname)||next.username||next.password||next.port)throw Error('upstream_redirect_blocked');
   if(r.status===303||([301,302].includes(r.status)&&method==='POST')){method='GET';body=undefined;}
   current=next;continue;
  }
  if(!r.ok){await r.body?.cancel();throw Error('upstream_'+r.status);}
  const reader=r.body.getReader();let size=0,parts=[];
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>3000000)throw Error('upstream_too_large');parts.push(value);}}finally{try{await reader.cancel();}catch{}}
  const bytes=new Uint8Array(size);let i=0;for(const p of parts){bytes.set(p,i);i+=p.length;}return new TextDecoder().decode(bytes);
 }
 throw Error('upstream_redirect_loop');
}
export async function goJSON(path){if(!/^\/player\/(?:\d+(?:\/episodes\?page=\d+)?|videos\/\d+)$/.test(path))throw Error('invalid_path');const raw=await textFetch(GO_ORIGIN+path,{headers:{'X-Requested-With':'XMLHttpRequest',Accept:'application/json'}});const d=JSON.parse(raw);if(d.status!=='success'||typeof d.data?.content!=='string')throw Error('invalid_player');return d.data;}
export async function goRelease(id){if(!positiveID(id))throw Error('invalid_id');return cached('release:'+id,300000,async()=>{const d=await goJSON('/player/'+id),p=parsePlayer(d.content);const map=new Map(p.episodes.map(e=>[e.ordinal,e]));const pages=p.ranges.filter(r=>r.page>0||map.size<Number(r.count));for(let start=0;start<pages.length;start+=3){const batch=await Promise.all(pages.slice(start,start+3).map(async r=>{if(!Number.isSafeInteger(r.page)||r.page<0||r.page>100)throw Error('invalid_page');const d=await goJSON('/player/'+id+'/episodes?page='+r.page);if(Number(d.page)!==r.page||Number(d.total)!==p.total)throw Error('changed_playlist');return parseEpisodes(d.content);}));for(const list of batch)for(const e of list){if(map.has(e.ordinal)&&map.get(e.ordinal).id!==e.id)throw Error('ambiguous_episode');map.set(e.ordinal,e);}}if(map.size!==p.total)throw Error('incomplete_playlist');return {episodes:[...map.values()].sort((a,b)=>a.ordinal-b.ordinal),voices:p.voices.map(({url,...v})=>v)};});}
export async function goVoices(animeId,ordinal){const release=await goRelease(animeId);const episode=release.episodes.find(e=>e.ordinal===Number(ordinal));if(!episode)throw Error('episode_missing');return cached('voices:'+episode.id,120000,async()=>parseVoices((await goJSON('/player/videos/'+episode.id)).content));}
export async function goVideo(animeId,ordinal,audio){const voices=await goVoices(animeId,ordinal),voice=voices.find(v=>v.id===audio);if(!voice)throw Error('audio_missing');return kodikVideo(voice.url,ordinal);}
export async function kodikVideo(url,ordinal){if(!validEmbed(url))throw Error('invalid_embed');return cached('stream:'+url,45000,async()=>{const html=await textFetch(url);const params=JSON.parse(html.match(/var\s+urlParams\s*=\s*'([^']+)'/)?.[1]||'null');const script=html.match(/src="(\/assets\/js\/app\.player_single\.[a-z0-9]+\.js)"/)?.[1];if(!params||!script)throw Error('player_changed');const endpoint=await cached(script,3600000,async()=>{const js=await textFetch('https://kodikplayer.com'+script);const encoded=js.match(/type:"POST",url:atob\("([^"]+)"\)/)?.[1];if(!encoded)throw Error('player_changed');const path=atob(encoded);if(!/^\/[a-z0-9_-]+$/.test(path))throw Error('invalid_endpoint');return path;});const body={};for(const key of ['d','d_sign','pd','pd_sign','ref','ref_sign'])body[key]=params[key]||'';for(const key of ['type','id','hash']){body[key]=html.match(new RegExp("vInfo\\."+key+"\\s*=\\s*'([^']+)'"))?.[1];if(!body[key])throw Error('player_changed');}const data=JSON.parse(await textFetch('https://kodikplayer.com'+endpoint,{method:'POST',body:new URLSearchParams(body)}));const sources=parseStreams(data.links);if(!sources.length)throw Error('no_streams');return {sources,url:(sources.find(s=>s.quality===720)||sources[0]).url,stream:true,ordinal:Number(ordinal),opening:null,ending:null};});}

export function validEmbed(value){try{const u=new URL(value);return u.protocol==='https:'&&u.hostname==='kodikplayer.com'&&!u.port&&!u.username&&!u.password&&/^\/(?:seria|serial|video)\/\d+\/[a-z0-9]+\//.test(u.pathname);}catch{return false;}}
const SNAPSHOT_BASE='https://yomiku.site/data/animego-episodes/';
export function validateSnapshot(data,id){
 if(!data||data.id!==Number(id)||!Array.isArray(data.episodes)||!Number.isInteger(data.total)||data.total<1||data.total>10000||data.total!==data.episodes.length)throw Error('invalid_snapshot');
 const ordinals=new Set();
 for(const e of data.episodes){
  if(!Number.isFinite(e.ordinal)||e.ordinal<0||e.ordinal>10000||ordinals.has(e.ordinal)||!positiveID(e.id)||!Array.isArray(e.voices)||e.voices.length>100)throw Error('invalid_snapshot');
  ordinals.add(e.ordinal);const voices=new Set();
  for(const v of e.voices){if(!/^go-\d+$/.test(v.id)||voices.has(v.id)||!validEmbed(v.url)||typeof v.label!=='string'||v.label.length>100||!['ru','ja'].includes(v.language))throw Error('invalid_snapshot');voices.add(v.id);}
 }
 return data;
}
export async function goSnapshot(id){if(!positiveID(id))throw Error('invalid_id');return cached('snapshot:'+id,120000,async()=>validateSnapshot(JSON.parse(await textFetch(SNAPSHOT_BASE+id+'.json')),id));}
export async function snapshotRelease(id){const d=await goSnapshot(id);return {episodes:d.episodes.map(({id,ordinal})=>({id,ordinal})),voices:d.episodes[0].voices.map(({url,...v})=>v)};}
export async function snapshotVoices(id,ordinal){const d=await goSnapshot(id),e=d.episodes.find(e=>e.ordinal===Number(ordinal));if(!e)throw Error('episode_missing');return e.voices;}
export async function snapshotVideo(id,ordinal,audio){const v=(await snapshotVoices(id,ordinal)).find(v=>v.id===audio);if(!v)throw Error('audio_missing');return kodikVideo(v.url,ordinal);}
export async function snapshotHealth(){const d=await goSnapshot(4013),e=d.episodes[0],v=e.voices.find(v=>v.language==='ja')||e.voices[0];if(!v)throw Error('audio_missing');const video=await kodikVideo(v.url,e.ordinal);const manifest=await textFetch(video.url);if(!manifest.startsWith('#EXTM3U'))throw Error('invalid_manifest');return true;}
