import {readFile,writeFile} from 'node:fs/promises';
import {identityIndex,exactIdentity} from '../src/catalog-match.js';
import {cleanTitle,animeType} from '../src/animevost.js';
const liberty=JSON.parse(await readFile('dist/data/liberty-index.json','utf8'));
const data=JSON.parse(await readFile('dist/data/animevost-index.json','utf8'));
const index=identityIndex(liberty.items);let linked=0;
for(const a of data.items){delete a.libertyId;delete a.canonicalId;delete a.malId;const names=cleanTitle(a.title).split(/\s+\/\s+/);const match=exactIdentity({names,year:a.year,type:animeType(a.type)},index);if(match){a.libertyId=match.id;a.malId=match.malId;a.canonicalId=match.malId?'mal-'+match.malId:'lib-'+match.id;linked++;}}
await writeFile('dist/data/animevost-index.json',JSON.stringify(data));console.log({liberty:liberty.items.length,animeVost:data.items.length,linked,additional:data.items.length-linked,combined:liberty.items.length+data.items.length-linked});
