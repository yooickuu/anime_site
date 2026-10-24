// Read-only bulk completeness audit. It never removes existing catalogue entries.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
const publication=JSON.parse(await readFile('src/published-catalog.json','utf8'));
const items=publication.items.filter(a=>a.ids?.shikimori),incomplete=[],unknown=[];let checked=0;
for(let i=0;i<items.length;i+=50){
 const batch=items.slice(i,i+50),response=await fetch('https://shikimori.io/api/graphql',{method:'POST',headers:{'Content-Type':'application/json','User-Agent':'yomiku/1.0 (+https://yomiku.site/)'},body:JSON.stringify({query:'query($ids:String){animes(ids:$ids,limit:50){id episodes episodesAired status}}',variables:{ids:batch.map(a=>a.ids.shikimori).join(',')}}),signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error('metadata_http_'+response.status);
 const body=await response.json();if(!Array.isArray(body.data?.animes))throw Error('invalid_metadata');
 const byId=new Map(body.data.animes.map(a=>[Number(a.id),a]));
 for(const a of batch){const m=byId.get(Number(a.ids.shikimori)),expected=m?.status==='ongoing'?m.episodesAired:m?.status==='released'?m.episodes:0;const available=a.episodes.filter(e=>e.season!==0).length||a.episodes.length;checked++;if(!expected)unknown.push(a.id);else if(available<expected)incomplete.push({id:a.id,shikimori:a.ids.shikimori,title:a.title,available,expected});}
 await mkdir('checks',{recursive:true});await writeFile('checks/episode-coverage-report.json',JSON.stringify({checked,total:publication.items.length,incomplete,unknown},null,2));
 console.log(`Coverage ${checked}/${items.length}; incomplete ${incomplete.length}; unknown ${unknown.length}`);
 if(i+50<items.length)await new Promise(r=>setTimeout(r,350));
}
