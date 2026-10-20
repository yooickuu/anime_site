// Metadata-only staging from AniList. This never writes the published catalogue.
import {mkdir,writeFile} from 'node:fs/promises';
const target=Math.min(1000,Math.max(1,Number(process.env.CANDIDATE_LIMIT)||250));
const query=`query($page:Int!){Page(page:$page,perPage:50){pageInfo{hasNextPage}media(type:ANIME,sort:POPULARITY_DESC,isAdult:false){id idMal title{romaji english native} format status episodes seasonYear popularity coverImage{extraLarge} bannerImage}}}`;
const items=[],seen=new Set();
for(let page=1;items.length<target;page++){
 const r=await fetch('https://graphql.anilist.co',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({query,variables:{page}}),signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw Error('AniList HTTP '+r.status);
 const data=await r.json();if(data.errors||!data.data?.Page)throw Error('Invalid metadata response');
 for(const a of data.data.Page.media){
  if(!a.idMal||seen.has(a.idMal)||!['TV','MOVIE','ONA','OVA','SPECIAL'].includes(a.format))continue;
  seen.add(a.idMal);items.push({id:'mal-'+a.idMal,ids:{mal:a.idMal,anilist:a.id},title:a.title.english||a.title.romaji,originalTitle:a.title.native,year:a.seasonYear,type:a.format,ongoing:a.status==='RELEASING',announcedEpisodes:a.episodes,popularity:a.popularity,metadataSource:'AniList',image:a.coverImage.extraLarge,banner:a.bannerImage||null,episodes:[]});
  if(items.length===target)break;
 }
 if(!data.data.Page.pageInfo.hasNextPage)break;
 await new Promise(r=>setTimeout(r,1200));
}
await mkdir('checks/admission',{recursive:true});
await writeFile('checks/admission/new-candidates.json',JSON.stringify({collectedAt:new Date().toISOString(),kind:'metadata-only-not-approved',items},null,2));
console.log(JSON.stringify({collected:items.length,approved:0,source:'AniList metadata only'}));
