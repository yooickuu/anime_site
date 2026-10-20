// Browser image decoding and animation promises must never lock the carousel forever.
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
