// Admitted releases use their own reviewed image, never a legacy poster/banner.
export function detailArtwork(anime,legacy={}){
 if(anime?.catalogApproved)return anime.artwork?.backdrop?.url||'';
 return anime?.detailsBanner||legacy[anime?.malId]?.detailsBanner||anime?.banner||legacy[anime?.malId]?.banner||anime?.image||'';
}
