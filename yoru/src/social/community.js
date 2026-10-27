import {h,tr,scope,member,person,status,imageURL} from './common.js';
import {api} from './api.js';
export function mount(root,ctx,initial='people'){
 const life=scope(root,ctx),db=api(ctx,life);let searchTimer,version=0,friends=[];
 root.innerHTML=`<section class="social-panel"><div class="social-heading"><h1>${tr(ctx,'title')}</h1>${ctx.user()?`<a class="button soft" href="#user/${ctx.user().id}">${tr(ctx,'profile')}</a>`:`<button class="button primary" data-login>${tr(ctx,'login')}</button>`}</div><nav class="social-actions"><button class="button soft" data-tab="people">${tr(ctx,'people')}</button><button class="button soft" data-tab="friends">${tr(ctx,'friends')}</button><button class="button soft" data-tab="chats">${tr(ctx,'chats')}</button></nav><div data-content></div><p data-status role="status"></p></section>`;
 const box=root.querySelector('[data-content]');
 async function tab(name){const own=++version;root.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.tab===name)));clearTimeout(searchTimer);if(name!=='people'&&!member(ctx))return;
  box.innerHTML=`<p>${tr(ctx,'loading')}</p>`;
  try{
   if(name==='people'){
    box.innerHTML=`<label>${tr(ctx,'people')}<input type="search" data-people maxlength="40" autocomplete="off"></label><div data-results class="social-people"></div>`;
    box.querySelector('input').addEventListener('input',event=>{const q=event.target.value;clearTimeout(searchTimer);const request=++version;searchTimer=setTimeout(async()=>{try{const rows=q.trim()?await db.people(q):[];if(life.live()&&request===version)box.querySelector('[data-results]').innerHTML=rows.map(p=>person(ctx,p)).join('')||tr(ctx,'empty');}catch(e){if(life.live()&&request===version)status(root,ctx,e);}},300);},{signal:life.signal});
   }else if(name==='friends'){
    friends=await db.friends();if(!life.live()||own!==version)return;
    const uid=ctx.user().id;
    box.innerHTML=['accepted','incoming','outgoing'].map(group=>`<h2>${tr(ctx,group==='accepted'?'friends':group)}</h2>`+friends.filter(f=>group==='accepted'?f.status==='accepted':f.status==='pending'&&(group==='incoming'?f.recipient===uid:f.requester===uid)).map(f=>{const p=f.requester===uid?f.to:f.from;return `<div class="social-friend">${person(ctx,p)}<div class="social-actions">${group==='accepted'?`<button class="button soft" data-dm="${p.user_id}">${tr(ctx,'message')}</button><button class="text-button" data-friend="${p.user_id}" data-do="remove">${tr(ctx,'remove')}</button>`:group==='incoming'?`<button class="button primary" data-friend="${p.user_id}" data-do="accept">${tr(ctx,'accept')}</button><button class="text-button" data-friend="${p.user_id}" data-do="reject">${tr(ctx,'reject')}</button>`:`<button class="text-button" data-friend="${p.user_id}" data-do="cancel">${tr(ctx,'cancel')}</button>`}</div></div>`;}).join('')).join('');
   }else{
    const rooms=await db.rooms();if(!life.live()||own!==version)return;
    box.innerHTML=`<button class="button primary" data-group>${tr(ctx,'group')}</button><div data-group-form></div><div class="social-room-list">${rooms.map(r=>`<a class="social-room" href="#chat/${r.room_id}"><span class="social-room-avatars">${(r.peers||[]).slice(0,2).map(p=>`<span class="social-avatar">${p.avatar_path?`<img src="${h(imageURL(ctx,p.avatar_path))}" alt="" loading="lazy">`:h(p.nickname?.slice(0,1)||'?')}</span>`).join('')}</span><strong>${h(r.room?.title||r.label||tr(ctx,'chats'))}</strong></a>`).join('')||tr(ctx,'empty')}</div>`;
   }
  }catch(e){if(life.live()&&own===version){box.innerHTML='';status(root,ctx,e);}}
 }
 root.addEventListener('click',async event=>{const b=event.target.closest('button');if(!b)return;try{b.disabled=true;status(root,ctx);
  if(b.hasAttribute('data-login'))ctx.login();
  if(b.dataset.tab)await tab(b.dataset.tab);
  if(b.dataset.friend&&member(ctx)){await db.friend(b.dataset.friend,b.dataset.do);if(life.live())await tab('friends');}
  if(b.dataset.dm&&member(ctx)){const room=await db.room([b.dataset.dm]);if(life.live())location.hash='chat/'+room;}
  if(b.hasAttribute('data-group')&&member(ctx)){
   const rows=(await db.friends()).filter(f=>f.status==='accepted');if(!life.live())return;
   const target=box.querySelector('[data-group-form]');target.innerHTML=`<form class="social-form"><label>${tr(ctx,'groupName')}<input name="title" maxlength="80" required></label><fieldset><legend>${tr(ctx,'friends')}</legend>${rows.map(f=>{const p=f.requester===ctx.user().id?f.to:f.from;return `<label class="social-check"><input name="members" type="checkbox" value="${p.user_id}">${h(p.nickname)}</label>`;}).join('')||tr(ctx,'empty')}</fieldset><button class="button primary">${tr(ctx,'group')}</button></form>`;
   target.querySelector('form').addEventListener('submit',async e=>{e.preventDefault();const submit=e.target.querySelector('button');submit.disabled=true;try{const users=[...e.target.querySelectorAll('input[name=members]:checked')].map(x=>x.value);const room=await db.room(users,e.target.elements.title.value);if(life.live())location.hash='chat/'+room;}catch(err){if(life.live())status(root,ctx,err);}finally{submit.disabled=false;}},{signal:life.signal});
  }
 }catch(e){if(life.live())status(root,ctx,e);}finally{b.disabled=false;}},{signal:life.signal});
 tab(['people','friends','chats'].includes(initial)?initial:'people');return ()=>{clearTimeout(searchTimer);++version;life.dispose();};
}
