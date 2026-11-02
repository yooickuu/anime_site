import {growInput} from './compose.js';
import {h,tr,scope,member,person,when,status,sendIcon,enterToSend} from './common.js';
import {api} from './api.js';
export function mount(root,ctx,key){
 const life=scope(root,ctx),db=api(ctx,life);let cursor=null,replyTo=null,editId=null,busy=false,more=true,generation=0,submitting=false;
 const rows=new Map(),replyCursors=new Map();let observer;
 root.innerHTML=`<section class="social-panel social-comments"><h2>${tr(ctx,'comments')}</h2><form data-comment-form><p data-reply-target></p><div class="social-input-row"><textarea name="body" maxlength="2000" rows="2" placeholder="${tr(ctx,'write')}" required aria-label="${tr(ctx,'write')}"></textarea><button class="social-send" data-send aria-label="${tr(ctx,'send')}" title="${tr(ctx,'send')}">${sendIcon}</button></div><div class="social-actions"><button class="button soft" type="button" data-cancel hidden>${tr(ctx,'cancel')}</button></div></form><div data-comments></div><button class="button soft" data-first hidden>↑</button><button class="button soft" data-more hidden>${tr(ctx,'more')}</button><p data-status role="status"></p></section>`;
 const list=root.querySelector('[data-comments]'),form=root.querySelector('form'),moreButton=root.querySelector('[data-more]');
 function row(c){if(c.deleted_at)return '';rows.set(c.id,c);return `<article class="social-comment" data-comment="${h(c.id)}">${c.author?person(ctx,c.author):''}<time>${h(when(ctx,c.created_at))}${c.edited_at?' · '+tr(ctx,'edited'):''}</time><p class="social-text">${h(c.body)}</p><div class="social-actions"><button class="text-button" data-reply="${h(c.parent_id||c.id)}" data-author="${h(c.author?.nickname)}">${tr(ctx,'reply')}</button>${ctx.user()?.id===c.author_id?`<button class="text-button" data-edit="${h(c.id)}">${tr(ctx,'edit')}</button><button class="text-button" data-remove="${h(c.id)}">${tr(ctx,'remove')}</button>`:''}${!c.parent_id?`<button class="text-button" data-replies="${h(c.id)}" aria-expanded="false">${tr(ctx,'replies')}</button>`:''}</div>${!c.parent_id?'<div class="social-replies" hidden></div>':''}</article>`;}
 async function load(reset=false){if(busy&&!reset||!more&&!reset)return;const own=reset?++generation:generation;busy=true;moreButton.disabled=true;
  try{const items=await db.comments(key,null,reset?null:cursor);if(!life.live()||own!==generation)return;
   if(reset){cursor=null;rows.clear();replyCursors.clear();list.innerHTML='';more=true;}
   if(!list.querySelector('article'))list.innerHTML='';
   list.insertAdjacentHTML('beforeend',items.filter(c=>!rows.has(c.id)).map(row).join(''));cursor=items.at(-1)||cursor;more=items.length===10;
   // Keep the DOM bounded even during a long scrolling session.
   while(list.children.length>100){const old=list.firstElementChild;for(const el of [old,...old.querySelectorAll('[data-comment]')]){rows.delete(el.dataset.comment);replyCursors.delete(el.dataset.comment);}old.remove();root.querySelector('[data-first]').hidden=false;}
   moreButton.hidden=!more;if(!list.children.length)list.innerHTML=`<p class="social-empty">${tr(ctx,'commentEmpty')}</p>`;
  }catch(e){if(life.live()&&own===generation){status(root,ctx,e);observer?.disconnect();moreButton.hidden=false;}}finally{if(own===generation){busy=false;moreButton.disabled=false;}}
 }
 const resize=growInput(form.elements.body,life.signal);
 function resetForm(){replyTo=null;editId=null;form.reset();resize();root.querySelector('[data-reply-target]').textContent='';root.querySelector('[data-cancel]').hidden=true;}
 root.addEventListener('click',async event=>{const b=event.target.closest('button');if(!b||submitting)return;try{status(root,ctx);b.disabled=true;
  if(b.hasAttribute('data-more'))await load();
  if(b.hasAttribute('data-first')){b.hidden=true;await load(true);}
  if(b.dataset.replies||b.dataset.replyMore){
   const id=b.dataset.replies||b.dataset.replyMore,article=b.closest('[data-comment]'),box=article.querySelector('.social-replies'),toggle=article.querySelector('[data-replies]');
   if(b.dataset.replies&&box.dataset.loaded){box.hidden=!box.hidden;toggle.setAttribute('aria-expanded',String(!box.hidden));toggle.textContent=tr(ctx,box.hidden?'replies':'hideReplies');}
   else{const own=generation,items=await db.comments(key,id,replyCursors.get(id));if(!life.live()||own!==generation||!b.isConnected)return;
    box.querySelector('[data-reply-more]')?.remove();box.querySelector('.social-empty')?.remove();
    box.insertAdjacentHTML('beforeend',items.filter(c=>!rows.has(c.id)).map(row).join(''));replyCursors.set(id,items.at(-1)||replyCursors.get(id));
    while(box.querySelectorAll(':scope > [data-comment]').length>50){rows.delete(box.firstElementChild.dataset.comment);box.firstElementChild.remove();}
    box.dataset.loaded='true';box.hidden=false;toggle.setAttribute('aria-expanded','true');toggle.textContent=tr(ctx,'hideReplies');
    if(items.length===10)box.insertAdjacentHTML('beforeend',`<button class="text-button" data-reply-more="${h(id)}">${tr(ctx,'more')}</button>`);
    if(!box.children.length)box.innerHTML=`<p class="social-empty">${tr(ctx,'empty')}</p>`;
   }
  }
  if(b.dataset.reply&&member(ctx)){replyTo=b.dataset.reply;editId=null;root.querySelector('[data-reply-target]').textContent=tr(ctx,'reply')+': '+b.dataset.author;root.querySelector('[data-cancel]').hidden=false;form.elements.body.focus();}
  if(b.dataset.edit&&member(ctx)){editId=b.dataset.edit;replyTo=null;form.elements.body.value=rows.get(editId).body;resize();root.querySelector('[data-reply-target]').textContent=tr(ctx,'edit');root.querySelector('[data-cancel]').hidden=false;form.elements.body.focus();}
  if(b.dataset.remove&&member(ctx)&&await ctx.confirm(tr(ctx,'deleteConfirm'))){await db.edit(b.dataset.remove,null);if(life.live()){const article=b.closest('[data-comment]');for(const el of [article,...article.querySelectorAll('[data-comment]')]){rows.delete(el.dataset.comment);replyCursors.delete(el.dataset.comment);}article.remove();resetForm();if(!list.children.length)await load(true);}}
  if(b.hasAttribute('data-cancel'))resetForm();
 }catch(e){if(life.live())status(root,ctx,e);}finally{b.disabled=false;}},{signal:life.signal});
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(submitting||!member(ctx)||!form.elements.body.value.trim())return;
  submitting=true;const submit=form.querySelector('[data-send]'),body=form.elements.body.value,editing=editId,parent=replyTo;
  submit.disabled=true;form.elements.body.disabled=true;status(root,ctx);
  try{
   const id=editing?(await db.edit(editing,body),editing):await db.comment(key,body,parent);
   if(!life.live())return;
   // Read only the confirmed record; do not reload page 1 and hide a new comment behind older pages.
   let saved;try{saved=await db.commentRecord(id);}catch{}
   if(!life.live())return;
   if(saved?.id&&!saved.deleted_at){
    const old=[...root.querySelectorAll('[data-comment]')].find(n=>n.dataset.comment===saved.id);
    const template=document.createElement('template');template.innerHTML=row(saved);const node=template.content.firstElementChild;
    if(old){const replies=old.querySelector('.social-replies');if(replies){node.querySelector('.social-replies')?.replaceWith(replies);const toggle=node.querySelector('[data-replies]');toggle?.setAttribute('aria-expanded',String(!replies.hidden));if(toggle)toggle.textContent=tr(ctx,replies.hidden?'replies':'hideReplies');}old.replaceWith(node);}
    else if(saved.parent_id){const article=[...list.querySelectorAll('[data-comment]')].find(n=>n.dataset.comment===saved.parent_id),box=article?.querySelector('.social-replies');if(box){box.querySelector('.social-empty')?.remove();box.append(node);box.hidden=false;const toggle=article.querySelector('[data-replies]');toggle.textContent=tr(ctx,'hideReplies');toggle.setAttribute('aria-expanded','true');}}
    else{list.querySelector(':scope > .social-empty')?.remove();list.prepend(node);}
    node.classList.add('is-new');
   }else await load(true);
   resetForm();
  }catch(e){if(life.live())status(root,ctx,e);}finally{submitting=false;submit.disabled=false;form.elements.body.disabled=false;}
 },{signal:life.signal});
 if(!ctx.user())form.elements.body.addEventListener('focus',()=>member(ctx),{once:true,signal:life.signal});
 enterToSend(form,form.elements.body,life.signal);
 if(globalThis.IntersectionObserver){observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)&&more&&!busy)void load();},{rootMargin:'100px'});observer.observe(moreButton);}
 void load();return ()=>{generation++;observer?.disconnect();life.dispose();rows.clear();replyCursors.clear();};
}
