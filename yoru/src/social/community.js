import {unreadCounts,paintUnread} from './unread-counts.js';
import {h,tr,scope,member,person,status,imageURL} from './common.js';
import {api} from './api.js';
export function mount(root,ctx,initial='chats'){
 const life=scope(root,ctx),db=api(ctx,life);let searchTimer,version=0,friends=[],chatQuery='',friendTab='accepted';
 const section=['people','friends','chats'].includes(initial)?initial:'chats';
 root.innerHTML=`<section class="social-panel social-directory"><div class="social-heading"><h1>${tr(ctx,section)}</h1><a class="text-button" href="#profile">${tr(ctx,'back')}</a></div><div data-content></div><p data-status role="status"></p></section>`;
 const box=root.querySelector('[data-content]');
 let unreadTimer,unreadBusy=false,unread=new Map();
 async function refreshUnread(){clearTimeout(unreadTimer);if(!life.live()||section!=='chats'||!ctx.user()?.id)return;if(unreadBusy)return;unreadBusy=true;try{if(!document.hidden){const ids=[...box.querySelectorAll('[data-room-unread]')].map(b=>b.dataset.roomUnread);const next=await unreadCounts(ctx,life,ids);if(life.live()){unread=next;paintUnread(box,unread,ctx.lang());}}}catch{}finally{unreadBusy=false;if(life.live())unreadTimer=setTimeout(refreshUnread,15000);}}
 document.addEventListener('visibilitychange',refreshUnread,{signal:life.signal});document.addEventListener('yomiku:chat-read',refreshUnread,{signal:life.signal});
 const label=(ru,en,ja)=>({ru,en,ja})[ctx.lang()]||en;
 const actionIcon=kind=>`<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">${kind==='mail'?'<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m3 6 9 7 9-7"/>':'<path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7"/>'}</svg>`;
 function friendNav(){return `<nav class="friend-tabs" aria-label="${tr(ctx,'friends')}">${[['accepted',label('Список друзей','Friends','友達一覧')],['find',label('Найти друга','Find a friend','友達を探す')],['incoming',label('Заявки в друзья','Requests','受信リクエスト')],['outgoing',label('Отправленные запросы','Sent requests','送信リクエスト')]].map(([id,name])=>`<button class="button soft ${friendTab===id?'active':''}" data-friend-tab="${id}" aria-pressed="${friendTab===id}">${name}</button>`).join('')}</nav>`;}

 function filterChats(){const q=chatQuery.normalize('NFKC').toLocaleLowerCase().trim();let found=0;for(const row of box.querySelectorAll('.social-room-row,.social-friend')){const name=row.querySelector('strong')?.textContent||'';row.hidden=!name.normalize('NFKC').toLocaleLowerCase().includes(q);if(!row.hidden)found++;}const empty=box.querySelector('[data-chat-empty]');if(empty)empty.hidden=!q||found>0;}
 root.addEventListener('input',event=>{if(event.target.hasAttribute('data-chat-filter')){chatQuery=event.target.value;filterChats();}},{signal:life.signal});
 async function tab(name){const own=++version;clearTimeout(searchTimer);if(name!=='people'&&!member(ctx)){box.innerHTML=`<button class="button primary" data-login>${tr(ctx,'login')}</button>`;return;}
  box.innerHTML=`<p>${tr(ctx,'loading')}</p>`;
  try{
   if(name==='people'||name==='friends'&&friendTab==='find'){
    box.innerHTML=`${name==='friends'?friendNav():''}<label class="people-search">${tr(ctx,'people')}<input type="search" data-people maxlength="40" autocomplete="off" placeholder="${tr(ctx,'people')}"></label><p data-search-state role="status"></p><div data-results class="social-people"></div>`;
    box.querySelector('input').addEventListener('input',event=>{
     const q=event.target.value.trim();clearTimeout(searchTimer);const request=++version;
     const results=box.querySelector('[data-results]'),notice=box.querySelector('[data-search-state]');
     results.innerHTML='';status(root,ctx);notice.textContent=q?tr(ctx,'loading'):'';
     if(!q)return;
     searchTimer=setTimeout(async()=>{try{const rows=await db.people(q);if(life.live()&&request===version){results.innerHTML=rows.map(p=>person(ctx,p)).join('');notice.textContent=rows.length?'':tr(ctx,'notFound');}}catch(e){if(life.live()&&request===version){notice.textContent='';status(root,ctx,e);}}},180);
    },{signal:life.signal});
   }else if(name==='friends'){
    friends=await db.friends();if(!life.live()||own!==version)return;
    const uid=ctx.user().id;
    box.innerHTML=friendNav()+[friendTab].map(group=>friends.filter(f=>group==='accepted'?f.status==='accepted':f.status==='pending'&&(group==='incoming'?f.recipient===uid:f.requester===uid)).map(f=>{const p=f.requester===uid?f.to:f.from;return `<div class="social-friend">${person(ctx,p)}<div class="social-actions">${group==='accepted'?`<button class="friend-icon" data-dm="${p.user_id}" aria-label="${tr(ctx,'message')}" title="${tr(ctx,'message')}">${actionIcon('mail')}</button><button class="friend-icon" data-friend="${p.user_id}" data-do="remove" aria-label="${tr(ctx,'remove')}" title="${tr(ctx,'remove')}">${actionIcon('trash')}</button>`:group==='incoming'?`<button class="button primary" data-friend="${p.user_id}" data-do="accept">${tr(ctx,'accept')}</button><button class="text-button" data-friend="${p.user_id}" data-do="reject">${tr(ctx,'reject')}</button>`:`<button class="text-button" data-friend="${p.user_id}" data-do="cancel">${tr(ctx,'cancel')}</button>`}</div></div>`;}).join('')||`<p class="social-empty">${tr(ctx,'empty')}</p>`).join('');
   }else{
    await db.cachedChats(({rooms,friendships})=>{if(!life.live()||own!==version||box.querySelector('[data-group-form] form'))return;
    const chatting=new Set(rooms.filter(r=>r.room?.kind==='dm').flatMap(r=>(r.peers||[]).map(p=>p.user_id)));
    const contacts=friendships.filter(f=>f.status==='accepted').map(f=>f.requester===ctx.user().id?f.to:f.from).filter(p=>p&&!chatting.has(p.user_id));
    box.innerHTML=`<button class="button primary" data-group>${tr(ctx,'group')}</button><div data-group-form></div><label class="social-chat-search"><input type="search" data-chat-filter value="${h(chatQuery)}" placeholder="${tr(ctx,'chatSearch')}" aria-label="${tr(ctx,'chatSearch')}"></label><p class="social-empty" data-chat-empty hidden>${tr(ctx,'empty')}</p><div class="social-room-list">${rooms.map(r=>`<div class="social-room-row"><a class="social-room" href="#chat/${r.room_id}"><span class="social-room-avatars">${(r.peers||[]).slice(0,2).map(p=>`<span class="social-avatar">${p.avatar_path?`<img src="${h(imageURL(ctx,p.avatar_path))}" alt="" loading="lazy">`:h(p.nickname?.slice(0,1)||'?')}</span>`).join('')}</span><strong>${h(r.room?.title||r.label||tr(ctx,'chats'))}</strong><span class="social-unread-count" data-room-unread="${h(r.room_id)}" hidden></span></a><button class="text-button" data-remove-chat="${r.room_id}" data-kind="${r.room?.kind||'dm'}">${tr(ctx,'remove')}</button></div>`).join('')||(!contacts.length?tr(ctx,'empty'):'')}</div>${contacts.map(p=>`<div class="social-friend">${person(ctx,p)}<button class="button soft" data-dm="${p.user_id}">${tr(ctx,'message')}</button></div>`).join('')}`;
    filterChats();paintUnread(box,unread,ctx.lang());void refreshUnread();
    });
   }
  }catch(e){if(life.live()&&own===version){if(!box.querySelector('.social-room-row,[data-dm]'))box.innerHTML='';status(root,ctx,e);}}
 }
 root.addEventListener('click',async event=>{const b=event.target.closest('button');if(!b)return;try{b.disabled=true;status(root,ctx);
  if(b.hasAttribute('data-login'))ctx.login();
  if(b.hasAttribute('data-cancel-group'))box.querySelector('[data-group-form]').innerHTML='';
  if(b.dataset.friendTab){friendTab=b.dataset.friendTab;await tab('friends');return;}
  if(b.dataset.tab)await tab(b.dataset.tab);
  if(b.dataset.friend&&member(ctx)){await db.friend(b.dataset.friend,b.dataset.do);document.dispatchEvent(new window.Event('yomiku:activity-change'));if(life.live())await tab('friends');}
  if(b.dataset.removeChat&&member(ctx)&&await ctx.confirm(tr(ctx,b.dataset.kind==='group'?'leaveGroupConfirm':'removeChatConfirm'))){await db.removeChat(b.dataset.removeChat);if(life.live()){document.dispatchEvent(new window.Event('yomiku:chat-read'));await tab('chats');}}
  if(b.dataset.dm&&member(ctx)){const room=await db.room([b.dataset.dm]);if(life.live())location.hash='chat/'+room;}
  if(b.hasAttribute('data-group')&&member(ctx)){
   const rows=(await db.friends()).filter(f=>f.status==='accepted');if(!life.live())return;
   const target=box.querySelector('[data-group-form]');target.innerHTML=`<form class="social-form"><label>${tr(ctx,'groupName')}<input name="title" maxlength="80" required></label><fieldset><legend>${tr(ctx,'friends')}</legend>${rows.map(f=>{const p=f.requester===ctx.user().id?f.to:f.from;return `<label class="social-check"><input name="members" type="checkbox" value="${p.user_id}">${h(p.nickname)}</label>`;}).join('')||tr(ctx,'empty')}</fieldset><p class="notice">${tr(ctx,'chooseFriends')}</p><button class="button primary" ${rows.length?'':'disabled'}>${tr(ctx,'group')}</button><button type="button" class="text-button" data-cancel-group>${tr(ctx,'cancel')}</button></form>`;
   target.querySelector('form').addEventListener('submit',async e=>{e.preventDefault();const submit=e.target.querySelector('button');submit.disabled=true;try{const users=[...e.target.querySelectorAll('input[name=members]:checked')].map(x=>x.value);if(!users.length){status(root,ctx,new Error('choose_friends'));return;}const room=await db.room(users,e.target.elements.title.value);if(life.live())location.hash='chat/'+room;}catch(err){if(life.live())status(root,ctx,err);}finally{submit.disabled=false;}},{signal:life.signal});
  }
 }catch(e){if(life.live())status(root,ctx,e);}finally{b.disabled=false;}},{signal:life.signal});
 tab(section);return ()=>{clearTimeout(unreadTimer);clearTimeout(searchTimer);++version;life.dispose();};
}
