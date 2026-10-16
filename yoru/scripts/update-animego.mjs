import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {parseCatalogue,parsePlayer,goJSON} from '../server/animego.js';
import {identityIndex,exactIdentity,identityKeys,adjacentMovieIdentity} from '../src/catalog-match.js';
import {cleanTitle,animeType} from '../src/animevost.js';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
let nextRequest=0;
async function throttle(){const delay=Math.max(0,nextRequest-Date.now());nextRequest=Date.now()+delay+1100;await wait(delay);}
async function get(page){const file='checks/animego-pages/'+page+'.html';try{const cached=await readFile(file,'utf8');if(!process.env.FRESH)return cached;}catch{}for(let n=0;n<4;n++){await throttle();const r=await fetch('https://animego.me/anime'+(page>1?'/'+page:''),{signal:AbortSignal.timeout(20000)});if(r.status===429){await r.body?.cancel();const delay=Math.max(60000,Number(r.headers.get('retry-after')||0)*1000);console.log('Rate limit; waiting',delay/1000,'seconds');await wait(delay);continue;}if(!r.ok)throw Error('HTTP '+r.status);const html=await r.text();await writeFile(file,html);return html;}throw Error('Rate limited; checkpoint retained');}
async function pool(items,fn){for(const item of items)await fn(item);}
await mkdir('checks/animego-pages',{recursive:true});
await mkdir('checks',{recursive:true});
const first=await get(1),total=Number(first.match(/data-infinite-scroll-total-items-value="(\d+)"/)?.[1]),size=Number(first.match(/data-infinite-scroll-page-size-value="(\d+)"/)?.[1]);
if(!total||!size||total>50000)throw Error('Invalid catalogue count');
const byId=new Map(parseCatalogue(first).map(x=>[x.id,x]));let done=1;
await pool(Array.from({length:Math.ceil(total/size)-1},(_,i)=>i+2),async page=>{const items=parseCatalogue(await get(page));if(!items.length)throw Error('Empty page '+page);for(const x of items)byId.set(x.id,x);if(++done%25===0)console.log('Catalogue pages',done,'/',Math.ceil(total/size));});
if(byId.size!==total)throw Error('Incomplete catalogue '+byId.size+'/'+total+'; previous index preserved');
const items=[...byId.values()];await writeFile('checks/animego-catalogue.json',JSON.stringify({total,items}));
let existing=[];try{existing=JSON.parse(await readFile('dist/data/animego-index.json','utf8')).items;}catch{}
const old=new Map(existing.map(x=>[x.id,x]));done=0;const errors=[];let checked=0;const scanLimit=Number(process.env.SCAN_LIMIT||100);
const scanOrder=items.slice().sort((a,b)=>Number(!!old.get(a.id)?.checkedAt)-Number(!!old.get(b.id)?.checkedAt));
await pool(scanOrder,async x=>{try{const cached=old.get(x.id);if(cached?.checkedAt&&Date.now()-Date.parse(cached.checkedAt)<24*3600000){Object.assign(x,{episodes:cached.episodes,voices:cached.voices,hasKodik:cached.hasKodik,checkedAt:cached.checkedAt});}else if(checked++<scanLimit){await throttle();const d=await goJSON('/player/'+x.id),p=parsePlayer(d.content);x.episodes=p.total;x.voices=p.voices.map(({url,...v})=>v);x.hasKodik=p.voices.length>0;x.checkedAt=new Date().toISOString();}else if(cached){Object.assign(x,{episodes:cached.episodes,voices:cached.voices,hasKodik:cached.hasKodik,checkedAt:cached.checkedAt});}else{x.hasKodik=null;}}catch(e){x.hasKodik=null;errors.push({id:x.id,error:e.message});if(e.message==='upstream_429'){console.log('Player rate limit: pausing');await wait(60000);}}if(++done%250===0)console.log('Player metadata',done,'/',items.length);});
const lib=JSON.parse(await readFile('dist/data/liberty-index.json','utf8')).items,vost=JSON.parse(await readFile('dist/data/animevost-index.json','utf8')).items;
const canonical=[...lib.map(x=>({...x,id:x.malId?'mal-'+x.malId:'lib-'+x.id,providerId:x.id})),...vost.filter(x=>!x.libertyId).map(x=>({id:'vost-'+x.id,animeVostId:x.id,names:cleanTitle(x.title).split(/\s+\/\s+/),year:Number(x.year),type:animeType(x.type)}))];
const identities=identityIndex(canonical),goIdentities=identityIndex(items.map(x=>({...x,names:[x.english]})));let linked=0,ambiguous=0;
for(const x of items){const a={...x,names:[x.title,x.english]},match=exactIdentity(a,identities)||(!identityKeys(a).some(k=>identities.has(k))?adjacentMovieIdentity(a,canonical):null);if(match){x.canonicalId=match.id;x.providerId=match.providerId||null;x.animeVostId=match.animeVostId||null;x.malId=match.malId||null;linked++;}else if(identityKeys(a).some(k=>(identities.get(k)||[]).length>1)){x.ambiguous=true;ambiguous++;}if(!exactIdentity(a,goIdentities)){x.ambiguous=true;ambiguous++;}}
for(const x of items){const prior=old.get(x.id);if(prior?.snapshotAt&&prior.snapshotEpisodes===x.episodes){x.snapshotAt=prior.snapshotAt;x.snapshotEpisodes=prior.snapshotEpisodes;x.completeAudio=prior.completeAudio;}}
const summary={checkedAt:new Date().toISOString(),total:items.length,linked,withKodik:items.filter(x=>x.hasKodik).length,additional:items.filter(x=>x.hasKodik&&!x.canonicalId&&!x.ambiguous).length,ambiguous,errors:errors.length};
await writeFile('checks/animego-import.json',JSON.stringify({summary,errors},null,2));
if(errors.length>items.length*.1)throw Error('Too many unavailable player responses; previous index preserved');
await writeFile('dist/data/animego-index.json.tmp',JSON.stringify({updatedAt:summary.checkedAt,items}));await rename('dist/data/animego-index.json.tmp','dist/data/animego-index.json');console.log(summary);
