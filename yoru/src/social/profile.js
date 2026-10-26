import {h,tr,scope,member,person,when,status,imageURL} from './common.js';
import {api} from './api.js';
export function mount(root,ctx,id){
 const life=scope(root,ctx),db=api(ctx,life);let profile;
 root.innerHTML=`<section class="social-panel"><p>${tr(ctx,'loading')}</p><p data-status role="status"></p></section>`;
 async function load(){try{
  profile=await db.profile(id);if(!life.live())return;
  if(!profile){root.textContent=tr(ctx,'notFound');return;}
  const own=ctx.user()?.id===id,s=profile.stats||{};
  root.innerHTML=`<section class="social-profile"><div class="social-cover">${profile.banner_path?`<img src="${h(imageURL(ctx,profile.banner_path))}" alt="">`:''}<div class="social-cover-fade"></div></div><div class="social-profile-info social-panel">${person(ctx,profile)}<p class="social-text">${h(profile.bio)}</p><div class="social-stats">${[['saved',s.saved],['lists',s.lists],['completed',s.completed],['rating',s.rating]].map(([label,value])=>`<div><strong>${h(value??'—')}</strong><span>${tr(ctx,label)}</span></div>`).join('')}</div><div class="social-actions">${own?`<button class="button soft" data-edit>${tr(ctx,'edit')}</button>`:`<button class="button primary" data-friend>${tr(ctx,'addFriend')}</button><button class="button soft" data-message>${tr(ctx,'message')}</button>`}<a class="button soft" href="#social">${tr(ctx,'title')}</a></div><p data-status role="status"></p><div data-editor></div></div><section class="social-panel"><h2>${tr(ctx,'history')}</h2><div data-history>${tr(ctx,profile.history_public?'loading':'privateHistory')}</div></section></section>`;
  if(profile.history_public){const rows=await db.history(id);if(!life.live())return;const box=root.querySelector('[data-history]');box.innerHTML=rows.map(r=>`<div class="social-history-row"><button class="text-button" data-anime="${h(r.anime_id)}">${h(r.anime_id)}</button><small>${tr(ctx,'season')} ${r.season} · ${tr(ctx,'episode')} ${r.episode} · ${h(when(ctx,r.watched_at))}</small></div>`).join('')||tr(ctx,'empty');
   for(const r of rows){ctx.card(r.anime_id).then(a=>{if(life.live()&&a){const b=box.querySelector(`[data-anime="${r.anime_id}"]`);if(b)b.textContent=ctx.title(a);}}).catch(()=>{});}
  }
 }catch(e){if(life.live())status(root,ctx,e);}}
 root.addEventListener('click',async event=>{const b=event.target.closest('button');if(!b)return;try{
  if(b.dataset.anime){ctx.details(b.dataset.anime);return;}
  if(!member(ctx))return;
  if(b.hasAttribute('data-friend')){b.disabled=true;await db.friend(id,'request');if(life.live())b.textContent=tr(ctx,'pending');}
  if(b.hasAttribute('data-message')){b.disabled=true;const room=await db.room([id]);if(life.live())location.hash='chat/'+room;}
  if(b.hasAttribute('data-edit'))editor();
 }catch(e){if(life.live())status(root,ctx,e);}finally{b.disabled=false;}},{signal:life.signal});
 function editor(){
  const box=root.querySelector('[data-editor]');
  box.innerHTML=`<form class="social-form"><p>${tr(ctx,'privacy')}</p><label>${tr(ctx,'bio')}<textarea name="bio" maxlength="240">${h(profile.bio||ctx.preferences()?.bio||'')}</textarea></label><label class="social-check"><input name="history" type="checkbox" ${profile.history_public?'checked':''}>${tr(ctx,'publishHistory')}</label><label>${tr(ctx,'avatar')}<input name="avatar" type="file" accept="image/jpeg,image/png,image/webp"></label><label class="social-check"><input name="removeAvatar" type="checkbox">${tr(ctx,'remove')} · ${tr(ctx,'avatar')}</label><label>${tr(ctx,'banner')}<input name="banner" type="file" accept="image/jpeg,image/png,image/webp"></label><label class="social-check"><input name="removeBanner" type="checkbox">${tr(ctx,'remove')} · ${tr(ctx,'banner')}</label><button class="button primary">${tr(ctx,'save')}</button></form>`;
  box.querySelector('form').addEventListener('submit',async event=>{event.preventDefault();if(!member(ctx))return;const f=event.target,b=f.querySelector('button');b.disabled=true;try{
   const {uploadImage}=await import('./media.js');
   let avatar=f.elements.removeAvatar.checked?null:profile.avatar_path,banner=f.elements.removeBanner.checked?null:profile.banner_path;
   if(f.elements.avatar.files[0])avatar=await uploadImage(ctx,f.elements.avatar.files[0],{avatar:true});
   if(!life.live())return;
   if(f.elements.banner.files[0])banner=await uploadImage(ctx,f.elements.banner.files[0]);
   if(!life.live())return;
   await db.saveProfile({p_bio:f.elements.bio.value,p_history:f.elements.history.checked,p_avatar:avatar,p_banner:banner});
   if(life.live())await load();
  }catch(e){if(life.live())status(root,ctx,e);}finally{b.disabled=false;}},{signal:life.signal});
 }
 load();return life.dispose;
}
