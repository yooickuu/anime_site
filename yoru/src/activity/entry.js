import {badges,text} from './badges.js';
import './style.css';
import {badgeCache} from './badge-cache.js';
function css(){if(document.querySelector('[data-activity-css]'))return;const link=document.createElement('link');link.rel='stylesheet';link.dataset.activityCss='';const url=new URL('./entry.css',import.meta.url);url.search=new URL(import.meta.url).search;link.href=url.href;document.head.append(link);}
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function start(ctx){
 css();const uid=ctx.user()?.id,life=new AbortController();let storage;try{storage=ctx.storage||localStorage;}catch{}
 const cache=badgeCache(storage,uid);let nightPending=false;let snapshot=cache.snapshot,alive=true,pending=null,first=true,toastTimer,queue=[],currentToast=null;
 const live=()=>alive&&ctx.user()?.id===uid&&!ctx.user()?.is_anonymous;

 function paint(){if(!live())return;const lang=ctx.lang(),count=Object.keys(snapshot.badges||{}).filter(id=>badges.some(b=>b[0]===id)).length;document.querySelectorAll('[data-badge-count]').forEach(el=>{if(el.textContent!==String(count))el.textContent=count;});
  const root=document.querySelector('#profile-activity');if(!root)return;const stamp=JSON.stringify([snapshot.badges,lang]);if(root.dataset.rendered===stamp)return;root.dataset.rendered=stamp;
  root.innerHTML=`<section class="profile-achievements"><div class="achievement-heading"><div class="section-visibility-heading"><h1>${text(['Достижения','Achievements','実績'],lang)}</h1></div><span>${Object.keys(snapshot.badges||{}).filter(id=>badges.some(b=>b[0]===id)).length} / ${badges.length}</span></div><div class="achievement-grid">${badges.map(([id,,names,descriptions],i)=>`<article class="achievement ${snapshot.badges?.[id]?'is-unlocked':''}" style="--entry-delay:${Math.min(i,9)*25}ms"><strong>${esc(text(names,lang))}</strong><small>${esc(text(descriptions,lang))}</small><span class="achievement-state">${text(snapshot.badges?.[id]?['Открыто','Unlocked','達成']:['Пока закрыто','Locked','未達成'],lang)}</span></article>`).join('')}</div></section>`;

 }
 function showNext(){if(!live()||currentToast||!queue.length||document.hidden)return;
  // Native iOS fullscreen cannot display HTML overlays. Wait until the user exits it.
  const video=document.querySelector('#video');if(video?.webkitDisplayingFullscreen)return;
  const badge=queue[0],el=document.createElement('div');el.className='achievement-toast';el.setAttribute('role','status');el.innerHTML=`<span class="achievement-spark" aria-hidden="true"></span><span><small>${text(['Достижение открыто','Achievement unlocked','実績解除'],ctx.lang())}</small><strong>${esc(text(badge[2],ctx.lang()))}</strong></span>`;
  const parent=document.fullscreenElement||document.body;parent.append(el);
  const controls=document.querySelector('.video-controls'),rect=controls?.getBoundingClientRect(),vh=window.innerHeight;
  const overlaps=rect&&rect.bottom>0&&rect.top<vh&&rect.left<window.innerWidth*.75&&rect.right>window.innerWidth*.25;
  const bottom=Math.max(18,overlaps?vh-rect.top+12:18);el.style.bottom=bottom+'px';
  if(bottom+80>vh){el.remove();return;}queue.shift();currentToast=el;
  toastTimer=setTimeout(()=>{el.remove();currentToast=null;showNext();},3000);
 }
 async function sync(){if(!live()||pending||document.hidden)return pending;pending=(async()=>{
  const {data,error}=await ctx.client.rpc('yoru_activity_sync',{p_session:null,p_seconds:0,p_night:0});if(error||!live())return;
  if(!first)for(const badge of badges)if(data.badges?.[badge[0]]&&!snapshot.badges?.[badge[0]])queue.push(badge);
  cache.accept(data);snapshot=cache.snapshot;first=false;paint();showNext();
 })().catch(()=>{}).finally(()=>{pending=null;});return pending;}
 // Listen only: never seek, play, pause, or alter the media pipeline.
 document.addEventListener('playing',async e=>{const video=e.target;if(!live()||document.hidden||video?.id!=='video'||video.paused||video.ended||new Date().getHours()>=5||snapshot.badges?.night||nightPending)return;
 nightPending=true;try{const {data,error}=await ctx.client.rpc('yoru_badge_night',{p_offset:new Date().getTimezoneOffset()});if(!error&&live()&&data?.badges?.night){if(!snapshot.badges?.night)queue.push(badges.find(b=>b[0]==='night'));cache.accept(data);snapshot=cache.snapshot;paint();showNext();}}catch{}finally{nightPending=false;}
 },{capture:true,signal:life.signal});
 const observer=new MutationObserver(()=>paint());observer.observe(document.querySelector('#app')||document.body,{childList:true,subtree:true});
 document.addEventListener('yomiku:activity-change',()=>void sync(),{signal:life.signal});
 document.addEventListener('yomiku:navigation',()=>{paint();void sync();},{signal:life.signal});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden){void sync();showNext();}},{signal:life.signal});
 document.addEventListener('fullscreenchange',()=>{if(currentToast){currentToast.remove();currentToast=null;clearTimeout(toastTimer);}showNext();},{signal:life.signal});
 window.addEventListener('online',()=>void sync(),{signal:life.signal});
 paint();void sync();
 return {paint,dispose(){alive=false;observer.disconnect();life.abort();clearTimeout(toastTimer);currentToast?.remove();queue=[];}};
}
