// Read-only recovery of old provider IDs. Never register or rewrite a saved entry.
const key=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/ё/g,'е').replace(/[\p{P}\p{S}\s]+/gu,' ').trim();
const kind=s=>({'ТВ':'TV','Сериал':'TV','Фильм':'MOVIE'})[s]||String(s||'').toUpperCase();
export function savedDisplay(row){
 const c=row.card||{},title=typeof c.title==='string'?c.title.trim():'';
 const image=typeof c.image==='string'&&/^https:\/\//i.test(c.image)?c.image:'';
 return title?{id:row.anime_id,title,originalTitle:c.originalTitle||'',image,year:Number(c.year)||0,type:c.type||'',displayOnly:true}:null;
}
export async function resolveSavedCard(row,ctx){
 try{const a=await ctx.card(row.anime_id);if(a)return a;}catch{}
 const c=row.card||{},saved=savedDisplay(row);if(!saved)return null;
 if(/^\d{1,10}$/.test(String(c.malId||''))){for(const id of ['mal-'+c.malId,'shikimori-'+c.malId]){try{const a=await ctx.card(id);if(a)return a;}catch{}}}
 if(saved.year&&saved.type&&ctx.searchAnime){try{
  const names=[saved.title,saved.originalTitle].filter(Boolean).map(key);
  const rows=await ctx.searchAnime(saved.originalTitle||saved.title);
  const matches=rows.filter(a=>Number(a.year)===saved.year&&kind(a.type)===kind(saved.type)&&[a.title,a.originalTitle,a.translations?.en?.[0]].some(n=>n&&names.includes(key(n))));
  const unique=[...new Map(matches.map(a=>[a.id,a])).values()];if(unique.length===1)return unique[0];
 }catch{}}
 return saved;
}
