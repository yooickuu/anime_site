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
