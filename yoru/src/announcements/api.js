import {fromShiki,fromAniList} from './model.js';
const fields='id idMal title{romaji english native} description(asHtml:false) format status season seasonYear startDate{year month day} coverImage{extraLarge} bannerImage genres popularity averageScore';
export async function json(url,options={},fetcher=fetch){const r=await fetcher(url,{...options,signal:AbortSignal.timeout(8000)});if(!r.ok)throw Error('announcement_http_'+r.status);const d=await r.json();if(d.errors)throw Error('announcement_api_error');return d;}
export async function aniListPage(page=1,search='',fetcher=fetch){
 const data=await json('https://graphql.anilist.co',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:`query($page:Int,$search:String){Page(page:$page,perPage:50){pageInfo{hasNextPage} media(type:ANIME,status:NOT_YET_RELEASED,sort:POPULARITY_DESC,isAdult:false,search:$search){${fields}}}}`,variables:{page,search:search||null}})},fetcher);
 if(!Array.isArray(data.data?.Page?.media))throw Error('invalid_announcements');return {items:data.data.Page.media.map(fromAniList).filter(Boolean),next:data.data.Page.pageInfo?.hasNextPage===true};
}
export async function shikiPage(page=1,search='',fetcher=fetch){
 const url=new URL('https://shikimori.io/api/animes');url.search=new URLSearchParams({status:'anons',limit:'50',order:'popularity',censored:'true',page:String(page),...(search?{search}:{})});
 const d=await json(url,{},fetcher);if(!Array.isArray(d))throw Error('invalid_announcements');return {items:d.map(fromShiki).filter(Boolean),next:d.length===50};
}
export async function shikiDetails({page=1,ids}={},fetcher=fetch){
 const args=ids?`ids:${JSON.stringify(ids.join(','))},limit:50`:`status:"anons",limit:50,page:${Number(page)},order:popularity,censored:true`;
 const d=await json('https://shikimori.io/api/graphql',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:`{animes(${args}){id malId name russian kind status description score airedOn{year month day} poster{originalUrl} genres{name russian}}}`})},fetcher);
 if(!Array.isArray(d.data?.animes))throw Error('invalid_announcements');return {items:d.data.animes.map(fromShiki).filter(Boolean),next:d.data.animes.length===50};
}
export async function aniListDetails(ids,fetcher=fetch){
 const d=await json('https://graphql.anilist.co',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:`query($ids:[Int]){Page(perPage:50){media(id_in:$ids,type:ANIME){${fields}}}}`,variables:{ids}})},fetcher);
 if(!Array.isArray(d.data?.Page?.media))throw Error('invalid_announcements');return {items:d.data.Page.media.map(fromAniList).filter(Boolean)};
}
