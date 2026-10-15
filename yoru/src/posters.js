// Covers are matched by explicit MyAnimeList mappings; never by a guessed title.
import {kitsuRequest} from './kitsu.js';
const KEY='yooickuu.posters.kitsu.v3',MAX_AGE=7*86400000;
let cache={};try{if(typeof window!=='undefined')cache=JSON.parse(localStorage.getItem(KEY)||'{}');}catch{}
export function cachedPoster(id){const p=cache[id];return p&&Date.now()-p.at<MAX_AGE?p:null;}
export function applyPoster(a,p){if(!p?.url)return;a.image=p.url;a.kitsuId=p.kitsuId;a.officialPoster=true;a.audienceRating=p.rating||null;a.audienceRatingSource='Kitsu';if(a.translations){a.translations.en[0]=p.english||a.translations.en[0];a.translations.ja[0]=p.native||a.translations.ja[0];}}
export async function enrichPosters(items){
  for(const a of items)applyPoster(a,cachedPoster(a.malId));
  const ids=[...new Set(items.map(a=>a.malId).filter(id=>Number.isInteger(id)&&id>0&&!cachedPoster(id)))];
  try{
    for(let i=0;i<ids.length;i+=20){
      const p=new URLSearchParams({'filter[externalSite]':'myanimelist/anime','filter[externalId]':ids.slice(i,i+20).join(','),include:'item','page[limit]':'20'});
      const data=await kitsuRequest('/mappings?'+p);
      for(const m of data.data||[]){
        const ref=m.relationships?.item?.data;
        const media=data.included?.find(a=>a.type==='anime'&&a.id===ref?.id);
        const a=media?.attributes,url=a?.posterImage?.original||a?.posterImage?.large;
        if(!url||!url.startsWith('https://'))continue;
        cache[Number(m.attributes.externalId)]={url,kitsuId:media.id,english:a.titles?.en||a.canonicalTitle,native:a.titles?.ja_jp,rating:Number(a.averageRating)>0?Number(a.averageRating)/10:null,at:Date.now()};
      }
    }
    cache=Object.fromEntries(Object.entries(cache).sort((a,b)=>b[1].at-a[1].at).slice(0,500));
    try{if(typeof window!=='undefined')localStorage.setItem(KEY,JSON.stringify(cache));}catch{}
  }catch{} // Provider cover remains available if metadata enrichment fails.
  for(const a of items)applyPoster(a,cachedPoster(a.malId));
  return items;
}
