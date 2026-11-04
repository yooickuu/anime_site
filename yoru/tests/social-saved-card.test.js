import {test} from 'node:test';import assert from 'node:assert/strict';
import {savedDisplay,resolveSavedCard} from '../src/social/saved-card.js';
test('old provider IDs resolve through exact MAL identity without changing the saved ID',async()=>{
 const row={anime_id:'vost-2937',card:{title:'Saved',malId:'123',image:'https://example.test/art'}};const before=structuredClone(row);
 const a=await resolveSavedCard(row,{card:async id=>{if(id==='mal-123')return {id,title:'Canonical'};throw Error('notAdmitted');}});
 assert.equal(a.id,'mal-123');assert.deepEqual(row,before);
});
test('ambiguous name matches retain saved artwork/title instead of linking a wrong season',async()=>{
 const row={anime_id:'lib-10026',card:{title:'Title',year:'2025',type:'TV',image:'https://example.test/art'}};
 const a=await resolveSavedCard(row,{card:async()=>null,searchAnime:async()=>[{id:'mal-1',title:'Title',year:2025,type:'TV'},{id:'mal-2',title:'Title',year:2025,type:'TV'}]});
 assert.equal(a.title,'Title');assert.equal(a.displayOnly,true);assert.equal(a.image,row.card.image);
 assert.equal(savedDisplay({card:{title:'Title',image:'javascript:alert(1)'}}).image,'');
});
