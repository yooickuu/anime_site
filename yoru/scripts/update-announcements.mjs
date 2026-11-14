import {readFile,mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {aniListPage,shikiPage,shikiDetails,aniListDetails} from '../src/announcements/api.js';
import {mergeAnnouncements,identityMatcher,reconcile} from '../src/announcements/model.js';
import {readCatalogueText} from './lib/catalog-storage.mjs';
import {loadToken,saveJSON,assembleRelease,allocateCatalogueId} from './seed-catalog.mjs';
import {KodikAPI,catalogParams,completeRelease,mergeKodikRelease} from './lib/kodik-api.mjs';
import {createApprovedCatalogue} from '../src/approved-catalog.js';
import {mapLimit} from './lib/concurrency.mjs';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
export async function collectAnnouncements({wait=pause,primary=shikiDetails,secondary=aniListPage}={}){
 const feeds=[],errors=[];
 for(const [name,load] of [['shikimori',page=>primary({page})],['anilist',page=>secondary(page)]]){
  const items=[];try{for(let page=1;page<=10;page++){const result=await load(page);items.push(...result.items);if(!result.next)break;await wait(800);}feeds.push(items);}catch(e){errors.push({source:name,reason:e.message});if(items.length)feeds.push(items);}
 }
 if(!feeds.length)throw Error('announcement_sources_unavailable');
 return {items:mergeAnnouncements(feeds[0]||[],feeds[1]||[]).sort((a,b)=>(b.popularity||0)-(a.popularity||0)).slice(0,500),errors};
}
export async function updateAnnouncements({catalogPath='src/published-catalog.json',feedPath='src/announcements.json',reportPath='checks/announcements.json',api,assemble=assembleRelease,collect=collectAnnouncements,wait=pause,refreshDetails=shikiDetails,refreshAniList=aniListDetails}={}){
 const original=await readCatalogueText(catalogPath),catalog=JSON.parse(original);let previous={items:[],aliases:{}};try{previous=JSON.parse(await readFile(feedPath,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 const fetched=await collect();let candidates=fetched.items;
 // Titles disappearing from the announcement feed are rechecked, never discarded
 // just because their premiere date passed or a provider had a transient failure.
 const freshMatch=identityMatcher(candidates),missing=(previous.items||[]).filter(a=>!freshMatch(a)),refresh=[];
 for(let i=0;i<missing.length;i+=50){const group=missing.slice(i,i+50),ids=group.map(a=>a.ids?.shikimori||a.ids?.mal).filter(Boolean);try{const d=ids.length?await refreshDetails({ids}):{items:[]};const alIds=group.filter(a=>!a.ids?.shikimori&&!a.ids?.mal).map(a=>a.ids?.anilist).filter(Boolean);if(alIds.length)d.items.push(...(await refreshAniList(alIds)).items);const find=identityMatcher(d.items);refresh.push(...group.map(a=>find(a)||a));}catch(e){refresh.push(...group);fetched.errors.push({source:'status',reason:e.message});}await wait(800);}
 candidates=mergeAnnouncements(candidates,refresh);
 api||=new KodikAPI(await loadToken());const aliases={...previous.aliases},byId=new Map(catalog.items.map(a=>[a.id,a]));let promoted=0,checked=0;
 const pending=reconcile(candidates,catalog.items),failures=[];
 await mapLimit(pending,2,async card=>{
  const id=card.ids?.shikimori||card.ids?.mal;if(!id&&!card.originalTitle)return;
  try{
   checked++;if(checked%50===0)console.log('Сверено анонсов с Kodik: '+checked+'/'+pending.length);let merged=null;const translations=new Set();
   for await(const page of api.pages('/search',{...catalogParams,...(id?{shikimori_id:id}:{title:card.originalTitle})})){
    for(const release of page.results){
     if((id&&Number(release.shikimori_id)!==Number(id))||translations.has(String(release.translation?.id))||translations.size>=3)continue;
     if(!Number(release.episodes_count)&&release.type!=='anime')continue;
     try{const full=await completeRelease(api,release),incoming=await assemble(full);
      if(id?Number(incoming.ids?.shikimori)!==Number(id):!identityMatcher([incoming])(card))throw Error('announcement_identity_mismatch');
      const next=mergeKodikRelease(merged,incoming);if(!createApprovedCatalogue({policyVersion:3,items:[next]}).items.length)throw Error('announcement_admission_failed');merged=next;translations.add(String(release.translation?.id));
     }catch(e){failures.push({id:card.id,reason:e.message});}
    }
   }
   if(merged){
    // A concurrent worker may have resolved an alternative announcement name.
    const existing=identityMatcher(catalog.items)(merged);if(existing){aliases[card.id]=existing.id;return;}
    merged.id=allocateCatalogueId(merged,byId);merged.ongoing=card.status!=='finished';merged.status=merged.ongoing?'ongoing':'released';
    if(!createApprovedCatalogue({policyVersion:3,items:[merged]}).items.length)throw Error('announcement_admission_failed');
    catalog.items.push(merged);byId.set(merged.id,merged);aliases[card.id]=merged.id;promoted++;console.log('Доступен: '+merged.title+' ('+merged.episodes.length+' сер.)');
   }
  }catch(e){failures.push({id:card.id,reason:e.message});}finally{await wait(650);}
 });
 const candidateMatch=identityMatcher(candidates);for(const old of previous.items||[]){const latest=candidateMatch(old);if(latest&&latest.id!==old.id)aliases[old.id]=latest.id;}
 const published=identityMatcher(catalog.items);for(const card of [...candidates,...(previous.items||[])]){const found=published(card);if(found)aliases[card.id]=found.id;}
 if(promoted){if(await readCatalogueText(catalogPath)!==original)throw Error('catalogue_changed_during_announcement_update');catalog.updatedAt=new Date().toISOString();await saveJSON(catalogPath,catalog);}
 // Keep released-but-unavailable titles in the retry set and metadata-only UI.
 const remaining=reconcile(candidates,catalog.items),waiting=remaining.filter(a=>a.status!=='announced');
 const items=[...waiting.slice(0,100),...remaining.filter(a=>a.status==='announced').slice(0,500)].slice(0,600);
 const feed={version:1,updatedAt:new Date().toISOString(),items,aliases};await saveJSON(feedPath,feed);
 const report={checked,promoted,announced:items.filter(a=>a.status==='announced').length,waiting:waiting.length,errors:[...fetched.errors,...failures]};
 if(reportPath){await mkdir('checks',{recursive:true});await saveJSON(reportPath,report);}
 console.log(JSON.stringify({checked,promoted,announced:report.announced,waiting:report.waiting,errors:report.errors.length}));return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)updateAnnouncements().catch(e=>{console.error(e.message);process.exitCode=1;});
