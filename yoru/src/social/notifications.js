// Small authenticated aggregate only; never download message bodies to the header.
export function start(ctx,update){
 const uid=ctx.user()?.id,controller=new AbortController();let timer,busy=false,active=true;
 const live=()=>active&&uid===ctx.user()?.id&&(ctx.active?.()??true);
 async function refresh(){clearTimeout(timer);if(!live())return;if(document.hidden||ctx.canPoll?.()===false||busy){timer=setTimeout(refresh,20000);return;}busy=true;
  try{const {data,error}=await ctx.client.rpc('yoru_social_unread').abortSignal(controller.signal);if(!error&&live())update(new Set((data||[]).map(r=>r.room_id)).size);}catch{}finally{busy=false;if(live())timer=setTimeout(refresh,20000);}
 }
 document.addEventListener('yomiku:navigation',refresh,{signal:controller.signal});
 document.addEventListener('visibilitychange',refresh,{signal:controller.signal});
 document.addEventListener('yomiku:chat-read',refresh,{signal:controller.signal});
 void refresh();return ()=>{active=false;clearTimeout(timer);controller.abort();};
}
