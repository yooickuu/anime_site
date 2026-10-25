import {readCatalogueText} from './lib/catalog-storage.mjs';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {KodikAPI,catalogParams,allEpisodes,translationIdentity,linkedEpisodes,mergeKodikRelease,completeRelease} from './lib/kodik-api.mjs';
import {loadToken,saveJSON} from './seed-catalog.mjs';
import {auditPlayerCatalogue} from './lib/player-audit.mjs';
const path='src/published-catalog.json';
const original=await readCatalogueText(path),catalog=JSON.parse(original),api=new KodikAPI(await loadToken());
const byId=new Map(catalog.items.filter(a=>a.ids?.shikimori).map(a=>[String(a.ids.shikimori),a]));
const candidates=new Map(),report={pages:0,records:0,matched:0,updated:0,addedEpisodes:0,errors:[]};
await mkdir('checks',{recursive:true});
await writeFile('checks/catalog-before-link-refresh.json',original);
// One complete paginated catalogue walk, not thousands of per-video probes.
for await(const page of api.pages('/list',catalogParams)){
 report.pages++;
 for(let r of page.results){
  report.records++;
  const id=String(r.shikimori_id);if(!byId.has(id))continue;
  try{
   r=await completeRelease(api,r);const rows=allEpisodes(r),track=translationIdentity(r);
   const choices=candidates.get(id)||new Map();const old=choices.get(track.id);
   if(!old||rows.length>old.count)choices.set(track.id,{release:r,count:rows.length,language:track.language});
   candidates.set(id,choices);
  }catch(e){report.errors.push({id:r.id,reason:e.message});}
 }
 if(report.pages%10===0)console.log(`Kodik: ${report.pages} страниц, ${report.records} записей, ${candidates.size} тайтлов сопоставлено`);
}
for(const [id,variants]of candidates){
 const item=byId.get(id),rows=[...variants.values()].sort((a,b)=>b.count-a.count);
 // Most complete translation first; complement with original and a second dub.
 const chosen=[rows[0]];
 for(const lang of ['ja','ru']){const candidate=rows.find(r=>r.language===lang&&!chosen.includes(r));if(candidate)chosen.push(candidate);}
 for(const r of rows)if(chosen.length<3&&!chosen.includes(r))chosen.push(r);
 let merged=item;
 for(const {release:r}of chosen){
  const episodes=linkedEpisodes(r);
  const incoming={...item,ids:{...item.ids,kodik:String(r.id)},episodes,releasedEpisodes:episodes.map(e=>e.number),kodikIds:[r.id],kodikRevisions:{[r.id]:r.updated_at||String(r.episodes_count)}};
  merged=mergeKodikRelease(merged,incoming);
 }
 report.updated++;report.addedEpisodes+=Math.max(0,merged.episodes.length-item.episodes.length);
 catalog.items[catalog.items.indexOf(item)]=merged;
}
report.matched=candidates.size;report.audit=auditPlayerCatalogue(catalog);
if(report.audit.errors.length)throw Error('Refusing invalid catalogue: '+JSON.stringify(report.audit.errors.slice(0,3)));
// Never overwrite changes from another running importer.
if(await readCatalogueText(path)!==original)throw Error('Catalogue changed during refresh; restart after stopping the other importer.');
catalog.updatedAt=new Date().toISOString();await saveJSON(path,catalog);await saveJSON('checks/kodik-refresh-report.json',report);
console.log(JSON.stringify({...report,errors:report.errors.length}));
