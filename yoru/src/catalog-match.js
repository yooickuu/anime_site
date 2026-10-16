// Conservative identity matching: full title AND year AND media kind must agree.
// Ambiguous matches are never merged. Season numbers are retained.
export function identityTitle(value=''){return value.normalize('NFKC').toLocaleLowerCase().replace(/ё/g,'е').replace(/[\p{P}\p{S}\s]+/gu,' ').trim();}
export function identityKeys(a){const year=Number(a.year),type=a.type;return year&&type?[...new Set([a.title,a.english,...(a.names||[])].filter(Boolean).map(name=>identityTitle(name)+'|'+year+'|'+type))]:[];}
export function identityIndex(items){const map=new Map();for(const a of items)for(const key of identityKeys(a)){const list=map.get(key)||[];if(!list.some(x=>x.id===a.id))list.push(a);map.set(key,list);}return map;}
export function exactIdentity(a,index){const matches=new Map();for(const key of identityKeys(a))for(const b of index.get(key)||[])matches.set(b.id,b);return matches.size===1?[...matches.values()][0]:null;}
// Films may use the Japanese premiere year or the international release year.
// Only a unique, complete original title may bridge a one-year difference.
export function adjacentMovieIdentity(a,items){
 if(a.type!=='MOVIE'||!a.english||!Number(a.year))return null;
 const title=identityTitle(a.english);
 const found=items.filter(b=>b.type==='MOVIE'&&Math.abs(Number(a.year)-Number(b.year))===1&&identityTitle(b.english||'')===title);
 return found.length===1?found[0]:null;
}
