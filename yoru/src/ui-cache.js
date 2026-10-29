// Display-only snapshots. Never used as the base of a database write.
const PREFIX='yomiku.ui.v1.';
const CARD_FIELDS=['id','title','originalTitle','alt','short','year','episodes','genres','image','posterFallback','malId','ids','type','format','ongoing','audienceRating','popularity','catalogApproved','catalogOnly','providerId','animeVostId','kitsuId','duration'];
export function displayCard(a){
 if(!a?.id)return null;
 const card=Object.fromEntries(CARD_FIELDS.filter(k=>a[k]!==undefined).map(k=>[k,a[k]]));
 card.genres=card.genres||[];
 if(a.translations)card.translations=Object.fromEntries(Object.entries(a.translations).map(([k,v])=>[k,[v[0],'']]));
 return card;
}
export function displayState(state){
 const trim=items=>Object.fromEntries(Object.entries(items||{}).map(([id,item])=>[id,{...item,...(item.anime?{anime:displayCard(item.anime)}:{})}]));
 return {...state,entries:trim(state.entries),progress:trim(state.progress)};
}
export function createUiCache(storage,{now=Date.now,maxBytes=2000000}={}){
 const key=(uid,kind)=>PREFIX+uid+'.'+kind;
 function get(uid,kind){if(!uid)return null;try{const value=JSON.parse(storage.getItem(key(uid,kind)));return value?.expires>now()?value.value:null;}catch{return null;}}
 function put(uid,kind,value,ttl){if(!uid)return;try{const text=JSON.stringify({expires:now()+ttl,value});if(text.length*2<=maxBytes)storage.setItem(key(uid,kind),text);}catch{/* Cache quota cannot interrupt saving actual lists. */}}
 return {
  state:uid=>get(uid,'state'),
  saveState:(uid,state)=>put(uid,'state',displayState(state),7*86400000),
  cards:uid=>get(uid,'cards')||[],
  saveCards:(uid,cards)=>put(uid,'cards',[...new Map(cards.filter(Boolean).map(a=>[a.id,displayCard(a)])).values()].slice(-600),7*86400000),
  image:(uid,path)=>{const values=get(uid,'images')||{};const v=values[path];return v?.expires>now()?v:null;},
  saveImage(uid,path,url,expires){const values=get(uid,'images')||{};put(uid,'images',{...Object.fromEntries(Object.entries(values).filter(([,v])=>v.expires>now()).slice(-3)),[path]:{url,expires}},3600000);},
  remove(uid){for(const kind of ['state','cards','images'])try{storage.removeItem(key(uid,kind));}catch{}},
 };
}
