import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {secureVostURL} from '../src/animevost.js';
import {probeVideo} from './probe-video.mjs';
const args=process.argv.slice(2),value=(name,fallback)=>{const i=args.indexOf(name);return i<0?fallback:args[i+1];};
let items=JSON.parse(await readFile('dist/data/animevost-index.json','utf8')).items;
if(args.includes('--retry-failed')){
 const previous=JSON.parse(await readFile('checks/animevost-audit.json','utf8'));
 const failed=new Set(previous.rows.filter(r=>!['ok','no_stream'].includes(r.video)).map(r=>r.id));
 items=items.filter(a=>failed.has(a.id));
}
const limit=Number(value('--limit',items.length));
if(!Number.isInteger(limit)||limit<1)throw Error('Invalid --limit');
items=items.slice(0,limit);
const output=value('--output','checks/animevost-audit.json');
let cursor=0;const rows=[];
async function worker(){while(cursor<items.length){
 const a=items[cursor++],row={id:a.id,title:a.title};
 try{
  const r=await fetch('https://api.animevost.org/v1/playlist',{method:'POST',body:new URLSearchParams({id:String(a.id)}),signal:AbortSignal.timeout(12000)});
  if(!r.ok)throw Error('playlist_http_'+r.status);
  const episodes=await r.json();if(!Array.isArray(episodes))throw Error('invalid_playlist');
  episodes.sort((a,b)=>parseFloat(a.name)-parseFloat(b.name));
  row.episodes=episodes.length;row.withStreams=episodes.filter(x=>secureVostURL(x.hd)||secureVostURL(x.std)).length;
  const e=episodes[0];row.hd=await probeVideo(secureVostURL(e?.hd));row.sd=await probeVideo(secureVostURL(e?.std));
  row.video=[row.hd,row.sd].includes('ok')?'ok':row.hd==='no_stream'&&row.sd==='no_stream'?'no_stream':'unavailable';
 }catch(e){row.video=e.message;}
 rows.push(row);if(rows.length%10===0)console.log('Checked',rows.length,'/',items.length);
 await new Promise(resolve=>setTimeout(resolve,200));
}}
await Promise.all(Array.from({length:4},worker));
const summary={checkedAt:new Date().toISOString(),releases:rows.length,episodes:rows.reduce((n,r)=>n+(r.episodes||0),0),firstVideoOK:rows.filter(r=>r.video==='ok').length,sdFallback:rows.filter(r=>r.hd!=='ok'&&r.sd==='ok').length,noStream:rows.filter(r=>r.video==='no_stream').length,errors:rows.filter(r=>!['ok','no_stream'].includes(r.video)).length};
await mkdir('checks',{recursive:true});await writeFile(output,JSON.stringify({summary,rows},null,2));console.log(JSON.stringify(summary));
