// Compare only URLs already attached to the same canonical title. Never guess artwork.
const measurements=new Map(),preferred=new Map();
const local={32281:'yourname',47917:'bocchi',20583:'haikyu',40748:'jujutsu',38000:'demon'};
export function localPoster(a){return local[a?.malId]?`assets/${local[a.malId]}.jpg`:'';}
export function preferredPoster(a){return preferred.get(a?.malId||a?.id)||localPoster(a)||a?.image||'';}
export function sharperImage(current,candidate){
 if(!candidate?.width||!candidate?.height)return current;
 if(!current?.width||!current?.height)return candidate;
 // Compare usable detail after a consistent 2:3 crop, rather than file size.
 const detail=x=>Math.min(x.width,x.height*2/3);
 return detail(candidate)>detail(current)*1.04?candidate:current;
}
function measure(url){
 if(!measurements.has(url))measurements.set(url,new Promise(resolve=>{
  const img=new Image();let done=false;
  const finish=v=>{if(done)return;done=true;clearTimeout(timer);resolve(v);};
  const timer=setTimeout(()=>finish(null),10000);
  img.onload=()=>finish({url,width:img.naturalWidth,height:img.naturalHeight});img.onerror=()=>finish(null);img.src=url;
 }));
 return measurements.get(url);
}
export async function improvePoster(img,a){
 if(!a||!img.naturalWidth||img.dataset.qualityChecked)return;
 img.dataset.qualityChecked='true';
 const id=a.malId||a.id, original=img.getAttribute('src');
 let best={url:original,width:img.naturalWidth,height:img.naturalHeight};
 const urls=[...new Set([localPoster(a),a.image,a.posterFallback].filter(u=>u&&u!==original))];
 for(const result of await Promise.all(urls.map(measure)))best=sharperImage(best,result);
 if(best.url!==original){preferred.set(id,best.url);if(img.isConnected&&img.getAttribute('src')===original)img.src=best.url;}
}
