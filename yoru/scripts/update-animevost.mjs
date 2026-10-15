import {mkdir,writeFile,rename} from 'node:fs/promises';
const items=new Map();let total=0;
for(let page=1;;page++){
 const r=await fetch('https://api.animevost.org/v1/last?page='+page+'&quantity=40',{signal:AbortSignal.timeout(20000)});
 if(!r.ok)throw Error('AnimeVost HTTP '+r.status);const d=await r.json();if(!Array.isArray(d.data)&&items.size>=total*.95&&page>1)break;if(d.state?.status!=='ok'||!Array.isArray(d.data))throw Error('Invalid catalogue');total=Number(d.state.count);
 for(const a of d.data)items.set(a.id,{id:a.id,title:a.title,year:a.year,type:a.type,genre:a.genre,image:a.urlImagePreview,episodes:(a.series?.match(/['"]\s*:\s*['"]/g)||[]).length,rating:Number(a.rating)||0,votes:Number(a.votes)||0});
 console.log('AnimeVost',items.size,'/',total);if(d.data.length<40||page*40>=total)break;await new Promise(r=>setTimeout(r,200));
}
if(items.size<total*.95)throw Error('Incomplete catalogue; keeping previous index');
await mkdir('dist/data',{recursive:true});await writeFile('dist/data/animevost-index.json.tmp',JSON.stringify({updatedAt:new Date().toISOString(),total,items:[...items.values()]}));
await rename('dist/data/animevost-index.json.tmp','dist/data/animevost-index.json');
