import {h,tr,scope,member,person,when,status,sendIcon,enterToSend} from './common.js';
import {api} from './api.js';
export function mount(root,ctx,key){
 const life=scope(root,ctx),db=api(ctx,life);let offset=0,replyTo=null,editId=null,rows=new Map();
 root.innerHTML=`<section class="social-panel social-comments"><h2>${tr(ctx,'comments')}</h2><div data-comments></div><button class="button soft" data-first hidden>↑</button><button class="button soft" data-more>${tr(ctx,'more')}</button><form data-comment-form><p data-reply-target></p><div class="social-input-row"><textarea name="body" maxlength="2000" rows="2" placeholder="${tr(ctx,'write')}" required aria-label="${tr(ctx,'write')}"></textarea><button class="social-send" data-send aria-label="${tr(ctx,'send')}" title="${tr(ctx,'send')}">${sendIcon}</button></div><div class="social-actions"><button class="button soft" type="button" data-cancel hidden>${tr(ctx,'cancel')}</button></div></form><p data-status role="status"></p></section>`;
 const list=root.querySelector('[data-comments]'),form=root.querySelector('form');
 function row(c){rows.set(c.id,c);while(rows.size>420)rows.delete(rows.keys().next().value);return `<article class="social-comment" data-comment="${h(c.id)}">${c.author?person(ctx,c.author):''}<time>${h(when(ctx,c.created_at))}${c.edited_at?' · '+tr(ctx,'edit'):''}</time><p class="social-text">${h(c.deleted_at?tr(ctx,'deleted'):c.body)}</p><div class="social-actions">${!c.deleted_at?`<button class="text-button" data-reply="${h(c.parent_id||c.id)}" data-author="${h(c.author?.nickname)}">${tr(ctx,'reply')}</button>`:''}${!c.deleted_at&&ctx.user()?.id===c.author_id?`<button class="text-button" data-edit="${h(c.id)}">${tr(ctx,'edit')}</button><button class="text-button" data-remove="${h(c.id)}">${tr(ctx,'remove')}</button>`:''}${!c.parent_id?`<button class="text-button" data-replies="${h(c.id)}" data-offset="0">${tr(ctx,'replies')}</button>`:''}</div>${!c.parent_id?'<div class="social-replies"></div>':''}</article>`;}
 async function load(reset=false){try{const items=await db.comments(key,null,reset?0:offset);if(!life.live())return;if(reset)offset=0;rows.clear();list.innerHTML='';root.querySelector('[data-first]').hidden=offset===0;list.insertAdjacentHTML('beforeend',items.map(row).join(''));offset+=items.length;root.querySelector('[data-more]').hidden=items.length<20;if(!offset)list.textContent=tr(ctx,'empty');}catch(e){if(life.live())status(root,ctx,e);}}
 function reset(){replyTo=null;editId=null;form.reset();root.querySelector('[data-reply-target]').textContent='';root.querySelector('[data-cancel]').hidden=true;}
 root.addEventListener('click',async event=>{const b=event.target.closest('button');if(!b)return;
  try{status(root,ctx);b.disabled=true;
   if(b.hasAttribute('data-more'))await load();
   if(b.hasAttribute('data-first'))await load(true);
   if(b.dataset.replies){const items=await db.comments(key,b.dataset.replies,Number(b.dataset.offset));if(!life.live())return;b.closest('article').querySelector('.social-replies').innerHTML=items.map(row).join('');b.dataset.offset=String(Number(b.dataset.offset)+items.length);b.hidden=items.length<20;}
   if(b.dataset.reply&&member(ctx)){replyTo=b.dataset.reply;editId=null;root.querySelector('[data-reply-target]').textContent=tr(ctx,'reply')+': '+b.dataset.author;root.querySelector('[data-cancel]').hidden=false;form.elements.body.focus();}
   if(b.dataset.edit&&member(ctx)){editId=b.dataset.edit;replyTo=null;form.elements.body.value=rows.get(editId).body;root.querySelector('[data-cancel]').hidden=false;form.elements.body.focus();}
   if(b.dataset.remove&&member(ctx)&&await ctx.confirm(tr(ctx,'deleteConfirm'))){await db.edit(b.dataset.remove,null);if(life.live()){reset();await load(true);}}
   if(b.hasAttribute('data-cancel'))reset();
  }catch(e){if(life.live())status(root,ctx,e);}finally{b.disabled=false;}
 },{signal:life.signal});
 form.addEventListener('submit',async event=>{event.preventDefault();if(!member(ctx))return;const submit=form.querySelector('button');submit.disabled=true;try{if(editId)await db.edit(editId,form.elements.body.value);else await db.comment(key,form.elements.body.value,replyTo);if(life.live()){reset();await load(true);}}catch(e){if(life.live())status(root,ctx,e);}finally{submit.disabled=false;}},{signal:life.signal});
 if(!ctx.user())form.elements.body.addEventListener('focus',()=>member(ctx),{once:true,signal:life.signal});
 enterToSend(form,form.elements.body,life.signal);
 load();return life.dispose;
}
