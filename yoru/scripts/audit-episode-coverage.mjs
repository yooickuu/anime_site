// Checks every linked playlist in batches; does not download video files.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {episodeManifest} from '../src/episode-manifest.js';
import {availableEpisodes} from '../src/provider.js';
import {vostEpisodeNumbers} from '../src/animevost.js';
const data=JSON.parse(await readFile('dist/data/animevost-index.json','utf8'));
const items=data.items.filter(a=>a.libertyId),results=[];let cursor=0;
async function json(url,options){const r=await fetch(url,{...options,signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('HTTP '+r.status);return r.json();}
async function worker(){while(cursor<items.length){const a=items[cursor++];
 const [lib,vost]=await Promise.allSettled([
  json('https://api.anilibria.app/api/v1/anime/releases/'+a.libertyId),
  json('https://api.animevost.org/v1/playlist',{method:'POST',body:new URLSearchParams({id:String(a.id)})})]);
 const l=lib.status==='fulfilled'&&!lib.value.is_blocked_by_geo&&!lib.value.is_blocked_by_copyrights?availableEpisodes(lib.value.episodes||[]).map(e=>e.ordinal):[];
 const v=vost.status==='fulfilled'&&Array.isArray(vost.value)?vostEpisodeNumbers(vost.value):[];
 const merged=episodeManifest(l,v,lib.status==='fulfilled'?lib.value.episodes_total:null).map(e=>e.ordinal),max=Math.floor(merged.at(-1)||0),present=new Set(merged),first=Math.max(1,Math.floor(merged[0]||1));
 results.push({id:a.canonicalId,title:a.title,liberty:l.length,vost:v.length,combined:merged.length,additionalToLiberty:merged.length-l.length,last:merged.at(-1)||null,missing: max<=10000?Array.from({length:Math.max(0,max-first+1)},(_,i)=>i+first).filter(n=>!present.has(n)):[],errors:[lib,vost].flatMap((r,i)=>r.status==='rejected'?[{source:i?'vost':'liberty',message:r.reason.message}]:[])});
 if(results.length%100===0)console.log(`Checked ${results.length}/${items.length}`);
 await new Promise(r=>setTimeout(r,175));
}}
await Promise.all(Array.from({length:4},worker));
const report={checkedAt:new Date().toISOString(),checked:results.length,expanded:results.filter(r=>r.additionalToLiberty>0).length,additionalEpisodes:results.reduce((n,r)=>n+r.additionalToLiberty,0),errors:results.filter(r=>r.errors.length).length,results};
await mkdir('checks',{recursive:true});await writeFile('checks/episode-coverage.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({...report,results:undefined}));
