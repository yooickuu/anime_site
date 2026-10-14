import {readFile,writeFile} from 'node:fs/promises';
import {secureVostURL} from '../src/animevost.js';
const items=JSON.parse(await readFile('dist/data/animevost-index.json','utf8')).items;
let cursor=0,done=0;const rows=[];
async function worker(){while(cursor<items.length){const a=items[cursor++],row={id:a.id,title:a.title};try{
 const r=await fetch('https://api.animevost.org/v1/playlist',{method:'POST',body:new URLSearchParams({id:String(a.id)}),signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error('playlist_http_'+r.status);const episodes=await r.json();if(!Array.isArray(episodes))throw Error('invalid_playlist');row.episodes=episodes.length;row.withStreams=episodes.filter(x=>secureVostURL(x.hd)||secureVostURL(x.std)).length;
 const e=episodes[0],url=e&&(secureVostURL(e.hd)||secureVostURL(e.std));if(!url)row.video='no_stream';else{const h=await fetch(url,{method:'HEAD',signal:AbortSignal.timeout(12000)});row.video=h.ok&&h.headers.get('content-type')?.startsWith('video/')?'ok':'http_'+h.status;}
 }catch(e){row.video=e.message;}rows.push(row);done++;if(done%200===0)console.log('AnimeVost videos',done,'/',items.length);await new Promise(r=>setTimeout(r,200));}}
await Promise.all(Array.from({length:4},worker));
const summary={checkedAt:new Date().toISOString(),releases:rows.length,episodes:rows.reduce((n,r)=>n+(r.episodes||0),0),withStreams:rows.reduce((n,r)=>n+(r.withStreams||0),0),firstVideoOK:rows.filter(r=>r.video==='ok').length,noStream:rows.filter(r=>r.video==='no_stream').length,errors:rows.filter(r=>!['ok','no_stream'].includes(r.video)).length};
await writeFile('checks/animevost-audit.json',JSON.stringify({summary,rows},null,2));console.log(summary);
