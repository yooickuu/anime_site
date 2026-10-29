// Browser image decoding and animation promises must never lock the carousel forever.
export const PROMO_PERIOD=2*24*60*60*1000;
export const PROMO_EPOCH=Date.parse('2026-10-29T00:00:00+05:00');
// A shared calendar, not localStorage: every visitor sees the same ten titles.
export function scheduledHeroes(items,now=Date.now()){
 const unique=[...new Map(items.map(a=>[a.id,a])).values()].slice(0,20);
 if(unique.length<=10)return unique;
 const period=Math.max(0,Math.floor((now-PROMO_EPOCH)/PROMO_PERIOD));
 return unique.slice(period%2*10,period%2*10+10);
}
export function within(promise, milliseconds) {
 let timer;
 const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Hero operation timed out')),milliseconds);});
 return Promise.race([promise,timeout]).finally(()=>clearTimeout(timer));
}
export async function nextHero(pool,current,direction,prepare) {
 for(let step=1;step<pool.length;step++){
  const index=((current+direction*step)%pool.length+pool.length)%pool.length;
  try{await prepare(pool[index]);return {item:pool[index],index};}catch{}
 }
 return null;
}
export function fadeHero(previous,duration=1100){
 const remove=()=>previous.remove();
 // Timeout also handles Safari suspending Web Animations in background windows.
 const timer=setTimeout(remove,duration+100);
 try{previous.animate([{opacity:1},{opacity:0}],{duration,easing:'cubic-bezier(.22,.61,.36,1)'}).finished.then(()=>{clearTimeout(timer);remove();},()=>{clearTimeout(timer);remove();});}
 catch{clearTimeout(timer);remove();}
}
