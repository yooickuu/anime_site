import {mapLimit} from './lib/concurrency.mjs';
import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {KodikAPI,catalogParams,allEpisodes,translationIdentity,mergeKodikRelease} from './lib/kodik-api.mjs';
import {probeImage,probeStream} from './lib/media-probe.mjs';
import {kodikVideo} from '../server/animego.js';
import {fetchShikimori,fetchAniListMetadata} from './seed-anilibria.mjs';
import {createApprovedCatalogue} from '../src/approved-catalog.js';
import {normalizeType,normalizeGenre} from '../src/catalog-query.js';
const catalogPath='src/published-catalog.json',cursorPath='src/kodik-progress.json';
export async function saveJSON(path,data){await writeFile(path+'.tmp',JSON.stringify(data,null,2));await rename(path+'.tmp',path);}
export async function loadJSON(path,fallback){try{return JSON.parse(await readFile(path,'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw e;}}
export async function loadToken(){
 const configured=process.env.KODIK_API_TOKEN||process.env.KODIK_TOKEN;
 if(configured)return configured;
 try{
  const raw=await readFile('.env','utf8');
  return raw.match(/^KODIK_API_TOKEN\s*=\s*["']?([^\s"'\r\n]+)["']?\s*$/m)?.[1]||raw.match(/^KODIK_TOKEN\s*=\s*["']?([^\s"'\r\n]+)["']?\s*$/m)?.[1];
 }catch(e){if(e.code!=='ENOENT')throw e;}
}

const metaCache=new Map();
async function metadata(id){if(!metaCache.has(id))metaCache.set(id,Promise.all([fetchShikimori(id),fetchAniListMetadata(id)]));const result=await metaCache.get(id);if(!result.some(Boolean))metaCache.delete(id);return result;}
async function retry(work){let error;for(let n=0;n<2;n++){try{return await work();}catch(e){error=e;if(n===0)await new Promise(r=>setTimeout(r,500));}}throw error;}
export async function assembleRelease(release,{getMetadata=metadata,imageProbe=probeImage,resolve=kodikVideo,streamProbe=probeStream}={}){
 const shiki=Number(release.shikimori_id);if(!Number.isSafeInteger(shiki)||shiki<=0)throw Error('shikimori_identity_missing');
 const translation=translationIdentity(release),rows=allEpisodes(release),m=release.material_data||{};
 const [sh,al]=await getMetadata(shiki);const type=normalizeType(m.anime_kind||sh?.kind||(release.type==='anime'?'MOVIE':'TV'));
 const clean=v=>String(v||'').replace(/<[^>]*>|\[\/?[^\]]+\]/g,' ').replace(/\s+/g,' ').trim();
 let poster;for(const url of [sh?.poster?.originalUrl,al?.coverImage?.extraLarge,m.poster_url,m.anime_poster_url].filter(Boolean)){try{poster=await retry(()=>imageProbe(url));if(poster.height<300)throw Error('poster_small');break;}catch{poster=null;}}
 if(!poster)throw Error('broken_poster');
 let backdrop;for(const url of [al?.bannerImage,...(m.screenshots||[]),...(release.screenshots||[])].filter(Boolean)){try{backdrop=await retry(()=>imageProbe(url));if(backdrop.width<400)throw Error('backdrop_small');break;}catch{backdrop=null;}}
 // A valid poster of this anime is preferable to another title's shared backdrop.
 backdrop||=poster;if(backdrop.width<400)throw Error('backdrop_small');
 const episodes=await mapLimit(rows,4,async(row,index)=>{
  const media=await retry(()=>resolve(row.url,row.ordinal));const sources=[];let duration=0;
  for(const source of media.sources||[]){if(![360,480,720,1080].includes(source.quality))continue;try{for(const s of await retry(()=>streamProbe(source))){duration=Math.max(duration,s.duration);if(!sources.some(v=>v.quality===s.quality))sources.push({quality:s.quality,url:s.url,stream:true,checkedAt:s.checkedAt});}}catch{}}
  if(!sources.length||!duration)throw Error(`no_working_stream_s${row.season}_e${row.ordinal}`);
  if(type==='SPECIAL'&&duration<180&&!clean(sh?.description))throw Error('short_special_without_shikimori_description');
  return {number:rows.some(r=>r.season!==rows[0].season)?index+1:row.ordinal,ordinal:row.ordinal,season:row.season,audio:[{...translation,duration,sources,subtitles:[],opening:null,ending:null,providerRef:{provider:'kodik',releaseId:String(release.id),translationId:String(release.translation.id),url:row.url,season:row.season,ordinal:row.ordinal}}]};
 });
 const mal=Number(sh?.malId||al?.idMal)||null;
 return {id:mal?`mal-${mal}`:`shikimori-${shiki}`,ids:{shikimori:shiki,mal,anilist:al?.id||null,kodik:String(release.id)},kodikIds:[String(release.id)],kodikRevisions:{[release.id]:release.updated_at||String(release.episodes_count)},title:sh?.russian||release.title,originalTitle:release.title_orig||al?.title?.romaji||'',alt:[release.other_title,al?.title?.english,al?.title?.native].filter(Boolean).join(' '),description:clean(sh?.description||m.description||al?.description),year:release.year,type,genres:(sh?.genres?.map(g=>g.russian||g.name)||m.anime_genres||al?.genres||[]).map(normalizeGenre),rating:Number(sh?.score||m.shikimori_rating||Number(al?.averageScore)/10)||null,popularity:al?.popularity||0,ongoing:(m.anime_status||sh?.status)==='ongoing',relatedMalIds:(al?.relations?.edges||[]).filter(e=>['PREQUEL','SEQUEL'].includes(e.relationType)&&e.node.type==='ANIME').map(e=>e.node.idMal).filter(Boolean),artwork:{poster,backdrop},releasedEpisodes:episodes.map(e=>e.number),episodes};
}
export async function seedCatalog({targetCount=30,maxChecks=Math.max(100,targetCount*10),retryLimit=3,token,api,assemble=assembleRelease}={}){
 if(!Number.isSafeInteger(targetCount)||targetCount<1)throw Error('Количество должно быть положительным целым числом');
 api||=new KodikAPI(token||await loadToken());
 const catalog=await loadJSON(catalogPath,{policyVersion:3,items:[]});
 const progress=await loadJSON(cursorPath,{next:'/list',processed:{},pending:[]});
 const stop=()=>report.added>=targetCount||report.checked>=maxChecks;
 const report={startedAt:new Date().toISOString(),checked:0,added:0,merged:0,skipped:0,pending:[]};
 const byIdentity=new Map(catalog.items.flatMap(a=>[a.ids?.shikimori&&[`shikimori:${a.ids.shikimori}`,a],a.ids?.mal&&[`mal:${a.ids.mal}`,a]].filter(Boolean)));
 const persist=async next=>{catalog.updatedAt=new Date().toISOString();await saveJSON(catalogPath,catalog);await saveJSON(cursorPath,{...progress,next});await mkdir('checks',{recursive:true});await saveJSON('checks/kodik-last-report.json',report);};
 async function ingest(release,expand=true){
  report.checked++;const key=String(release.id),revision=release.updated_at||release.episodes_count||'unknown';
  if(progress.processed[key]===revision){report.skipped++;return;}
  try{
   console.log(`Проверка ${release.title}: ${release.episodes_count||1} серий (${report.checked}/${maxChecks})`);
   const incoming=await assemble(release),existing=byIdentity.get(`shikimori:${incoming.ids.shikimori}`)||byIdentity.get(`mal:${incoming.ids.mal}`);
   const merged=mergeKodikRelease(existing,incoming);
   if(!createApprovedCatalogue({policyVersion:3,items:[merged]}).items.length)throw Error('catalogue_validation_failed');
   if(existing){catalog.items[catalog.items.indexOf(existing)]=merged;report.merged++;}else{catalog.items.push(merged);report.added++;}
   for(const [kind,id]of Object.entries(merged.ids))if(id)byIdentity.set(`${kind}:${id}`,merged);
   progress.processed[key]=revision;progress.pending=progress.pending.filter(id=>id!==key);
   console.log(`✓ ${merged.title}: ${merged.episodes.length} серий; новых ${report.added}/${targetCount}, дополнено ${report.merged}`);
   if(expand){
    try{
     const variants=[];
     for await(const batch of api.pages('/search',{...catalogParams,shikimori_id:incoming.ids.shikimori}))variants.push(...batch.results);
     const translations=new Set(merged.episodes.flatMap(e=>e.audio.filter(t=>t.providerRef?.provider==='kodik').map(t=>String(t.providerRef.translationId))));
     // Collect up to three distinct Kodik translations; prioritize original Japanese.
     variants.sort((a,b)=>Number(b.translation?.type==='subtitles')-Number(a.translation?.type==='subtitles'));
     for(const variant of variants){
      if(String(variant.shikimori_id)!==String(incoming.ids.shikimori))continue;
      if(translations.size>=3||report.checked>=maxChecks)break;
      const translation=String(variant.translation?.id||'');if(!translation||translations.has(translation))continue;
      await ingest(variant,false);
      const latest=byIdentity.get(`shikimori:${incoming.ids.shikimori}`);
      if(latest?.episodes.some(e=>e.audio.some(t=>t.providerRef?.translationId===translation)))translations.add(translation);
     }
    }catch(error){console.warn(`Дополнительные озвучки ${incoming.id} проверим позже: ${error.message}`);}
   }

  }catch(error){if(!progress.pending.includes(key))progress.pending.push(key);report.pending.push({id:key,reason:error.message});console.warn(`Пропущен ${key}: ${error.message}`);}
 }
 // Retry a bounded part of the queue; failures must not starve unseen pages.
 const retryIds=progress.pending.splice(0,retryLimit);progress.pending.push(...retryIds);
 for(const id of retryIds){
  for await(const batch of api.pages('/search',{...catalogParams,id}))for(const r of batch.results)await ingest(r);
  await persist(progress.next);if(stop())return report;
 }
 // New identities first within a page; translations are still merged by exact IDs.
 for await(const batch of api.pages(progress.next||'/list',catalogParams)){
  const releases=[...batch.results].sort((a,b)=>Number(byIdentity.has(`shikimori:${a.shikimori_id}`))-Number(byIdentity.has(`shikimori:${b.shikimori_id}`)));
  for(let i=0;i<releases.length;i+=2){
   await mapLimit(releases.slice(i,i+Math.min(2,targetCount-report.added,maxChecks-report.checked)),2,release=>ingest(release));
   await persist(batch.page);if(stop())return report;
  }
  await persist(batch.next_page||'/list');
 }
 console.log(`Готово: новых ${report.added}, дополнено ${report.merged}, на проверку позже ${report.pending.length}`);return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)seedCatalog({targetCount:Number(process.argv[2]||30)}).catch(e=>{console.error(e.message);process.exitCode=1;});
