export const normalizeSearch=value=>String(value??'').normalize('NFKC').toLocaleLowerCase().replace(/ё/g,'е').replace(/[ьъ]/g,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');
const genreGroups={
 'Экшен':['action','боевик','экшен'], 'Приключения':['adventure','приключения'], 'Фэнтези':['fantasy','фэнтези'],
 'Романтика':['romance','романтика'], 'Комедия':['comedy','комедия'], 'Повседневность':['slice of life','повседневность'],
 'Спорт':['sport','sports','спорт'], 'Фантастика':['sci fi','science fiction','фантастика'], 'Драма':['drama','драма'],
 'Триллер':['thriller','триллер'], 'Сверхъестественное':['supernatural','сверхъестественное'], 'Детектив':['mystery','детектив'],
 'Ужасы':['horror','ужасы'], 'Музыка':['music','музыка'], 'Школа':['school','школа'], 'Сёнен':['shounen','shonen','сёнен','сенен']
};
const genreMap=new Map(Object.entries(genreGroups).flatMap(([name,variants])=>[name,...variants].map(v=>[normalizeSearch(v),name])));
export const normalizeGenre=value=>genreMap.get(normalizeSearch(value))||normalizeSearch(value);
export function normalizeType(value){
 const v=normalizeSearch(typeof value==='object'?value?.value||value?.name:value).replaceAll(' ','');
 if(/^(tv\d*|тв|твсериал|series|animeserial|сериал)$/.test(v))return 'TV';
 return ({movie:'MOVIE',film:'MOVIE',филм:'MOVIE',полнометражныйфилм:'MOVIE',anime:'MOVIE',ova:'OVA',oad:'OVA',ona:'ONA',web:'ONA',webseries:'ONA',special:'SPECIAL',tv_special:'SPECIAL',tvspecial:'SPECIAL',спецвыпуск:'SPECIAL',music:'MUSIC'})[v]||v.toUpperCase();
}
export function matchesType(item,filter='all'){
 if(!filter||filter==='all')return true;
 const type=normalizeType(item.type);
 return filter==='series'?['TV','ONA'].includes(type):filter.split(',').some(t=>normalizeType(t)===type);
}
function near(a,b,limit){
 if(Math.abs(a.length-b.length)>limit)return false;
 let prev=Array.from({length:b.length+1},(_,i)=>i),before;
 for(let i=1;i<=a.length;i++){
  const row=[i];for(let j=1;j<=b.length;j++){
   row[j]=Math.min(row[j-1]+1,prev[j]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));
   if(before&&i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1])row[j]=Math.min(row[j],before[j-2]+1);
  }
  if(Math.min(...row)>limit)return false;before=prev;prev=row;
 }
 return prev[b.length]<=limit;
}
const namesCache=new WeakMap();
function names(item){
 if(!namesCache.has(item))namesCache.set(item,normalizeSearch([item.title,item.originalTitle,item.alt,...Object.values(item.translations||{}).map(v=>v?.[0])].filter(Boolean).join(' ')));
 return namesCache.get(item);
}
export function searchScore(item,query){
 const q=normalizeSearch(query);if(!q)return 1;
 const text=names(item),compact=text.replaceAll(' ',''),needle=q.replaceAll(' ','');
 if(normalizeSearch(item.title).startsWith(q))return 100;
 if(text.includes(q))return 80;
 if(compact.includes(needle))return 65;
 const words=text.split(' '),tokens=q.split(' ');
 if(tokens.every(t=>words.some(w=>w.startsWith(t)||(t.length>=4&&near(t,w,t.length>=8?2:1)))))return 40;
 return 0;
}
export function discoveryOptions(view){
 return view==='topRated'?{minRating:8,sort:'topRated'}:view==='airingNow'?{ongoing:true,sort:'picked'}:view==='films'?{type:'MOVIE',sort:'picked'}:{sort:'picked'};
}
const rating=a=>Number(a.audienceRating||a.rating||a.score)||0;
const popularity=a=>Number(a.popularity||a.views||a.members)||0;
const updated=a=>{const value=a.catalogUpdatedAt||a.updatedAt||a.updated_at||a.lastEpisodeAt;return typeof value==='number'?value:Date.parse(value)||0;};
export function queryCatalogue(items,options={}){
 const rows=items.map((item,index)=>({item,index,score:searchScore(item,options.query)})).filter(({item,score})=>score>0&&(!options.year||options.year==='all'||Number(item.year)===Number(options.year))&&(!options.minRating||rating(item)>=Number(options.minRating))&&matchesType(item,options.type)&&(!options.ongoing||item.ongoing)&&(!options.genre||options.genre==='all'||item.genres?.some(g=>normalizeGenre(g)===normalizeGenre(options.genre))));
 const compare=(a,b)=>{
  const x=a.item,y=b.item;
  if(options.sort==='newest')return (y.year||0)-(x.year||0);
  if(options.sort==='oldest')return (x.year||0)-(y.year||0);
  if(options.sort==='alphabetical')return x.title.localeCompare(y.title);
  if(options.sort==='latest')return updated(y)-updated(x);
  if(options.sort==='topRated')return rating(y)-rating(x)||popularity(y)-popularity(x);
  if(options.sort==='hiddenGems')return Number(popularity(y)>0)-Number(popularity(x)>0)||popularity(x)-popularity(y);
  return popularity(y)-popularity(x);
 };
 rows.sort((a,b)=>(options.query?b.score-a.score:0)||compare(a,b)||b.index-a.index);
 return rows.map(r=>r.item);
}
export function suggestions(items,query,limit=7){return normalizeSearch(query)?queryCatalogue(items,{query}).slice(0,limit):[];}
export function selectSpotlight(items,limit=10,curated=[]){
 const extras=new Map(curated.map(a=>[a.id,a]));
 return [...new Map(items.map(a=>[a.id,a])).values()].filter(a=>a.image||a.artwork?.poster?.url).map(a=>{
  const extra=extras.get(a.id);return extra?{...a,hero:extra.hero,heroMobile:extra.heroMobile,heroWidth:extra.heroWidth,heroHeight:extra.heroHeight,audienceRating:a.audienceRating||extra.audienceRating,popularity:a.popularity||extra.popularity}:a;
 }).sort((a,b)=>Number(extras.has(b.id))-Number(extras.has(a.id))||Number(b.ongoing)-Number(a.ongoing)||(b.popularity||0)-(a.popularity||0)||(Number(b.audienceRating||b.rating||b.score)||0)-(Number(a.audienceRating||a.rating||a.score)||0)||(b.year||0)-(a.year||0)).slice(0,limit);
}
