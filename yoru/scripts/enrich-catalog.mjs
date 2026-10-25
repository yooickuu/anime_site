import {readCatalogueText} from './lib/catalog-storage.mjs';
// Batch metadata only: never changes episodes, audio or publication admission.
import {readFile,writeFile,rename} from 'node:fs/promises';
import {metadataFromAniList} from '../src/catalog-metadata.js';
const publication=JSON.parse(await readCatalogueText());
let metadata={};try{metadata=JSON.parse(await readFile('src/catalog-metadata.json','utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
const ids=[...new Set(publication.items.map(a=>a.ids?.mal).filter(Boolean))].filter(id=>!metadata[id]);
const query=`query($ids:[Int]){Page(perPage:50){media(idMal_in:$ids,type:ANIME){idMal title{english romaji native} description(asHtml:false) startDate{year month day} relations{edges{relationType node{idMal type}}}}}}`;
for(let i=0;i<ids.length;i+=50){
 let response;for(let attempt=0;attempt<3;attempt++){try{response=await fetch('https://graphql.anilist.co',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query,variables:{ids:ids.slice(i,i+50)}}),signal:AbortSignal.timeout(25000)});break;}catch(error){if(attempt===2)throw error;}}
 if(!response.ok){console.log(`Metadata paused: HTTP ${response.status}; completed batches are saved.`);break;}
 const data=await response.json();if(!Array.isArray(data.data?.Page?.media))throw Error('invalid_metadata_response');
 for(const a of data.data.Page.media)metadata[a.idMal]=metadataFromAniList(a);
 await writeFile('src/catalog-metadata.json.tmp',JSON.stringify(metadata));await rename('src/catalog-metadata.json.tmp','src/catalog-metadata.json');
 console.log(`Metadata: ${Object.keys(metadata).length}/${publication.items.length}`);
 if(i+50<ids.length)await new Promise(r=>setTimeout(r,1200));
}
