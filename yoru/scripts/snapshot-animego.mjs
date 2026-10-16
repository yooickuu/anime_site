// Materialize public episode/translation metadata; never stores signed stream URLs.
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {goRelease,goVoices,validateSnapshot} from '../server/animego.js';
const file='dist/data/animego-index.json',dir='dist/data/animego-episodes';
const index=JSON.parse(await readFile(file,'utf8'));
await mkdir(dir,{recursive:true});
const limit=Number(process.env.SNAPSHOT_LIMIT||60),maxEpisodes=Number(process.env.SNAPSHOT_MAX_EPISODES||24);
const wanted=(process.env.SNAPSHOT_IDS||'').split(',').filter(Boolean).map(Number);
const completeAudio=x=>(x.voices||[]).filter(v=>v.language==='ru').length>=2&&(x.voices||[]).some(v=>v.language==='ja');
const items=index.items.filter(x=>x.hasKodik&&!x.ambiguous&&(!wanted.length||wanted.includes(x.id))&&x.episodes<=maxEpisodes&&(!x.snapshotAt||Date.now()-Date.parse(x.snapshotAt)>86400000))
 .sort((a,b)=>Number(b.id===4013)-Number(a.id===4013)||a.episodes-b.episodes||Number(completeAudio(b))-Number(completeAudio(a))).slice(0,limit);
let next=0,done=0,requests=0,errors=[];
const requestLimit=Number(process.env.SNAPSHOT_REQUEST_LIMIT||240);
async function paced(fn){if(requests++>=requestLimit)throw Error('request_budget');const wait=Math.max(0,next-Date.now());await new Promise(r=>setTimeout(r,wait));next=Date.now()+1100;return fn();}
async function save(){index.updatedAt=new Date().toISOString();await writeFile(file+'.tmp',JSON.stringify(index));await rename(file+'.tmp',file);}
for(const item of items){
 try{
  const release=await paced(()=>goRelease(item.id)),episodes=[];
  if(!release.episodes.length||release.episodes.length>maxEpisodes)continue;
  for(const e of release.episodes){const voices=await paced(()=>goVoices(item.id,e.ordinal));episodes.push({...e,voices});}
  const snapshot=validateSnapshot({id:item.id,total:episodes.length,updatedAt:new Date().toISOString(),episodes},item.id);
  // A missing episode translation is retained as unavailable, never invented.
  if(episodes.some(e=>!e.voices.length))throw Error('missing_episode_audio');
  await writeFile(dir+'/'+item.id+'.json.tmp',JSON.stringify(snapshot));await rename(dir+'/'+item.id+'.json.tmp',dir+'/'+item.id+'.json');
  item.snapshotAt=snapshot.updatedAt;item.snapshotEpisodes=snapshot.total;
  item.completeAudio=episodes.every(e=>new Set(e.voices.filter(v=>v.language==='ru').map(v=>v.label.toLowerCase())).size>=2&&e.voices.some(v=>v.language==='ja'));
  await save();done++;if(done%10===0)console.log('Complete episode catalogues',done,'/',items.length);
 }catch(e){errors.push({id:item.id,error:e.message});if(e.message==='request_budget'||/upstream_(403|429)/.test(e.message)){console.log('Source requested a stop:',e.message);break;}}
}
await mkdir('checks',{recursive:true});await writeFile('checks/animego-snapshots.json',JSON.stringify({at:new Date().toISOString(),done,errors},null,2));
console.log({done,errors:errors.length,ready:index.items.filter(x=>x.snapshotAt).length});
