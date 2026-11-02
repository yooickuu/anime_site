import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {AniLibriaAPI,releaseIdentity,identityLookup,releaseEpisodes,assembleAniLibria,mergeAniLibria,refreshAniLibria} from '../scripts/lib/anilibria.mjs';
import {seedCatalog} from '../scripts/seed-anilibria.mjs';
import {createApprovedCatalogue} from '../src/approved-catalog.js';
const episode=n=>({ordinal:n,duration:1400,hls_720:`https://example.test/${n}/720.m3u8`,hls_480:`https://example.test/${n}/480.m3u8`,opening:{start:0,stop:90},ending:{start:null,stop:null},preview:{src:'/frame.jpg'}});
const release={id:10,mal:{id:20},shikimori:{id:20},name:{main:'Аниме: второй сезон',english:'Anime Season 2'},year:2026,type:{value:'TV'},description:'Synopsis',is_ongoing:false,episodes_total:2,poster:{src:'/poster.jpg'},episodes:[episode(1),episode(2)],updated_at:'2026-11-01T12:00:00Z'};
const dependencies={getMetadata:async()=>[null,null],imageProbe:async url=>({url,width:1280,height:1920}),streamProbe:async(s,duration)=>[{...s,duration,checkedAt:new Date().toISOString()}]};
const assemble=(r,options)=>assembleAniLibria(r,{...dependencies,...options,getMetadata:dependencies.getMetadata});
const item=()=>assemble(release);

test('AniLibria reads all release episodes and checks real renditions; no made-up timing or quality',async()=>{
 const incoming=await item();assert.deepEqual(incoming.releasedEpisodes,[1,2]);assert.deepEqual(incoming.episodes[0].audio[0].sources.map(s=>s.quality),[720,480]);assert.deepEqual(incoming.episodes[0].audio[0].opening,{start:0,end:90});assert.equal(incoming.episodes[0].audio[0].ending,null);assert.equal(incoming.artwork.poster.width,1280);
 const approved=createApprovedCatalogue({policyVersion:3,items:[incoming]});assert.equal(approved.items.length,1);assert.equal(approved.video(incoming.id,2,'anilibria').sources[0].url,episode(2).hls_720);assert.equal(approved.video(incoming.id,2).providerRef,undefined);
});
test('missing, duplicate and incomplete episodes are rejected as a whole',()=>{
 for(const episodes of [[],[episode(1),episode(1)],[episode(1),episode(3)],[episode(1),{ordinal:2}], [{...episode(1),ordinal:0}]])assert.throws(()=>releaseEpisodes({...release,episodes}));
 assert.throws(()=>releaseEpisodes({...release,episodes:[episode(1)]}),/incomplete_release/);
 assert.equal(releaseEpisodes({...release,is_ongoing:true,episodes:[episode(1)]}).length,1);
 assert.throws(()=>releaseEpisodes({...release,episodes:[episode(1),{...episode(2),hls_720:episode(1).hls_720}]}),/duplicate_episode_stream/);
});
test('one broken episode rejects the release; one broken quality is not advertised',async()=>{
 await assert.rejects(assembleAniLibria(release,{...dependencies,streamProbe:async(s,d)=>{if(s.url.includes('/2/'))throw Error('HTTP 403');return [{...s,duration:d}];}}),/no_working_stream_episode_2/);
 const r=await assembleAniLibria(release,{...dependencies,streamProbe:async(s,d)=>{if(s.quality===480)throw Error('HTTP 404');return [{...s,duration:d}];}});assert.ok(r.episodes.every(e=>e.audio[0].sources.length===1));
});
test('broken artwork and blocked releases cannot enter the catalogue',async()=>{
 await assert.rejects(assembleAniLibria(release,{...dependencies,imageProbe:async()=>{throw Error('404');}}),/broken_poster/);
 await assert.rejects(assemble({...release,is_blocked_by_geo:true}),/blocked/);
});
test('identity lookup uses IDs, preserves seasons in titles, rejects conflicts and ambiguous names',async()=>{
 const a=await item(),b={...a,id:'mal-21',ids:{mal:21},title:'Аниме: первый сезон',originalTitle:'Anime Season 1'};
 assert.equal(identityLookup([a,b]).find({...releaseIdentity(release),title:'Other spelling'}),a);
 assert.equal(identityLookup([a]).find({ids:{},title:'АНИМЕ — ВТОРОЙ СЕЗОН',year:2026,type:'tv'}),a);
 assert.equal(identityLookup([a]).find({ids:{},title:'Аниме первый сезон',year:2026,type:'TV'}),null);
 assert.throws(()=>identityLookup([a]).find({...releaseIdentity(release),ids:{mal:999,shikimori:20}}),/conflicting/);
 assert.throws(()=>identityLookup([a,{...a,id:'other',ids:{mal:999}}]).find({ids:{},title:a.title,year:a.year,type:a.type}),/ambiguous/);
});
test('merging preserves card ID, saved-list references, metadata, Kodik tracks, and franchise season',async()=>{
 const incoming=await item(),existing={...structuredClone(incoming),id:'shikimori-20',title:'Existing title',ids:{mal:20,shikimori:20,kodik:'serial-9'},kodikIds:['serial-9'],episodes:incoming.episodes.map(e=>({...e,season:2,audio:[{...e.audio[0],id:'kodik-1',dubId:'Studio',providerRef:{provider:'kodik',url:'https://kodikplayer.com/seria/1/abc/720p'}}]}))};
 const before=structuredClone(existing),merged=mergeAniLibria(existing,incoming);assert.deepEqual(existing,before);assert.equal(merged.id,existing.id);assert.equal(merged.title,existing.title);assert.deepEqual(merged.artwork,existing.artwork);assert.equal(merged.episodes.length,2);
 for(let i=0;i<2;i++){assert.equal(merged.episodes[i].season,2);assert.deepEqual(merged.episodes[i].audio[0],before.episodes[i].audio[0]);assert.equal(merged.episodes[i].audio[1].id,'anilibria');}
 const again=mergeAniLibria(merged,incoming);assert.equal(again.episodes[0].audio.length,2);assert.deepEqual(again.kodikIds,['serial-9']);
});
test('ambiguous season mapping is deferred instead of attaching audio to the wrong season',async()=>{
 const a=await item(),existing={...a,episodes:[{...a.episodes[0],season:1},{...a.episodes[0],number:2,season:2}]};assert.throws(()=>mergeAniLibria(existing,a),/ambiguous_episode_mapping/);
});
test('fresh AniLibria episode counts use actual files and cannot erase older episodes',async()=>{
 const a=await item(),short=await assemble({...release,is_ongoing:true,episodes:[episode(1)]});assert.equal(mergeAniLibria(a,short).episodes.length,2);
 const longer=await assemble({...release,episodes_total:3,episodes:[episode(1),episode(2),episode(3)]});const merged=mergeAniLibria(a,longer);assert.deepEqual(merged.releasedEpisodes,[1,2,3]);
});
test('AniLibria ongoing refresh also works when a title already has Kodik',async()=>{
 const a={...await item(),kodikIds:['serial-9'],ongoing:true};const update={...release,is_ongoing:true,updated_at:'new',episodes:[episode(1),episode(2),episode(3)]};const refreshed=await refreshAniLibria(a,{release:async()=>update},{assemble});assert.equal(refreshed.episodes.length,3);assert.deepEqual(refreshed.kodikIds,a.kodikIds);assert.equal(refreshed.ongoing,true);
 await assert.rejects(refreshAniLibria(a,{release:async()=>({...update,mal:{id:999}})},{assemble}),/identity_changed/);
});
test('API retries transient errors and validates detail identities',async()=>{
 let calls=0;const api=new AniLibriaAPI({wait:async()=>{},fetcher:async()=>{calls++;return calls<3?new Response('',{status:503}):Response.json({data:[],meta:{}});}});assert.deepEqual((await api.page(1)).data,[]);assert.equal(calls,3);
 const wrong=new AniLibriaAPI({fetcher:async()=>Response.json({...release,id:99})});await assert.rejects(wrong.release(10),/invalid_anilibria_release/);
});
async function files(fn){const dir=await mkdtemp(join(tmpdir(),'anilibria-test-'));try{const paths={catalogPath:join(dir,'catalog.json'),progressPath:join(dir,'progress.json'),reportPath:join(dir,'checks/report.json')};await writeFile(paths.catalogPath,JSON.stringify({policyVersion:3,items:[]}));await fn(paths);}finally{await rm(dir,{recursive:true,force:true});}}
test('batch resumes within a page and merges instead of making duplicate cards',async()=>files(async paths=>{
 const second={...release,id:11,mal:{id:21},shikimori:{id:21},name:{main:'Other',english:'Other'}};const api={page:async()=>({data:[release,second],meta:{pagination:{total_pages:1}}}),release:async id=>id===10?release:second};
 const first=await seedCatalog({...paths,targetCount:1,api,assemble,log:()=>{}});assert.equal(first.added,1);const next=await seedCatalog({...paths,targetCount:1,api,assemble,log:()=>{}});assert.equal(next.added,1);const c=JSON.parse(await readFile(paths.catalogPath));assert.equal(c.items.length,2);
 await writeFile(paths.progressPath,'{}');const merged=await seedCatalog({...paths,targetCount:2,api,assemble,log:()=>{}});assert.equal(merged.added,0);assert.equal(merged.merged,2);assert.equal(JSON.parse(await readFile(paths.catalogPath)).items.length,2);
}));
test('new-only scan skips existing identities and follows every catalogue page',async()=>files(async paths=>{
 await writeFile(paths.catalogPath,JSON.stringify({policyVersion:3,items:[await item()]}));const second={...release,id:11,mal:{id:21},shikimori:{id:21},name:{main:'Other',english:'Other'}};const pages=[],details=[];
 const api={page:async p=>{pages.push(p);return {data:p===1?[release]:[second],meta:{pagination:{total_pages:2}}};},release:async id=>{details.push(id);return second;}};
 const report=await seedCatalog({...paths,targetCount:2,newOnly:true,api,assemble,log:()=>{}});assert.deepEqual(pages,[1,2]);assert.deepEqual(details,[11]);assert.equal(report.added,1);assert.equal(report.exhausted,true);
}));
test('failed import leaves the saved catalogue byte-for-byte unchanged',async()=>files(async paths=>{
 const before=await readFile(paths.catalogPath,'utf8');const api={page:async()=>({data:[release],meta:{pagination:{total_pages:1}}}),release:async()=>release};const report=await seedCatalog({...paths,targetCount:1,api,assemble:async()=>{throw Error('no_working_stream');},log:()=>{}});assert.equal(report.failed.length,1);assert.equal(await readFile(paths.catalogPath,'utf8'),before);
}));
test('concurrent catalogue changes are never overwritten',async()=>files(async paths=>{
 const changed=JSON.stringify({policyVersion:3,items:[],updatedAt:'external-change'});const api={page:async()=>({data:[release],meta:{pagination:{total_pages:1}}}),release:async()=>release};
 await assert.rejects(seedCatalog({...paths,targetCount:1,api,assemble:async r=>{await writeFile(paths.catalogPath,changed);return assemble(r);},log:()=>{}}),/catalogue_changed/);assert.equal(await readFile(paths.catalogPath,'utf8'),changed);
}));

test('repeating an API page cannot create an endless catalogue scan',async()=>files(async paths=>{
 await writeFile(paths.catalogPath,JSON.stringify({policyVersion:3,items:[await item()]}));
 const api={page:async()=>({data:[release]}),release:async()=>release};
 await assert.rejects(seedCatalog({...paths,targetCount:2,newOnly:true,api,assemble,log:()=>{}}),/pagination_loop/);
}));
