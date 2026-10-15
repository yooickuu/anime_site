// Read-only provider audit. Does not download episodes or publish any data.
import {writeFile,mkdir,rename} from 'node:fs/promises';
const base='https://api.anilibria.app/api/v1/anime/catalog/releases';
const releaseIndex=[];
const ids=new Set(),missingPosters=[],duplicates=[],types={},examples=[];
let expected=0,pages=1,ongoing=0;
for(let page=1;page<=pages;page++){
  const url=new URL(base);url.search=new URLSearchParams({page:String(page),limit:'50','f[sorting]':'YEAR_ASC'});
  const res=await fetch(url,{signal:AbortSignal.timeout(20000)});
  if(!res.ok)throw Error(`Page ${page}: HTTP ${res.status}`);
  const data=await res.json();expected=data.meta.pagination.total;pages=data.meta.pagination.total_pages;
  for(const r of data.data){
    releaseIndex.push({id:r.id,malId:r.mal?.id||null,title:r.name?.main||r.name?.english,english:r.name?.english,year:r.year,type:r.type?.value});
    if(ids.has(r.id))duplicates.push(r.id);ids.add(r.id);
    if(!(r.poster?.src||r.poster?.optimized?.src))missingPosters.push({id:r.id,title:r.name?.main});
    const type=r.type?.value||'unknown';types[type]=(types[type]||0)+1;
    if(r.is_ongoing)ongoing++;
    if(page===1||page===pages)examples.push({id:r.id,title:r.name?.main,year:r.year});
  }
  if(page%10===0)console.log(`Checked ${page}/${pages} pages, ${ids.size} releases`);
  if(page<pages)await new Promise(resolve=>setTimeout(resolve,450));
}
const report={checkedAt:new Date().toISOString(),provider:base,expected,uniqueReleases:ids.size,pages,duplicates,missingPosters,ongoing,types,examples};
await mkdir('checks',{recursive:true});await writeFile('checks/catalog-audit.json',JSON.stringify(report,null,2)+'\n');
await mkdir('dist/data',{recursive:true});
if(ids.size!==expected||duplicates.length)throw Error('Incomplete catalogue; keeping previous index');
await writeFile('dist/data/liberty-index.json.tmp',JSON.stringify({updatedAt:report.checkedAt,items:releaseIndex}));
await rename('dist/data/liberty-index.json.tmp','dist/data/liberty-index.json');
console.log(JSON.stringify({...report,examples:undefined},null,2));
