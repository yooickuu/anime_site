export function cleanSynopsis(value='') {
  return String(value).replace(/<br\s*\/?\s*>/gi,'\n').replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\[\/?[^\]]+\]/g,'').trim();
}
export function metadataFromAniList(a) {
  const date=a?.startDate;
  return {
    translations:{en:[a?.title?.english||a?.title?.romaji||'',cleanSynopsis(a?.description)],ja:[a?.title?.native||'','']},
    airedAt:date?.year?`${date.year}-${String(date.month||1).padStart(2,'0')}-${String(date.day||1).padStart(2,'0')}`:null,
    relations:(a?.relations?.edges||[]).filter(e=>['PREQUEL','SEQUEL'].includes(e.relationType)&&e.node?.type==='ANIME'&&e.node.idMal).map(e=>({id:Number(e.node.idMal),relation:e.relationType.toLowerCase()})),
  };
}
export function withMetadata(a,metadata={}) {
  const m=metadata[a.ids?.mal||a.malId];
  if(!m)return a;
  const translations={...a.translations};
  for(const lang of ['en','ja'])translations[lang]=[m.translations?.[lang]?.[0]||translations[lang]?.[0]||'',translations[lang]?.[1]||m.translations?.[lang]?.[1]||''];
  return {...a,translations,airedAt:m.airedAt||a.airedAt,relations:m.relations||a.relations,relatedMalIds:[...new Set([...(a.relatedMalIds||[]),...(m.relations||[]).map(e=>e.id)])]};
}
