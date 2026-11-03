// Private room-scoped channels. Broadcasts are invalidation hints, never trusted message bodies.
export function roomRealtime(ctx,room,{live,onMessage,onRead,onTyping,onReady},doc=document){
 let channel,closed=false,subscribed=false,typingTimer,expiryTimer,lastTyped=0,generation=0;
 const uid=ctx.user().id;
 const active=()=>!closed&&live()&&ctx.user()?.id===uid&&!doc.hidden;
 function presence(){if(!active())return;const now=Date.now(),people=new Set();for(const entries of Object.values(channel?.presenceState()||{}))for(const p of entries)if(p.user_id!==uid&&typeof p.user_id==='string'&&p.typing_until>now&&p.typing_until<now+10000)people.add(p.user_id);onTyping([...people]);}
 function connect(){if(!active()||channel||typeof ctx.client.channel!=='function')return;const own=++generation;
  channel=ctx.client.channel('yomiku:room:'+room,{config:{private:true,presence:{key:uid}}})
   .on('broadcast',{event:'message'},({payload})=>{if(active()&&/^[0-9a-f-]{36}$/i.test(payload?.id||''))onMessage(payload.id);})
   .on('broadcast',{event:'read'},()=>{if(active())onRead();})
   .on('presence',{event:'sync'},presence)
   .subscribe(status=>{if(own!==generation||!active())return;subscribed=status==='SUBSCRIBED';onReady(subscribed);if(subscribed){onRead();onMessage();}});
  expiryTimer=setInterval(presence,1500);
 }
 function disconnect(){++generation;subscribed=false;clearTimeout(typingTimer);clearInterval(expiryTimer);onTyping([]);const old=channel;channel=null;if(old)void ctx.client.removeChannel(old);onReady(false);}
 function typing(value){if(!subscribed||!active())return;clearTimeout(typingTimer);const now=Date.now();if(value&&now-lastTyped<2000){typingTimer=setTimeout(()=>typing(false),3500);return;}lastTyped=now;void channel.track({user_id:uid,typing_until:value?now+5000:0}).catch(()=>{});if(value)typingTimer=setTimeout(()=>typing(false),3500);}
 const visibility=()=>doc.hidden?disconnect():connect();doc.addEventListener('visibilitychange',visibility);connect();
 return {typing,dispose(){closed=true;doc.removeEventListener('visibilitychange',visibility);disconnect();}};
}
export function deliveryState(message,members,uid){
 if(message._delivery)return message._delivery;
 const peers=members.filter(m=>m.user_id!==uid);
 const time=Date.parse(message.created_at);const read=peers.filter(m=>{const seen=Date.parse(m.last_read_at);return seen>time||(seen===time&&(m.last_read_id||'')>=message.id);}).length;
 return peers.length&&read===peers.length?'read':'sent';
}
export function receiptText(message,members,uid,lang='ru',{now=Date.now(),unanswered=true}={}){
 const state=deliveryState(message,members,uid),index=({ru:0,en:1,ja:2})[lang]??0;
 const labels={sending:['Отправляется…','Sending…','送信中…'],failed:['Не отправлено · повторить','Not sent · retry','未送信・再試行'],sent:['Отправлено','Sent','送信済み'],read:['Просмотрено','Seen','既読']};
 if(state!=='read'||!unanswered)return labels[state][index];
 const peers=members.filter(m=>m.user_id!==uid),stamps=peers.map(p=>Date.parse(p.last_seen_at));
 if(stamps.some(t=>!Number.isFinite(t)))return labels.read[index];
 const mins=Math.floor(Math.max(0,now-Math.max(...stamps))/60000);if(mins<1)return labels.read[index];
 const n=mins<60?mins:mins<1440?Math.floor(mins/60):Math.floor(mins/1440),unit=mins<60?['мин','min','分']:mins<1440?['ч','h','時間']:['дн','d','日'];
 return [`Просмотрено ${n} ${unit[0]} назад`,`Seen ${n} ${unit[1]} ago`,`${n}${unit[2]}前に既読`][index];
}
