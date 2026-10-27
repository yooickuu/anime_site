import {h,tr,scope,member,person,status,imageURL,dateOnly} from './common.js';
import {api} from './api.js';
import {syncProfile} from './unified-profile.js';
export function mount(root,ctx,id){
 const life=scope(root,ctx),db=api(ctx,life);let profile,paintVersion=0;
 root.innerHTML=`<section class="social-panel"><p>${tr(ctx,'loading')}</p><p data-status role="status"></p></section>`;
 async function paint(next){
  if(!life.live())return;profile=next;const ownPaint=++paintVersion;
  if(!profile){root.textContent=tr(ctx,'notFound');return;}
  const own=ctx.user()?.id===id,s=profile.stats||{};
  root.innerHTML=`<section class="social-profile"><div class="social-cover">${profile.banner_path?`<img src="${h(imageURL(ctx,profile.banner_path))}" alt="">`:''}<div class="social-cover-fade"></div></div><div class="social-profile-info social-panel">${person(ctx,profile)}<p class="social-text">${h(profile.bio)}</p><div class="social-stats">${[['saved',s.saved],['lists',s.lists],['completed',s.completed],['rating',s.rating]].map(([label,value])=>`<div><strong>${h(value??'—')}</strong><span>${tr(ctx,label)}</span></div>`).join('')}</div><div class="social-actions">${own?`<a class="button soft" href="#profile">${tr(ctx,'edit')}</a>`:`<button class="button primary" data-friend>${tr(ctx,'addFriend')}</button><button class="button soft" data-message>${tr(ctx,'message')}</button>`}<a class="button soft" href="#social/people">${tr(ctx,'people')}</a></div><p data-status role="status"></p><div data-editor></div></div><section class="social-panel"><h2>${tr(ctx,'history')}</h2><div data-history>${tr(ctx,profile.history_public?'loading':'privateHistory')}</div></section></section>`;
  if(profile.history_public){const rows=await db.history(id);if(!life.live()||ownPaint!==paintVersion)return;const box=root.querySelector('[data-history]');box.innerHTML=rows.map(r=>`<button class="social-history-card" data-anime="${h(r.anime_id)}"><span data-card-art></span><span><strong data-card-title>${h(r.anime_id)}</strong><small>${h(dateOnly(ctx,r.watched_date))}</small></span></button>`).join('')||tr(ctx,'empty');
   for(const r of rows){ctx.card(r.anime_id).then(a=>{if(life.live()&&ownPaint===paintVersion&&a){const b=box.querySelector(`[data-anime="${r.anime_id}"]`);if(b){b.querySelector('[data-card-title]').textContent=ctx.title(a);b.querySelector('[data-card-art]').innerHTML=`<img src="${h(ctx.cover(a))}" alt="" loading="lazy">`;}}}).catch(()=>{});}

  }
 }
 async function load(){try{await db.cachedProfile(id,next=>{void paint(next).catch(e=>{if(life.live())status(root,ctx,e);});});if(ctx.user()?.id===id&&ctx.profileReady?.()&&life.live()){await syncProfile(ctx);if(life.live())await db.cachedProfile(id,next=>{void paint(next).catch(()=>{});});}}catch(e){if(life.live())status(root,ctx,e);}}
 root.addEventListener('click',async event=>{const b=event.target.closest('button');if(!b)return;try{
  if(b.dataset.anime){ctx.details(b.dataset.anime);return;}
  if(!member(ctx))return;
  if(b.hasAttribute('data-friend')){b.disabled=true;await db.friend(id,'request');if(life.live())b.textContent=tr(ctx,'pending');}
  if(b.hasAttribute('data-message')){b.disabled=true;const room=await db.room([id]);if(life.live())location.hash='chat/'+room;}
 }catch(e){if(life.live())status(root,ctx,e);}finally{b.disabled=false;}},{signal:life.signal});
 load();return life.dispose;
}
