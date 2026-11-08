// One delegated pointer listener, one animation frame; touch and reduced-motion stay still.
export function installLiquidMotion(){
 const allowed=matchMedia('(hover: hover) and (pointer: fine)'),reduce=matchMedia('(prefers-reduced-motion: reduce)');let card,frame=0,point;
 function reset(){cancelAnimationFrame(frame);frame=0;if(card){card.classList.remove('is-tilting');for(const key of ['--tilt-x','--tilt-y','--glow-x','--glow-y'])card.style.removeProperty(key);}card=null;}
 document.addEventListener('pointermove',e=>{if(!allowed.matches||reduce.matches)return;const next=e.target.closest('.anime-card,.recent-card');if(!next){reset();return;}if(next!==card){reset();card=next;card.classList.add('is-tilting');}point=[e.clientX,e.clientY];if(frame)return;frame=requestAnimationFrame(()=>{frame=0;if(!card?.isConnected){reset();return;}const r=card.getBoundingClientRect(),x=Math.max(0,Math.min(1,(point[0]-r.left)/r.width)),y=Math.max(0,Math.min(1,(point[1]-r.top)/r.height));card.style.setProperty('--tilt-x',`${(0.5-y)*7}deg`);card.style.setProperty('--tilt-y',`${(x-0.5)*7}deg`);card.style.setProperty('--glow-x',`${x*100}%`);card.style.setProperty('--glow-y',`${y*100}%`);});},{passive:true});
 document.addEventListener('pointerout',e=>{if(card&&!card.contains(e.relatedTarget))reset();},{passive:true});
 document.addEventListener('yomiku:navigation',reset);window.addEventListener('blur',reset);reduce.addEventListener('change',reset);
}
