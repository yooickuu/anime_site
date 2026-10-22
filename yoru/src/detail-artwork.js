import curatedSpotlight from './spotlight.json' with {type:'json'};
const reviewedScenes=new Map(curatedSpotlight.map(a=>[a.id,a.hero||a.banner]));
// Admitted releases use their own reviewed image, never a legacy poster/banner.
export function detailArtwork(anime,legacy={}){
 if(anime?.catalogApproved){if(reviewedScenes.has(anime.id))return reviewedScenes.get(anime.id);const image=anime.artwork?.backdrop?.url;return image&&!image.includes('101922-33MtJGsUSxga')?image:(anime.artwork?.poster?.url||anime.image||'');}
 return anime?.detailsBanner||legacy[anime?.malId]?.detailsBanner||anime?.banner||legacy[anime?.malId]?.banner||anime?.image||'';
}
