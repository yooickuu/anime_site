import {normalizeSearch,normalizeType,normalizeGenre} from '../catalog-query.js';
import {cleanSynopsis} from '../catalog-metadata.js';
export const POSTER='assets/announcement-poster.svg';
export const positive=n=>Number.isSafeInteger(Number(n))&&Number(n)>0?Number(n):null;
export function statusOf(value){return ['anons','NOT_YET_RELEASED','announced'].includes(value)?'announced':['ongoing','RELEASING','airing'].includes(value)?'airing':'finished';}
export function posterURL(value){try{if(!value||/missing_|\/missing[/.]/i.test(value))return POSTER;const u=new URL(value,'https://shikimori.io');return u.protocol==='https:'?u.href:POSTER;}catch{return POSTER;}}
export function fromShiki(a){
 const id=positive(a?.id);if(!id||!(a.russian||a.name))return null;
 const mal=positive(a.malId)||id,date=a.airedOn||{},iso=a.aired_on;
 return {id:'mal-'+mal,ids:{mal,shikimori:id},title:a.russian||a.name,originalTitle:a.name||'',alt:a.name||'',description:cleanSynopsis(a.description||'').slice(0,6000),descriptionLanguage:'ru',translations:{en:[a.name||'','']},year:date.year||Number(iso?.slice(0,4))||null,airedAt:iso||null,releaseDate:{year:date.year||Number(iso?.slice(0,4))||null,month:date.month||Number(iso?.slice(5,7))||null,day:date.day||Number(iso?.slice(8,10))||null},season:null,type:normalizeType(a.kind),genres:(a.genres||[]).map(g=>normalizeGenre(g.russian||g.name||g)),image:posterURL(a.poster?.originalUrl||a.image?.original),audienceRating:Number(a.score)||0,popularity:Number(a.popularity)||0,status:statusOf(a.status),catalogOnly:true,announcement:true,episodes:0,ongoing:statusOf(a.status)==='airing',posterFallback:POSTER};
}
export function fromAniList(a){
 const id=positive(a?.id);if(!id||!a.title?.romaji)return null;const mal=positive(a.idMal),date=a.startDate||{};
 return {id:mal?'mal-'+mal:'anilist-'+id,ids:{mal,anilist:id},title:a.title.romaji,originalTitle:a.title.romaji,alt:[a.title.english,a.title.native].filter(Boolean).join(' '),description:cleanSynopsis(a.description||'').slice(0,6000),descriptionLanguage:'en',translations:{en:[a.title.english||a.title.romaji,cleanSynopsis(a.description||'').slice(0,6000)],ja:[a.title.native||'','']},year:date.year||a.seasonYear||null,releaseDate:date,season:a.season||null,type:normalizeType(a.format),genres:(a.genres||[]).map(normalizeGenre),image:posterURL(a.coverImage?.extraLarge),banner:posterURL(a.bannerImage)===POSTER?null:a.bannerImage,audienceRating:Number(a.averageScore)/10||0,popularity:Number(a.popularity)||0,status:statusOf(a.status),catalogOnly:true,announcement:true,episodes:0,ongoing:statusOf(a.status)==='airing',posterFallback:POSTER};
}
export function identityKeys(a){return [...new Set([a.ids?.mal&&'mal:'+a.ids.mal,a.malId&&'mal:'+a.malId,a.ids?.shikimori&&'shiki:'+a.ids.shikimori,a.ids?.anilist&&'al:'+a.ids.anilist,a.id&&'id:'+a.id].filter(Boolean))];}
const names=a=>[a.title,a.originalTitle,...Object.values(a.translations||{}).map(x=>x?.[0])].filter(Boolean).map(normalizeSearch);
export function identityMatcher(items){
 const ids=new Map(),titles=new Map();for(const a of items){for(const key of identityKeys(a))ids.set(key,a);for(const n of names(a)){const key=n+'|'+a.year+'|'+normalizeType(a.type);const list=titles.get(key)||[];list.push(a);titles.set(key,list);}}
 return a=>{for(const k of identityKeys(a))if(ids.has(k))return ids.get(k);if(!a.year||!a.type)return null;
  const matches=new Map();for(const n of names(a))for(const b of titles.get(n+'|'+a.year+'|'+normalizeType(a.type))||[]){if(['mal','shikimori','anilist'].some(k=>a.ids?.[k]&&b.ids?.[k]&&Number(a.ids[k])!==Number(b.ids[k])))continue;matches.set(b.id,b);}return matches.size===1?[...matches.values()][0]:null;};
}
export function mergeAnnouncements(primary,secondary){
 const result=primary.filter(Boolean).map(a=>({...a}));for(const a of secondary.filter(Boolean)){const old=identityMatcher(result)(a);if(!old){result.push(a);continue;}const status=old.status==='announced'&&a.status==='announced'?'announced':old.status==='announced'?a.status:old.status;
 Object.assign(old,{ids:{...a.ids,...Object.fromEntries(Object.entries(old.ids||{}).filter(([,v])=>v))},alt:[old.alt,a.alt].filter(Boolean).join(' '),description:old.description||a.description,translations:{...a.translations,...Object.fromEntries(Object.entries(old.translations||{}).map(([k,v])=>[k,[v[0]||a.translations?.[k]?.[0]||'',v[1]||a.translations?.[k]?.[1]||'']]))},genres:old.genres.length?old.genres:a.genres,image:old.image===POSTER?a.image:old.image,banner:old.banner||a.banner,popularity:Math.max(old.popularity||0,a.popularity||0),season:old.season||a.season,status,ongoing:status==='airing'});}
 return result;
}
export function reconcile(items,published){const match=identityMatcher(published);return items.filter(a=>!match(a));}
