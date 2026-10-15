import {registerAnime,byId} from './catalog.js';
export const KITSU='https://kitsu.io/api/edge';
export const KITSU_PAGE_SIZE=20;
const genres={'Action':'Экшен','Adventure':'Приключения','Fantasy':'Фэнтези','Romance':'Романтика','Comedy':'Комедия','Slice of Life':'Повседневность','Sports':'Спорт','Drama':'Драма','Mystery':'Мистика','Sci-Fi':'Фантастика'};
export async function kitsuRequest(path){
  const r=await fetch(KITSU+path,{headers:{Accept:'application/vnd.api+json'},signal:AbortSignal.timeout(12000)});
  if(!r.ok)throw Error(r.status===429?'rateLimit':'providerError');
  return r.json();
}
export function normalizeKitsu(item,included=[]){
  const a=item.attributes||{};
  const refs=type=>(item.relationships?.[type]?.data||[]).map(ref=>included.find(v=>v.type===ref.type&&v.id===ref.id)).filter(Boolean);
  const malId=Number(refs('mappings').find(m=>m.attributes?.externalSite==='myanimelist/anime')?.attributes.externalId)||null;
  const id=malId?'mal-'+malId:'kitsu-'+item.id;
  const name=a.titles?.en_jp||a.canonicalTitle||a.titles?.en||'';
  const ownImage=a.posterImage?.original||a.posterImage?.large||'';
  const old=byId(id);
  const model={id,kitsuId:item.id,malId,title:name,alt:[...Object.values(a.titles||{}),...(a.abbreviatedTitles||[])].join(' '),
    type:a.subtype?.toUpperCase()||'TV',year:Number(a.startDate?.slice(0,4))||'',episodes:a.episodeCount||0,ongoing:a.status==='current',announced:a.status==='upcoming'||a.status==='tba',
    genres:refs('genres').map(g=>genres[g.attributes?.name]||g.attributes?.name).filter(Boolean),
    description:a.synopsis||'',descriptionLanguage:'en',image:ownImage,posterFallback:a.posterImage?.large||ownImage,
    translations:{en:[a.titles?.en||a.canonicalTitle||name,a.synopsis||''],ja:[a.titles?.ja_jp||name,a.synopsis||'']},
    audienceRating:Number(a.averageRating)>0?Number(a.averageRating)/10:null, audienceRatingSource:'Kitsu',
    provider:'Kitsu',officialPoster:!!ownImage,catalogOnly:true};
  return registerAnime(old?.providerId?{...model,...old,kitsuId:item.id,image:ownImage||old.image,translations:model.translations,audienceRating:model.audienceRating,audienceRatingSource:"Kitsu"}:model);
}
export async function fetchKitsuCatalogue({query='',page=1,genre='all',sort='picked',type='all',ongoing=false}={}){
  const sorts={popular:'-userCount',topRated:'-averageRating',picked:'-userCount',hiddenGems:'userCount',newest:'-startDate',oldest:'startDate',latest:'-updatedAt',alphabetical:'canonicalTitle'};
  const p=new URLSearchParams({'page[limit]':String(KITSU_PAGE_SIZE),'page[offset]':String((page-1)*KITSU_PAGE_SIZE),include:'mappings,genres',sort:sorts[sort]||sorts.picked});
  if(query.trim())p.set('filter[text]',query.trim());
  if(ongoing)p.set('filter[status]','current');
  const kinds={series:'TV,ONA',MOVIE:'movie','OVA,OAD':'OVA','ONA,WEB':'ONA',SPECIAL:'special'};
  if(type!=='all')p.set('filter[subtype]',kinds[type]||type);
  if(genre!=='all'){
    const english=Object.entries(genres).find(([,ru])=>ru===genre)?.[0];
    if(english)p.set('filter[categories]',english.toLowerCase().replaceAll(' ','-'));
  }
  const data=await kitsuRequest('/anime?'+p);
  return {items:(data.data||[]).map(a=>normalizeKitsu(a,data.included)),total:data.meta?.count||0,pages:Math.max(1,Math.ceil((data.meta?.count||0)/KITSU_PAGE_SIZE))};
}
export async function fetchKitsuRelease(a){
  const data=await kitsuRequest('/anime/'+encodeURIComponent(a.kitsuId)+'?include=mappings,genres');
  return normalizeKitsu(data.data,data.included);
}
