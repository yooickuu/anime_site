// Bounded read-only audit: all release/episode metadata, one HLS manifest per
// available release, and a media-byte sample for a small varied subset.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
const root='https://api.anilibria.app/api/v1',origin='http://127.0.0.1:4173';
const index=JSON.parse(await readFile('dist/data/liberty-index.json','utf8')).items;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function get(url,options={}){
 for(let attempt=0;attempt<3;attempt++){
  try{const r=await fetch(url,{...options,headers:{Origin:origin,...options.headers},signal:AbortSignal.timeout(15000)});
   if(r.status===429||r.status>=500){await r.body?.cancel();await wait(2000*(attempt+1));continue;}return r;
  }catch(e){if(attempt===2)throw e;await wait(600);}
 }throw Error('rate_or_server_error');
}
const releases=[],failures=[];
for(let i=0;i<index.length;i+=50){
 const batch=index.slice(i,i+50);
 try{const r=await get(root+'/anime/releases/list?limit=50&ids='+batch.map(x=>x.id).join(',')+'&include=id,name,year,type,mal,episodes,is_blocked_by_geo,is_blocked_by_copyrights');if(!r.ok)throw Error('HTTP '+r.status);const d=await r.json();releases.push(...d.data);const seen=new Set(d.data.map(x=>x.id));for(const x of batch)if(!seen.has(x.id))failures.push({id:x.id,error:'release_missing'});
 }catch(e){failures.push(...batch.map(x=>({id:x.id,error:e.message})));}
 if(i%250===0)console.log('Metadata',Math.min(i+50,index.length),'/',index.length);
 await wait(150);
}
await mkdir('checks',{recursive:true});
// Short-lived URLs remain in local QA data only, never in the published index.
await writeFile('checks/video-metadata.json',JSON.stringify(releases));
const rows=releases.map(r=>{const episodes=[...(r.episodes||[])].sort((a,b)=>(a.sort_order??a.ordinal)-(b.sort_order??b.ordinal));return {id:r.id,title:r.name?.main,type:r.type?.value,year:r.year,blocked:!!(r.is_blocked_by_geo||r.is_blocked_by_copyrights),episodes:episodes.length,missingStreams:episodes.filter(e=>![e.hls_720,e.hls_1080,e.hls_480].some(Boolean)).map(e=>e.ordinal),manifest:'not_checked'};});
let cursor=0,done=0;
async function manifest(url,depth=0){
 const r=await get(url);if(!r.ok){await r.body?.cancel();throw Error('HTTP '+r.status);}
 const cors=r.headers.get('access-control-allow-origin');if(cors!=='*'&&cors!==origin)throw Error('cors_missing');
 const content=await r.text();if(!content.trimStart().startsWith('#EXTM3U'))throw Error('invalid_manifest');
 const lines=content.split(/\r?\n/).map(x=>x.trim());const first=lines.find(x=>x&&!x.startsWith('#'));
 if(lines.some(x=>x.startsWith('#EXT-X-STREAM-INF'))&&first&&depth<2)return manifest(new URL(first,url).href,depth+1);
 return {url,segment:first?new URL(first,url).href:null};
}
async function worker(){while(cursor<releases.length){const i=cursor++,r=releases[i],row=rows[i];try{
 if(row.blocked)row.manifest='blocked';
 else{const episodes=[...(r.episodes||[])].sort((a,b)=>(a.sort_order??a.ordinal)-(b.sort_order??b.ordinal)),e=episodes.find(e=>e.hls_720||e.hls_1080||e.hls_480);if(!e)row.manifest='no_stream';else{const m=await manifest(e.hls_720||e.hls_1080||e.hls_480);row.manifest='ok';if(i%60===0&&m.segment){const s=await get(m.segment,{headers:{Range:'bytes=0-1023'}});const reader=s.body?.getReader();const chunk=await reader?.read();await reader?.cancel();row.segment=(s.ok&&chunk?.value?.length>0)?'ok':'HTTP '+s.status;}}}
 }catch(e){row.manifest=e.message;}done++;if(done%100===0)console.log('Manifests',done,'/',releases.length);await wait(150);}}
await Promise.all(Array.from({length:4},worker));
const summary={checkedAt:new Date().toISOString(),indexed:index.length,releases:rows.length,episodes:rows.reduce((n,r)=>n+r.episodes,0),withStreams:rows.filter(r=>!r.blocked&&r.episodes>r.missingStreams.length).length,manifestOK:rows.filter(r=>r.manifest==='ok').length,blocked:rows.filter(r=>r.blocked).length,noStream:rows.filter(r=>r.manifest==='no_stream').length,manifestErrors:rows.filter(r=>!['ok','blocked','no_stream'].includes(r.manifest)).length,missingEpisodeStreams:rows.reduce((n,r)=>n+r.missingStreams.length,0),segmentSamples:rows.filter(r=>r.segment).length,segmentOK:rows.filter(r=>r.segment==='ok').length};
await writeFile('checks/video-audit.json',JSON.stringify({summary,failures,rows},null,2));console.log(summary);
