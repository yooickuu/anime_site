import {normalizeSearch,normalizeType} from '../../src/catalog-query.js';
const names=a=>[a.title,a.originalTitle,...Object.values(a.translations||{}).map(v=>v?.[0])].filter(Boolean).map(normalizeSearch);
// Exact names only: a sequel must never inherit the first season's video.
export function sameAnnouncement(card,candidate){
 for(const key of ['mal','shikimori','anilist'])if(card.ids?.[key]&&candidate.ids?.[key]&&Number(card.ids[key])!==Number(candidate.ids[key]))return false;
 if(['mal','shikimori','anilist'].some(key=>card.ids?.[key]&&Number(card.ids[key])===Number(candidate.ids?.[key])))return true;
 if(!card.type||!candidate.type||normalizeType(card.type)!==normalizeType(candidate.type))return false;
 if(card.year&&Number(card.year)!==Number(candidate.year))return false;
 const wanted=names(card).filter(n=>n&&!/title to be announced|provisional title/.test(n));
 return names(candidate).some(n=>wanted.includes(n));
}
export function announcementCandidates(card,rows){
 const matched=rows.filter(r=>Number(r.shikimori_id)>0&&sameAnnouncement(card,{
  title:r.title,originalTitle:r.title_orig,year:r.year,type:r.material_data?.anime_kind,
  ids:{shikimori:Number(r.shikimori_id)}
 }));
 // Different dubs are fine; different anime with the same name are not.
 return new Set(matched.map(r=>String(r.shikimori_id))).size===1?matched:[];
}
