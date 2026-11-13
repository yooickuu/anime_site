import {placeRoomPanel} from './layout.js';
import {validState,syncVideo} from './sync.js';
import './style.css';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const words={title:['Смотрим вместе','Watch together','一緒に見る'],host:['Вы — хост','You are the host','あなたがホスト'],guest:['Управляет хост','Host controls playback','ホストが操作します'],copy:['Скопировать ссылку','Copy invite link','招待リンクをコピー'],copied:['Ссылка скопирована','Link copied','リンクをコピーしました'],leave:['Выйти','Leave','退出'],close:['Завершить комнату','End room','ルームを終了'],chat:['Чат комнаты','Room chat','ルームチャット'],send:['Отправить','Send','送信'],placeholder:['Сообщение…','Message…','メッセージ…'],connecting:['Подключаемся…','Connecting…','接続中…'],connected:['Вместе','Connected','接続済み'],offline:['Переподключаемся…','Reconnecting…','再接続中…'],unavailable:['Комната недоступна или уже закрыта.','This room is unavailable or closed.','ルームが閉じられたか利用できません。'],error:['Не удалось подключиться. Попробуйте ещё раз.','Connection failed. Please retry.','接続できません。再試行してください。'],retry:['Повторить','Retry','再試行'],start:['Включить совместный просмотр','Enable synchronized playback','同期再生を開始'],failed:['Не отправлено · повторить','Not sent · retry','未送信・再試行'],empty:['Пригласите друга по ссылке','Invite a friend with the link','リンクで友達を招待'],room_full:['В комнате уже 12 участников.','The room already has 12 members.','定員の12人に達しました。'],too_many_rooms:['Сначала завершите предыдущую комнату.','Close a previous room first.','前のルームを終了してください。']};
function stylesheet(){if(document.querySelector('[data-together-css]'))return;const l=document.createElement('link');l.rel='stylesheet';l.dataset.togetherCss='';const u=new URL('./entry.css',import.meta.url);u.search=new URL(import.meta.url).search;l.href=u.href;document.head.append(l);}
export function start(ctx,initialRoom=null){
 stylesheet();const owner=ctx.user()?.id,life=new AbortController();let alive=true,room,channel,connected=false,host=false,latest,root,video,videoLife,applying=false,blocked=false,offset=0,lastRevision=-1,lastReceive=0,sendTimer,persisting=false,pendingState,messageLoad,rows=[],chatOpen=false,unread=0,joining=false,polling=false,channelGeneration=0,bootError='';
 const lang=()=>({ru:0,en:1,ja:2})[ctx.lang()]??0,w=key=>(words[key]||words.error)[lang()],live=()=>alive&&ctx.user()?.id===owner;
 async function rpc(name,args={}){const {data,error}=await ctx.client.rpc('yoru_watch_'+name,args).abortSignal(life.signal);if(error)throw error;return data;}
 function calibrate(data,start){if(data?.server_now)offset=Date.parse(data.server_now)-(start+Date.now())/2;}
 function showStatus(value){if(root)root.querySelector('[data-room-status]').textContent=value;}
 function paint(){const mount=document.querySelector('#watch-together');if(!mount||!live())return;
  if(root===mount&&root.dataset.roomReady===String(!!room))return;
  root=mount;placeRoomPanel(mount,!!room);root.dataset.roomReady=String(!!room);root.innerHTML=`<section class="together-panel"><div class="together-bar"><strong>${w('title')}</strong><span data-room-status role="status">${bootError||w('connecting')}</span>${room?`<button class="button soft" data-room-copy>${w('copy')}</button><button class="button soft" data-room-chat aria-expanded="${chatOpen}">${w('chat')} <span data-room-unread></span></button><button class="text-button" data-room-leave>${w(host?'close':'leave')}</button>`:`<button class="text-button" data-room-retry ${bootError?'':'hidden'}>${w('retry')}</button><button class="text-button" data-room-leave>${w('leave')}</button>`}</div>${room?`<button class="button primary together-unlock" data-room-play ${blocked?'':'hidden'}>${w('start')}</button><div class="together-chat" ${chatOpen?'':'hidden'}><div class="together-messages" role="log" aria-label="${w('chat')}"></div><form class="together-compose"><input name="body" maxlength="500" autocomplete="off" placeholder="${w('placeholder')}" aria-label="${w('placeholder')}" required><button class="icon-button" type="submit" aria-label="${w('send')}">➤</button></form><p class="together-chat-status" role="status"></p></div>`:''}</section>`;
  renderMessages();
 }
 function renderMessages(){if(!root)return;const box=root.querySelector('.together-messages');if(!box)return;const bottom=box.scrollHeight-box.scrollTop-box.clientHeight<70;
  box.innerHTML=rows.slice(-50).map(m=>`<div class="together-message ${m.author_id===owner?'is-own':''}"><small>${escape(m.nickname||'')}</small><p>${escape(m.body)}</p>${m.failed?`<button class="text-button" data-room-resend="${escape(m.id)}">${w('failed')}</button>`:`<time>${new Date(m.created_at).toLocaleTimeString(ctx.lang(),{hour:'2-digit',minute:'2-digit'})}</time>`}</div>`).join('')||`<p class="together-empty">${w('empty')}</p>`;
  if(bottom)box.scrollTop=box.scrollHeight;
  const badge=root.querySelector('[data-room-unread]');if(badge)badge.textContent=unread?String(unread):'';
 }
 async function messages(){if(messageLoad||!room||!live())return;messageLoad=(async()=>{try{const next=await rpc('messages',{p_room:room.id});if(!live())return;const known=new Set(rows.map(m=>m.id));if(!chatOpen)unread+=next.filter(m=>!known.has(m.id)&&m.author_id!==owner).length;rows=[...next,...rows.filter(m=>m.pending&&!next.some(n=>n.id===m.id))].slice(-50);renderMessages();}catch{/* The next broadcast/poll retries. */}})().finally(()=>messageLoad=null);return messageLoad;}
 async function sendMessage(m){if(!live()||!room)return;m.failed=false;renderMessages();try{const sent=await rpc('message',{p_room:room.id,p_body:m.body,p_id:m.id});if(!live())return;rows=rows.map(r=>r.id===m.id?sent:r);renderMessages();document.dispatchEvent(new window.Event('yomiku:activity-change'));}catch{if(live()){m.failed=true;renderMessages();}}}
 async function persist(){if(persisting||!pendingState||!live()||!room)return;persisting=true;const s=pendingState;pendingState=null;
  try{await rpc('state',{p_room:room.id,p_anime:s.anime_id,p_episode:s.episode,p_position:s.position,p_playing:s.playing,p_speed:s.speed,p_revision:s.revision});}
  catch(e){if(live()&&/host_only|room_unavailable/.test(e.message||''))end(w('unavailable'));}
  finally{persisting=false;if(pendingState&&live())void persist();}
 }
 function publish(){if(!live()||!host||!room)return;const m=ctx.media(),v=m.video;if(!m.ready||!v||v.readyState<2||v.seeking)return;
  const s={anime_id:m.anime,episode:m.episode,position:v.currentTime,playing:!v.paused&&!v.ended&&v.readyState>=3,speed:v.playbackRate,revision:Math.max(lastRevision+1,Date.now()),sent_at:new Date(Date.now()+offset).toISOString()};if(!validState(s))return;lastRevision=s.revision;
  if(connected)void channel.send({type:'broadcast',event:'state',payload:s}).catch(()=>{});
  pendingState=s;void persist();
 }
 function queuePublish(){clearTimeout(sendTimer);sendTimer=setTimeout(publish,80);}
 async function apply(){if(!live()||host||!latest||applying||blocked||document.hidden)return;applying=true;
  try{let m=ctx.media();const target=latest;if(m.anime!==target.anime_id||m.episode!==target.episode){await ctx.open(target.anime_id,target.episode);if(!live())return;m=ctx.media();}
   if(m.anime!==latest.anime_id||m.episode!==latest.episode||!m.ready)return;
   // Do not run ahead indefinitely if the host lost connection or their tab was suspended.
   const s=Date.now()-lastReceive>12000?{...latest,playing:false}:latest;
   await syncVideo(m.video,s,{now:Date.now()+offset,allowPlay:!blocked,onBlocked:()=>{blocked=true;root?.querySelector('[data-room-play]')?.removeAttribute('hidden');}});
  }catch{if(live())showStatus(w('error'));}finally{applying=false;}
 }
 function receive(s){if(!live()||host||!validState(s)||s.revision<=lastRevision)return;lastRevision=s.revision;latest=s;lastReceive=Date.now();void apply();}
 function attach(){if(!live())return;paint();const m=ctx.media();if(m.video!==video){videoLife?.abort();video=m.video;videoLife=new AbortController();if(video)for(const event of ['play','pause','seeked','ratechange','playing','waiting','loadedmetadata'])video.addEventListener(event,()=>{if(host)queuePublish();else void apply();},{signal:videoLife.signal});}
  for(const selector of ['#season-picker','#episode-picker','#previous-episode','#next-episode']){const el=document.querySelector(selector);if(el){if(room&&!host){el.dataset.roomDisabled='';el.disabled=true;const trigger=el.closest('.site-select')?.querySelector('.select-trigger');if(trigger){trigger.dataset.roomDisabled='';trigger.disabled=true;}}else if(el.hasAttribute('data-room-disabled')){delete el.dataset.roomDisabled;el.disabled=false;}}}
 }
 function connect(){if(!live()||!room||document.hidden)return;const generation=++channelGeneration;const old=channel;if(old)void ctx.client.removeChannel(old);connected=false;
  channel=ctx.client.channel('yomiku:watch:'+room.id,{config:{private:true,broadcast:{ack:true},presence:{key:owner}}})
   .on('broadcast',{event:'state'},({payload})=>receive(payload))
   .on('broadcast',{event:'chat'},()=>{void messages();})
   .on('broadcast',{event:'closed'},()=>end(w('unavailable')))
   .on('presence',{event:'sync'},()=>{if(!live())return;const n=Object.keys(channel.presenceState()).length;showStatus(connected?w('connected')+' · '+n:w('offline'));if(host)queuePublish();})
   .subscribe(status=>{if(!live()||generation!==channelGeneration)return;connected=status==='SUBSCRIBED';showStatus(w(connected?'connected':'offline'));if(connected){void channel.track({user_id:owner}).catch(()=>{});if(host)publish();else void snapshot();void messages();}});
 }
 async function snapshot(){if(!room||!live()||polling)return;polling=true;try{const start=Date.now(),s=await rpc('snapshot',{p_room:room.id});if(!live())return;calibrate(s,start);receive(s);}catch(e){if(live()&&/room_unavailable/.test(e.message||''))end(w('unavailable'));else showStatus(w('offline'));}finally{polling=false;}}
 async function boot(){if(joining||!live())return;joining=true;bootError='';paint();try{const m=ctx.media(),start=Date.now();const next=initialRoom?await rpc('join',{p_room:initialRoom}):await rpc('create',{p_anime:m.anime,p_episode:m.episode});
  if(!live())return;room=next;document.dispatchEvent(new window.Event('yomiku:activity-change'));host=room.host_id===owner;calibrate(next,start);lastRevision=-1;ctx.room(room.id);paint();attach();if(!host)receive(next);else lastRevision=Number(next.revision)||0;connect();void messages();
 }catch(e){if(!live())return;bootError=/room_unavailable/.test(e.message||'')?w('unavailable'):words[e.message]?w(e.message):w('error');root=null;paint();}finally{joining=false;}}
 function end(message){if(!live())return;ctx.notify(message);dispose();ctx.ended();}
 function dispose(){if(!alive)return;if(room&&ctx.user()?.id===owner)void ctx.client.rpc('yoru_watch_leave',{p_room:room.id}).then(()=>{}).catch(()=>{});alive=false;life.abort();videoLife?.abort();clearTimeout(sendTimer);clearInterval(pulse);clearInterval(poll);++channelGeneration;const old=channel;channel=null;if(old)void ctx.client.removeChannel(old);for(const el of document.querySelectorAll('[data-room-disabled]')){delete el.dataset.roomDisabled;el.disabled=false;}if(root){root.innerHTML='';delete root.dataset.roomReady;placeRoomPanel(root,false);}ctx.room(null);}
 document.addEventListener('visibilitychange',()=>{if(!live())return;if(document.hidden){connected=false;++channelGeneration;const old=channel;channel=null;if(old)void ctx.client.removeChannel(old);}else{connect();void snapshot();}},{signal:life.signal});
 document.addEventListener('click',async event=>{const b=event.target.closest('button');if(!b||!root?.contains(b)||!live())return;
  if(b.hasAttribute('data-room-retry')){root=null;void boot();}
  if(b.hasAttribute('data-room-copy')){try{const url=new URL(location.href);url.searchParams.set('room',room.id);await navigator.clipboard.writeText(url.href);ctx.notify(w('copied'));}catch{const input=document.createElement('input');input.value=location.href;input.readOnly=true;input.setAttribute('aria-label',w('copy'));root.append(input);input.select();}}
  if(b.hasAttribute('data-room-chat')){chatOpen=!chatOpen;unread=0;root.querySelector('.together-chat').hidden=!chatOpen;b.setAttribute('aria-expanded',String(chatOpen));renderMessages();if(chatOpen)root.querySelector('input')?.focus();}
  if(b.hasAttribute('data-room-play')){blocked=false;b.hidden=true;try{await ctx.media().video?.play();}catch{blocked=true;b.hidden=false;}void apply();}
  if(b.dataset.roomResend){const m=rows.find(m=>m.id===b.dataset.roomResend);if(m)void sendMessage(m);}
  if(b.hasAttribute('data-room-leave')){b.disabled=true;if(room){try{await rpc('leave',{p_room:room.id});}catch{b.disabled=false;showStatus(w('error'));return;}}dispose();ctx.ended();}
 },{signal:life.signal});
 document.addEventListener('submit',event=>{const f=event.target;if(!root?.contains(f)||!f.matches('.together-compose')||!room||!live())return;event.preventDefault();const body=f.elements.body.value.trim();if(!body)return;const m={id:crypto.randomUUID(),author_id:owner,nickname:ctx.name(),body,created_at:new Date().toISOString(),pending:true};f.reset();rows.push(m);rows=rows.slice(-50);renderMessages();void sendMessage(m);},{signal:life.signal});
 const pulse=setInterval(()=>{attach();if(host)publish();else void apply();},2000);
 const poll=setInterval(()=>{if(!document.hidden&&live()){void snapshot();void messages();}},15000);
 void boot();return {attach,dispose,get guest(){return !!room&&!host;},get active(){return live();}};
}
export const validRoom=value=>uuid.test(value||'');
