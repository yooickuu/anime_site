import {readCatalogueText} from './lib/catalog-storage.mjs';
import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {dirname} from 'node:path';
import {AniLibriaAPI,releaseIdentity,identityLookup,assembleAniLibria,mergeAniLibria} from './lib/anilibria.mjs';
import {auditPlayerCatalogue} from './lib/player-audit.mjs';
const USER_AGENT='yomiku/1.0 (+https://yomiku.site/)';
async function fetchJSON(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
      ...options.headers
    },
    signal: AbortSignal.timeout(15000)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return res.json();
}

export async function fetchShikimori(malOrShikiId) {
  try {
    const query = `query($id: String) {
      animes(ids: $id, limit: 1) {
        id malId name russian description score status episodes episodesAired kind
        genres { id name russian }
        poster { originalUrl }
      }
    }`;
    const data = await fetchJSON('https://shikimori.io/api/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { id: String(malOrShikiId) } })
    });
    return data.data?.animes?.[0] || null;
  } catch (e) {
    return null;
  }
}

export async function fetchAniListMetadata(malId) {
  try {
    const query = `query($idMal: Int) {
      Media(idMal: $idMal, type: ANIME) {
        id
        idMal
        countryOfOrigin
        popularity
        averageScore
        duration
        episodes
        relations { edges { relationType node { idMal type } } }
        bannerImage
        coverImage { extraLarge large }
        title { english romaji native }
        genres
        description(asHtml: false)
      }
    }`;
    const data = await fetchJSON('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { idMal: Number(malId) } })
    });
    return data.data?.Media || null;
  } catch (e) {
    return null;
  }
}


async function saveJSON(path,data){await writeFile(path+'.tmp',JSON.stringify(data));await rename(path+'.tmp',path);}
async function readJSON(path,fallback){try{return JSON.parse(await readFile(path,'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw e;}}
const metadata=async ids=>Promise.all([ids.shikimori?fetchShikimori(ids.shikimori):null,ids.mal?fetchAniListMetadata(ids.mal):null]);

// targetCount is the number of accepted releases (new cards + additional voices).
// --new-only scans for missing cards without rechecking already-linked titles.
export async function seedCatalog({targetCount=20,maxChecks=Math.max(100,targetCount*3),onlyOngoings=false,newOnly=false,api=new AniLibriaAPI(),assemble=assembleAniLibria,catalogPath='src/published-catalog.json',progressPath='src/anilibria-progress.json',reportPath='checks/anilibria-import.json',log=console.log}={}){
 if(!Number.isSafeInteger(targetCount)||targetCount<1||!Number.isSafeInteger(maxChecks)||maxChecks<1)throw Error('Count must be a positive integer');
 let lastSaved=await readCatalogueText(catalogPath);const catalog=JSON.parse(lastSaved);
 if(catalog.policyVersion!==3||!Array.isArray(catalog.items))throw Error('invalid_existing_catalogue');
 const before=auditPlayerCatalogue(catalog);if(before.errors.length)throw Error('existing_catalogue_validation_failed');
 const index=identityLookup(catalog.items),byId=new Map(catalog.items.map(a=>[a.id,a]));
 const mode=newOnly?'new':onlyOngoings?'ongoing':'all',progress=await readJSON(progressPath,{});
 const state=progress[mode]||{page:1,offset:0,processed:{},deferred:{}};state.processed||={};state.deferred||={};
 const report={source:'AniLibria',scanned:0,checked:0,added:0,merged:0,skipped:0,failed:[],pages:0,startedAt:new Date().toISOString()};let dirty=false;
 const checkpoint=async()=>{
  if(dirty){
   // Refuse to overwrite changes made by another importer while this batch ran.
   if(await readCatalogueText(catalogPath)!==lastSaved)throw Error('catalogue_changed_during_import_retry');
   const audit=auditPlayerCatalogue(catalog);if(audit.errors.length)throw Error('catalogue_validation_failed');
   catalog.updatedAt=new Date().toISOString();await saveJSON(catalogPath,catalog);lastSaved=JSON.stringify(catalog);dirty=false;
  }
  progress[mode]=state;await saveJSON(progressPath,progress);await mkdir(dirname(reportPath),{recursive:true});await saveJSON(reportPath,{...report,total:catalog.items.length,finishedAt:new Date().toISOString()});
 };
 log(`AniLibria: партия до ${targetCount} релизов; каталог ${catalog.items.length}. ${newOnly?'Только новые карточки.':'Новые карточки и дополнительные озвучки.'}`);
 try{
  let done=false;const visitedPages=new Set();while(!done){
   const page=Number(state.page)||1,response=await api.page(page);report.pages++;
   const list=response.data;if(!Array.isArray(list))throw Error('invalid_anilibria_page');
   const fingerprint=list.map(r=>r.id).join(',');if(list.length&&visitedPages.has(fingerprint))throw Error('anilibria_pagination_loop');visitedPages.add(fingerprint);
   const last=Number(response.meta?.pagination?.total_pages||response.meta?.last_page);
   for(let i=Number(state.offset)||0;i<list.length;i++){
    if(report.added+report.merged>=targetCount||report.checked>=maxChecks){done=true;break;}
    report.scanned++;const brief=list[i],id=String(brief.id),revision=brief.updated_at||brief.fresh_at||'',prior=state.processed[id];state.offset=i+1;
    if(onlyOngoings&&!brief.is_ongoing||prior?.revision===revision&&Date.now()-Date.parse(prior.checkedAt)<86400000||state.deferred[id]?.revision===revision&&Date.parse(state.deferred[id].retryAfter)>Date.now()){report.skipped++;continue;}
    let existing;try{existing=index.find(releaseIdentity(brief));}catch(error){report.failed.push({id,reason:error.message});continue;}
    if(newOnly&&existing){report.skipped++;continue;}
    report.checked++;log(`Проверка AniLibria #${id}: ${brief.name?.main||id} (${report.checked}/${maxChecks})`);
    try{
     const release=await api.release(brief.id);existing=index.find(releaseIdentity(release));
     if(newOnly&&existing){report.skipped++;continue;}
     const incoming=await assemble(release,{existing,getMetadata:metadata});existing=index.find(incoming);
     if(!existing&&byId.has(incoming.id))throw Error('catalogue_id_conflict');
     const merged=mergeAniLibria(existing,incoming);
     if(existing){catalog.items[catalog.items.indexOf(existing)]=merged;report.merged++;}else{catalog.items.push(merged);report.added++;}
     index.add(merged);byId.set(merged.id,merged);dirty=true;
     state.processed[id]={revision,checkedAt:new Date().toISOString()};delete state.deferred[id];
     log(`✓ ${merged.title}: ${merged.episodes.length} серий; новых ${report.added}, дополнено ${report.merged}`);
    }catch(error){report.failed.push({id,reason:error.message});state.deferred[id]={revision,retryAfter:new Date(Date.now()+3600000).toISOString()};log(`Отложен #${id}: ${error.message}`);}
   }
   if(!done){state.offset=0;if(!list.length||last&&page>=last){state.page=1;done=true;report.exhausted=true;}else state.page=page+1;}
   await checkpoint();
  }
 }catch(error){await checkpoint();throw error;}
 if(report.exhausted)log('Обход всех страниц завершён. Новые карточки появятся только при наличии новых подходящих релизов у источника.');
 log(`AniLibria: просмотрено ${report.scanned}, проверено потоков у ${report.checked}, новых ${report.added}, дополнено ${report.merged}, отложено ${report.failed.length}. Всего ${catalog.items.length}.`);
 return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 seedCatalog({targetCount:process.argv[2]===undefined?20:Number(process.argv[2]),newOnly:process.argv.includes('--new-only'),...(process.argv.find(a=>a.startsWith('--max-checks='))?{maxChecks:Number(process.argv.find(a=>a.startsWith('--max-checks=')).split('=')[1])}:{})}).catch(error=>{console.error(error.message);process.exitCode=1;});
}
