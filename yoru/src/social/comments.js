import {h,tr,scope,member,person,when,status,sendIcon,enterToSend} from './common.js';
import {api} from './api.js';
export function mount(root,ctx,key){
 const life=scope(root,ctx),db=api(ctx,life);let cursor=null,replyTo=null,editId=null,busy=false,more=true,generation=0;
 const rows=new Map(),replyCursors=new Map();let observer;
 root.innerHTML=`<section class="social-panel social-comments"><h2>${tr(ctx,'comments')}</h2><div data-comments></div><button class="button soft" data-first hidden>↑</button><button class="button soft" data-more hidden>${tr(ctx,'more')}</button><form data-comment-form><p data-reply-target></p><div class="social-input-row"><textarea name="body" maxlength="2000" rows="2" placeholder="${tr(ctx,'write')}" required aria-label="${tr(ctx,'write')}"></textarea><button class="social-send" data-send aria-label="${tr(ctx,'send')}" title="${tr(ctx,'send')}">${sendIcon}</button></div><div class="social-actions"><button class="button soft" type="button" data-cancel hidden>${tr(ctx,'cancel')}</button></div></form><p data-status role="status"></p></section>`;
 const list=root.querySelector('[data-comments]'),form=root.querySelector('form'),moreButton=root.querySelector('[data-more]');
 function row(c){if(c.deleted_at)return '';rows.set(c.id,c);return `<article class="social-comment" data-comment="${h(c.id)}">${c.author?person(ctx,c.author):''}<time>${h(when(ctx,c.created_at))}${c.edited_at?' · '+tr(ctx,'edit'):''}</time><p class="social-text">${h(c.body)}</p><div class="social-actions"><button class="text-button" data-reply="${h(c.parent_id||c.id)}" data-author="${h(c.author?.nickname)}">${tr(ctx,'reply')}</button>${ctx.user()?.id===c.author_id?`<button class="text-button" data-edit="${h(c.id)}">${tr(ctx,'edit')}</button><button class="text-button" data-remove="${h(c.id)}">${tr(ctx,'remove')}</button>`:''}${!c.parent_id?`<button class="text-button" data-replies="${h(c.id)}">${tr(ctx,'replies')}</button>`:''}</div>${!c.parent_id?'<div class="social-replies"></div>':''}</article>`;}
 async function load(reset=false){if(busy&&!reset||!more&&!reset)return;const own=reset?++generation:generation;busy=true;moreButton.disabled=true;
  try{const items=await db.comments(key,null,reset?null:cursor);if(!life.live()||own!==generation)return;
   if(reset){cursor=null;rows.clear();replyCursors.clear();list.innerHTML='';more=true;}
   if(!list.querySelector('article'))list.innerHTML='';
   list.insertAdjacentHTML('beforeend',items.filter(c=>!rows.has(c.id)).map(row).join(''));cursor=items.at(-1)||cursor;more=items.length===10;
   // Keep the DOM bounded even during a long scrolling session.
   while(list.children.length>100){const old=list.firstElementChild;for(const el of [old,...old.querySelectorAll('[data-comment]')]){rows.delete(el.dataset.comment);replyCursors.delete(el.dataset.comment);}old.remove();root.querySelector('[data-first]').hidden=false;}
   moreButton.hidden=!more;if(!list.children.length)list.textContent=tr(ctx,'empty');
  }catch(e){if(life.live()&&own===generation){status(root,ctx,e);observer?.disconnect();moreButton.hidden=false;}}finally{if(own===generation){busy=false;moreButton.disabled=false;}}
 }
 function resetForm(){replyTo=null;editId=null;form.reset();root.querySelector('[data-reply-target]').textContent='';root.querySelector('[data-cancel]').hidden=true;}
 root.addEventListener('click',async event=>{const b=event.target.closest('button');if(!b)return;try{status(root,ctx);b.disabled=true;
  if(b.hasAttribute('data-more'))await load();
  if(b.hasAttribute('data-first')){b.hidden=true;await load(true);}
  if(b.dataset.replies){const id=b.dataset.replies,own=generation,items=await db.comments(key,id,replyCursors.get(id));if(!life.live()||own!==generation||!b.isConnected)return;const box=b.closest('article').querySelector('.social-replies');box.insertAdjacentHTML('beforeend',items.filter(c=>!rows.has(c.id)).map(row).join(''));replyCursors.set(id,items.at(-1)||replyCursors.get(id));while(box.children.length>50){rows.delete(box.firstElementChild.dataset.comment);box.firstElementChild.remove();}b.hidden=items.length<10;}
  if(b.dataset.reply&&member(ctx)){replyTo=b.dataset.reply;editId=null;root.querySelector('[data-reply-target]').textContent=tr(ctx,'reply')+': '+b.dataset.author;root.querySelector('[data-cancel]').hidden=false;form.elements.body.focus();}
  if(b.dataset.edit&&member(ctx)){editId=b.dataset.edit;replyTo=null;form.elements.body.value=rows.get(editId).body;root.querySelector('[data-cancel]').hidden=false;form.elements.body.focus();}
  if(b.dataset.remove&&member(ctx)&&await ctx.confirm(tr(ctx,'deleteConfirm'))){await db.edit(b.dataset.remove,null);if(life.live()){const article=b.closest('[data-comment]');for(const el of [article,...article.querySelectorAll('[data-comment]')]){rows.delete(el.dataset.comment);replyCursors.delete(el.dataset.comment);}article.remove();resetForm();if(!list.children.length)await load(true);}}
  if(b.hasAttribute('data-cancel'))resetForm();
 }catch(e){if(life.live())status(root,ctx,e);}finally{b.disabled=false;}},{signal:life.signal});
 form.addEventListener('submit',async event=>{event.preventDefault();if(!member(ctx))return;const submit=form.querySelector('[data-send]');submit.disabled=true;try{if(editId)await db.edit(editId,form.elements.body.value);else await db.comment(key,form.elements.body.value,replyTo);if(life.live()){resetForm();await load(true);}}catch(e){if(life.live())status(root,ctx,e);}finally{submit.disabled=false;}},{signal:life.signal});
 if(!ctx.user())form.elements.body.addEventListener('focus',()=>member(ctx),{once:true,signal:life.signal});
 enterToSend(form,form.elements.body,life.signal);
 if(globalThis.IntersectionObserver){observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)&&more&&!busy)void load();},{rootMargin:'100px'});observer.observe(moreButton);}
 void load();return ()=>{generation++;observer?.disconnect();life.dispose();rows.clear();replyCursors.clear();};
}
