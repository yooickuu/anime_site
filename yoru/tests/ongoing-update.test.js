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
