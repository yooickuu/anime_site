import test from 'node:test';import assert from 'node:assert/strict';
import {refreshOngoingKodik} from '../scripts/lib/ongoing-kodik.mjs';
import {linkedEpisodes} from '../scripts/lib/kodik-api.mjs';
import {repairDisplayMetadata} from '../scripts/lib/catalog-display.mjs';
const link=n=>`https://kodikplayer.com/seria/${n}/abc/720p`;
const release={id:'serial-9',type:'anime-serial',shikimori_id:'9',translation:{id:1,type:'voice',title:'Studio'},updated_at:'new',episodes_count:2,seasons:{1:{episodes:{1:link(1),2:link(2)}}},material_data:{anime_status:'ongoing'}};
const item={id:'mal-9',ids:{mal:9,shikimori:9},title:'Title',type:'TV',ongoing:true,artwork:{poster:{url:'https://example.com/p.webp',width:800,height:1200},backdrop:{url:'https://example.com/b.webp',width:1920,height:1080}},episodes:linkedEpisodes({...release,episodes_count:1,seasons:{1:{episodes:{1:link(1)}}}}),kodikIds:['serial-9'],kodikRevisions:{'serial-9':'old'}};
test('ongoings append actual linked episodes across pages, preserve art and IDs, and update card count',async()=>{
 const before=structuredClone(item);let pages=0;
 const api={async *pages(){pages++;yield {results:[{...release,shikimori_id:'99'}]};yield {results:[release]};}};
 const updated=await refreshOngoingKodik(item,api);assert.equal(updated.episodes.length,2);assert.equal(updated.id,item.id);assert.deepEqual(updated.artwork,item.artwork);assert.deepEqual(item,before);assert.equal(pages,1);
 repairDisplayMetadata({items:[updated]});assert.equal(updated.availableEpisodeCount,2);
 const unchanged=await refreshOngoingKodik(updated,api);assert.equal(unchanged,updated);
});
test('existing original track keeps its language when API omits language and country',async()=>{
 const jp={...release,translation:{id:2,type:'subtitles',title:'Subtitles',language:'ja'}};
 const original={...item,episodes:linkedEpisodes(jp),kodikRevisions:{}};
 const updated=await refreshOngoingKodik(original,{async *pages(){yield {results:[{...jp,translation:{...jp.translation,language:undefined}}]};}});
 assert.equal(updated.episodes[0].audio[0].language,'ja');assert.equal(updated.episodes[0].audio[0].original,true);
});
test('authorization failures and unmatched titles are not reported as successful updates',async()=>{
 await assert.rejects(refreshOngoingKodik(item,{async *pages(){throw Error('kodik_http_401');}}),/401/);
 await assert.rejects(refreshOngoingKodik(item,{async *pages(){yield {results:[{...release,shikimori_id:'99'}]};}}),/no_matching/);
 assert.equal(item.episodes.length,1);
});
import {updateOngoings} from '../scripts/update-ongoings.mjs';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
test('partial source failure preserves existing tracks and retries even after the other provider finishes',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'ongoing-safe-'));try{
 const paths={catalogPath:join(dir,'catalog.json'),reportPath:join(dir,'report.json'),retryPath:join(dir,'retries.json')};
 const original={...structuredClone(item),ids:{...item.ids,anilibria:10}};
 await writeFile(paths.catalogPath,JSON.stringify({policyVersion:3,items:[original]}));
 const report=await updateOngoings({...paths,api:{},anilibria:{},kodikRefresh:async a=>({...a,ongoing:false}),anilibriaRefresh:async()=>{throw Error('segment_http_503');}});
 assert.equal(report.failures.length,1);assert.deepEqual(JSON.parse(await readFile(paths.retryPath)).ids,[item.id]);
 const saved=JSON.parse(await readFile(paths.catalogPath));assert.deepEqual(saved.items[0].episodes,item.episodes);assert.equal(saved.items[0].ongoing,false);
 let retried=0;await updateOngoings({...paths,api:{},anilibria:{},kodikRefresh:async a=>a,anilibriaRefresh:async a=>{retried++;return a;}});
 assert.equal(retried,1);assert.deepEqual(JSON.parse(await readFile(paths.retryPath)).ids,[]);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('ongoing update refuses to overwrite a concurrent catalogue import',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'ongoing-cas-'));try{
 const paths={catalogPath:join(dir,'catalog.json'),reportPath:join(dir,'report.json'),retryPath:join(dir,'retries.json')};
 await writeFile(paths.catalogPath,JSON.stringify({policyVersion:3,items:[item]}));const external='{"policyVersion":3,"items":[],"updatedAt":"external"}';
 await assert.rejects(updateOngoings({...paths,api:{},anilibria:{},kodikRefresh:async a=>{await writeFile(paths.catalogPath,external);return {...a,ongoing:false};}}),/catalogue_changed/);
 assert.equal(await readFile(paths.catalogPath,'utf8'),external);
 }finally{await rm(dir,{recursive:true,force:true});}
});
