import test from 'node:test';
import assert from 'node:assert/strict';
import {seedPages,remember,isKnown} from '../scripts/seed-progress.mjs';
test('seeding traverses beyond ten pages and finishes at actual end',async()=>{
 const seen=[];for await(const b of seedPages({fetchPage:async p=>({data:[{id:p}],meta:{pagination:{total_pages:14}}})}))seen.push(b);
 assert.equal(seen.length,14);assert.equal(seen.at(-1).nextPage,1);
});
test('resume refreshes first page, retries failures, then continues; stopping midway preserves current page',async()=>{
 const seen=[];for await(const b of seedPages({startPage:12,retryPages:[4,4],fetchPage:async p=>({data:[{id:p}],meta:{last_page:13}})}))seen.push(b);
 assert.deepEqual(seen.map(b=>b.page),[1,4,12,13]);
 assert.equal(seen[0].nextPage,12);assert.equal(seen[2].resumePage,12);assert.equal(seen[3].nextPage,1);
});
test('provider ID blocks duplicates before metadata or video requests',()=>{
 const known=new Set();remember(known,{id:'lib-555',ids:{anilibria:555,mal:99}});
 assert.ok(isKnown(known,{ids:{anilibria:555}}));assert.ok(isKnown(known,{ids:{mal:99}}));
 assert.ok(!isKnown(known,{ids:{anilibria:556}}));
});
test('bad upstream response throws instead of pretending catalogue is exhausted',async()=>{
 await assert.rejects(async()=>{for await(const b of seedPages({fetchPage:async()=>({error:'bad'})})){}},/Invalid catalogue/);
});
import {normalizeSeedCatalog} from '../scripts/normalize-seed-catalog.mjs';
test('dedup merges missing episodes and removes falsely relabelled copies, preserving real tracks',()=>{
 const source={quality:720,url:'https://example.org/a.m3u8'};
 const a={id:'lib-1',ids:{anilibria:1},episodes:[{number:1,audio:[{id:'anilibria',sources:[source]},{id:'kodik-1',sources:[source]},{id:'kodik-2',sources:[{quality:720,url:'https://example.org/b.m3u8'}]}]}]};
 const b={id:'duplicate',ids:{anilibria:1},episodes:[{number:2,audio:[{id:'anilibria',sources:[source]}]}]};
 const c=normalizeSeedCatalog({items:[a,b]});
 assert.equal(c.duplicates,1);assert.equal(c.copiedTracks,1);assert.equal(c.publication.items.length,1);
 assert.deepEqual(c.publication.items[0].releasedEpisodes,[1,2]);assert.equal(c.publication.items[0].episodes[0].audio.length,2);
 assert.equal(a.episodes[0].audio.length,3);
});
