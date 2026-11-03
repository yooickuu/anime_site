// Loaded only after an anime details image is displayed. No catalogue/video data writes.
const measured=new Map(),metadata=new Map(),upgraded=new Map();
function bounded(map,key,value,max=40){map.delete(key);map.set(key,value);while(map.size>max)map.delete(map.keys().next().value);return value;}
export function sharperBackdrop(current,candidate,{width=1440,height=700}={}){
 const score=x=>{if(!x?.width||!x?.height)return 0;const ratio=x.width/x.height,target=width/height;return Math.min(x.width/width,x.height/height)*Math.pow(Math.min(ratio/target,target/ratio),.2);};
 return score(candidate)>score(current)*1.06?candidate:current;
}
function measure(url){
 if(!measured.has(url))bounded(measured,url,new Promise(resolve=>{const image=new Image();let done=false;const finish=v=>{if(done)return;done=true;clearTimeout(timer);image.onload=image.onerror=null;resolve(v);};const timer=setTimeout(()=>finish(null),8000);image.onload=()=>finish({url,width:image.naturalWidth,height:image.naturalHeight});image.onerror=()=>finish(null);image.src=url;}));
 return measured.get(url);
}
async function artworkFor(anime){
 const mal=Number(anime?.ids?.mal||anime?.malId);if(!Number.isSafeInteger(mal)||mal<=0)return [];
 if(!metadata.has(mal))bounded(metadata,mal,(async()=>{
  try{const response=await fetch('https://graphql.anilist.co',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:'query($id:Int){Media(idMal:$id,type:ANIME){idMal bannerImage coverImage{extraLarge large}}}',variables:{id:mal}}),signal:AbortSignal.timeout(6000)});
   if(!response.ok)return [];const data=(await response.json()).data?.Media;if(Number(data?.idMal)!==mal)return [];
   return [data.bannerImage,data.coverImage?.extraLarge,data.coverImage?.large].filter(u=>typeof u==='string'&&u.startsWith('https://'));
  }catch{return [];}
 })());
 return metadata.get(mal);
}
export async function improveDetailImage(img,anime){
 if(!anime||!img.naturalWidth||img.dataset.detailQualityChecked)return;
 img.dataset.detailQualityChecked='true';const original=img.getAttribute('src');
 const box=img.parentElement?.getBoundingClientRect(),size={width:Math.max(1,box?.width||1440),height:Math.max(1,box?.height||700)};
 let best={url:original,width:img.naturalWidth,height:img.naturalHeight};
 const live=()=>img.isConnected&&img.getAttribute('src')===original&&(!img.closest('dialog')||img.closest('dialog').open);
 const apply=()=>{if(best.url!==original&&live()){bounded(upgraded,anime.id,best);img.src=best.url;}};
 const cached=upgraded.get(anime.id);best=sharperBackdrop(best,cached,size);if(best.url!==original){apply();return;}
 // Already sharp landscape artwork should not trigger an extra API request.
 if(best.width>=Math.min(2560,size.width*1.5)&&best.height>=size.height&&best.width>=best.height)return;
 const local=[anime.artwork?.backdrop?.url,anime.artwork?.poster?.url,anime.image,anime.posterFallback].filter(u=>u&&u!==original);
 for(const result of await Promise.all([...new Set(local)].map(measure)))best=sharperBackdrop(best,result,size);
 if(!live())return;
 const extra=await artworkFor(anime);if(!live())return;
 for(const result of await Promise.all(extra.filter(u=>u!==original&&!local.includes(u)).map(measure)))best=sharperBackdrop(best,result,size);
 apply();
}
