// Only exact catalogue references can be embedded; never accept arbitrary URLs.
export function kodikEmbedURL(media){
 const ref=media?.providerRef;
 if(ref?.provider!=='kodik'||media.audioId!==`kodik-${ref.translationId}`)return null;
 try{const u=new URL(ref.url);if(u.protocol!=='https:'||u.username||u.password||u.port||!['kodikplayer.com','kodik.info','kodik.cc','kodik.biz'].includes(u.hostname)||!/^\/(seria|serial|video)\/\d+\/[a-z0-9]+\//i.test(u.pathname))return null;return u.href;}catch{return null;}
}
export function createKodikIframe({container,url,title,autoplay=false,startAt=0,sound={volume:1,muted:false},speed=1,onReady=()=>{},onError=()=>{},host=window,doc=document}){
 const frame=doc.createElement('iframe'),origin=new URL(url).origin,events=new EventTarget();
 let time=0,duration=NaN,paused=true,ended=false,volume=sound.volume,muted=sound.muted,resumed=false,disposed=false;
 const send=(method,values={})=>{if(!disposed)frame.contentWindow?.postMessage({key:'kodik_player_api',value:{method,...values}},origin);};
 const emit=name=>events.dispatchEvent(new Event(name));
 const player={
  addEventListener:(...args)=>events.addEventListener(...args),removeEventListener:(...args)=>events.removeEventListener(...args),
  get currentTime(){return time;},set currentTime(value){if(Number.isFinite(value)){time=Math.max(0,value);send('seek',{seconds:time});}},
  get duration(){return duration;},get paused(){return paused;},get ended(){return ended;},get seeking(){return false;},
  get volume(){return volume;},set volume(value){volume=Math.min(1,Math.max(0,Number(value)||0));send('volume',{volume});},
  get muted(){return muted;},set muted(value){muted=!!value;send(muted?'mute':'unmute');},
  play(){send('play');return Promise.resolve();},pause(){send('pause');},
  destroy(){disposed=true;host.removeEventListener('message',message);frame.remove();},frame
 };
 function message(event){
  if(disposed||event.source!==frame.contentWindow||event.origin!==origin||!event.data||typeof event.data!=='object')return;
  const {key,value}=event.data;
  if(key==='kodik_player_duration_update'&&Number.isFinite(value)&&value>0){duration=value;onReady(player);emit('loadedmetadata');if(!resumed){resumed=true;if(startAt>0)player.currentTime=Math.min(startAt,Math.max(0,duration-1));send('volume',{volume});send(muted?'mute':'unmute');send('speed',{speed});}}
  else if((key==='kodik_player_time_update'||key==='kodik_player_time')&&Number.isFinite(value)&&value>=0){time=value;emit('timeupdate');}
  else if(key==='kodik_player_play'||key==='kodik_player_video_started'){paused=false;ended=false;emit('play');}
  else if(key==='kodik_player_pause'){paused=true;emit('pause');}
  else if(key==='kodik_player_video_ended'){ended=true;paused=true;emit('ended');}
  else if(key==='kodik_player_volume_change'&&Number.isFinite(value)){volume=value;emit('volumechange');}
 }
 frame.title=title;frame.className='kodik-fallback';frame.allow='autoplay; fullscreen; picture-in-picture';frame.allowFullscreen=true;
 frame.referrerPolicy='strict-origin-when-cross-origin';
 frame.addEventListener('load',()=>{if(autoplay)send('play');});frame.addEventListener('error',()=>{if(!disposed)onError();});
 host.addEventListener('message',message);frame.src=url;container.append(frame);return player;
}
