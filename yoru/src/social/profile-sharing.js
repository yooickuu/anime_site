import {h,scope,status} from './common.js';
import {clearCache} from './cache.js';
const labels={lists:['Мои списки','My lists','マイリスト'],badges:['Достижения','Achievements','実績'],title:['В публичном профиле','On your public profile','公開プロフィール'],visible:['Видно всем','Public','公開'],hidden:['Скрыто','Hidden','非公開'],show:['Показать','Show','公開する'],hide:['Скрыть','Hide','非公開にする']};
const text=(ctx,key)=>labels[key][({ru:0,en:1,ja:2})[ctx.lang()]??0];
export async function mount(root,ctx){
 const life=scope(root,ctx),uid=ctx.user()?.id,key=root.dataset.sectionVisibility;
 if(!uid||!['lists','badges','history'].includes(key)||root.dataset.sharingOwner===uid)return;
 root.dataset.sharingOwner=uid;root.innerHTML='<button class="text-button section-visibility-toggle" type="button" disabled>…</button><small data-status role="status"></small>';
 const button=root.querySelector('button');let visible;
 const paint=()=>{button.textContent=text(ctx,visible?'hide':'show');button.setAttribute('aria-pressed',String(visible));button.disabled=false;};
 async function read(){try{const {data,error}=await ctx.client.from('yoru_public_profiles').select('lists_public,badges_public,history_public').eq('user_id',uid).maybeSingle();if(error)throw error;if(!life.live())return;visible=data?.[key+'_public']!==false;paint();}catch(e){if(life.live()){button.textContent=({ru:'Повторить',en:'Retry',ja:'再試行'})[ctx.lang()];button.disabled=false;status(root,ctx,e);}}}
 button.addEventListener('click',async()=>{if(!life.live())return;if(visible===undefined){button.disabled=true;void read();return;}button.disabled=true;try{const next=!visible,{error}=await ctx.client.rpc('yoru_social_visibility',{p_kind:key,p_visible:next});if(error)throw error;if(life.live()){visible=next;clearCache(ctx.client);paint();status(root,ctx);}}catch(e){if(life.live()){status(root,ctx,e);button.disabled=false;}}},{signal:life.signal});
 await read();
}
const listLabels={all:['Все','All','すべて'],favorites:['Любимые','Favorites','お気に入り'],watching:['Смотрю','Watching','視聴中'],planned:['Запланировано','Planned','視聴予定'],dropped:['Брошено','Dropped','中断'],completed:['Просмотрено','Completed','視聴済み'],ongoing:['Онгоинг','Ongoing','放送中']};
export async function publicSections(root,ctx,id,live){
 let selected='all',offset=0,loading=false,version=0,total=0,items=[];
 const t=(key,fallback)=>listLabels[key]?.[({ru:0,en:1,ja:2})[ctx.lang()]??0]||fallback||key;
 const box=root.querySelector('[data-public-lists]'),badgeBox=root.querySelector('[data-public-badges]');
 async function load(reset=false){if(loading||!live())return;loading=true;const request=++version;try{const {data,error}=await ctx.client.rpc('yoru_social_public_lists',{p_user:id,p_list:selected,p_offset:reset?0:offset});if(error)throw error;if(!live()||request!==version)return;
  if(!data.visible){box.innerHTML=`<p class="notice">${text(ctx,'hidden')}</p>`;return;}
  if(reset){offset=0;items=[];}items.push(...data.items);offset+=data.items.length;total=data.total;
  const options=[{id:'all'},{id:'favorites'},...(data.statuses||[])].filter((s,i,a)=>s.id&&a.findIndex(x=>x.id===s.id)===i);
  box.innerHTML=`<div class="public-list-tabs">${options.map(s=>`<button class="button soft" data-public-list="${h(s.id)}" aria-pressed="${s.id===selected}">${h(t(s.key||s.id,s.name))}</button>`).join('')}</div><p class="public-list-count">${items.length} / ${total}</p><div class="public-list-grid">${items.map(r=>`<button class="social-history-card" data-anime="${h(r.anime_id)}"><span data-card-art></span><strong data-card-title>${h(r.anime_id)}</strong></button>`).join('')}</div>${offset<total?`<button class="button soft" data-public-more>${({ru:'Ещё',en:'More',ja:'もっと見る'})[ctx.lang()]}</button>`:''}`;
  let cursor=0;const ownItems=[...items];void Promise.all(Array.from({length:Math.min(4,items.length)},async()=>{while(live()&&request===version&&cursor<ownItems.length){const r=ownItems[cursor++];try{const a=await ctx.card(r.anime_id);if(a&&live()&&request===version){const el=box.querySelector(`[data-anime="${r.anime_id}"]`);if(el){el.querySelector('[data-card-title]').textContent=ctx.title(a);el.querySelector('[data-card-art]').innerHTML=`<img src="${h(ctx.cover(a))}" alt="" loading="lazy" decoding="async">`;}}}catch{}}}));
 }catch{if(live())box.innerHTML=`<p class="notice">${({ru:'Не удалось загрузить списки',en:'Could not load lists',ja:'リストを読み込めません'})[ctx.lang()]}</p>`;}finally{loading=false;}}
 box.addEventListener('click',e=>{const tab=e.target.closest('[data-public-list]');if(tab&&!loading){selected=tab.dataset.publicList;void load(true);}else if(e.target.closest('[data-public-more]'))void load();});
 await Promise.all([load(true),(async()=>{try{const {data,error}=await ctx.client.rpc('yoru_social_public_badges',{p_user:id});if(error)throw error;if(!live())return;if(!data.visible){badgeBox.textContent=text(ctx,'hidden');return;}const {badges,text:badgeText}=await import('../activity/badges.js');if(!live())return;const unlocked=badges.filter(b=>data.badges?.[b[0]]);badgeBox.innerHTML=`<div class="public-badge-grid">${unlocked.map(([, ,names,description])=>`<article class="public-badge"><strong>${h(badgeText(names,ctx.lang()))}</strong><small>${h(badgeText(description,ctx.lang()))}</small></article>`).join('')}</div>${unlocked.length?'':`<p class="notice">${({ru:'Пока нет достижений',en:'No achievements yet',ja:'まだ実績がありません'})[ctx.lang()]}</p>`}`;}catch{if(live())badgeBox.textContent=({ru:'Не удалось загрузить достижения',en:'Could not load achievements',ja:'実績を読み込めません'})[ctx.lang()];}})()]);
}
