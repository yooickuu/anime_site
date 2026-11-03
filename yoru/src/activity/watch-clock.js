// Read-only media observer: never seeks, pauses, loads or reconfigures playback.
export function createWatchClock({now=()=>performance.now(),credit}){
 let last=null;
 return {sample(s){const at=now(),previous=last;last={at,time:s.time,key:s.key,active:s.active};
  if(!previous||!s.active||!previous.active||s.key!==previous.key)return 0;
  const elapsed=(at-previous.at)/1000,advance=s.time-previous.time;
  if(elapsed<=0||elapsed>2.5||advance<=0||advance>elapsed*(s.rate||1)+.6)return 0;
  const seconds=Math.min(elapsed,advance/(s.rate||1));credit(seconds,s.night);return seconds;
 },reset(){last=null;}};
}
export function observeWatch({identity,context,credit,doc=document,win=window}){
 let video=null,playing=false,scrollUntil=0,focused=doc.hasFocus(),controller=new AbortController();
 const clock=createWatchClock({credit});
 function bind(){const next=doc.querySelector('#video');if(next===video)return;controller.abort();controller=new AbortController();video=next;playing=!!video&&!video.paused&&video.readyState>=3;clock.reset();if(!video)return;
  for(const name of ['playing','play','pause','waiting','stalled','seeking','seeked','ended','emptied','loadstart'])video.addEventListener(name,()=>{playing=name==='playing';clock.reset();},{signal:controller.signal});
 }
 function tick(){bind();const c=context(),r=video?.getBoundingClientRect(),full=!!doc.fullscreenElement||!!doc.webkitFullscreenElement||!!video?.webkitDisplayingFullscreen;
  const visible=full||!!r&&r.width>0&&r.height>0&&Math.max(0,Math.min(r.bottom,win.innerHeight)-Math.max(0,r.top))>=Math.min(r.height,win.innerHeight)*.5;
  const active=!!identity()&&c.ready&&playing&&video&&!video.paused&&!video.ended&&!video.seeking&&video.readyState>=3&&!doc.hidden&&focused&&visible&&performance.now()>=scrollUntil;
  clock.sample({active,time:video?.currentTime||0,rate:video?.playbackRate||1,key:c.key,night:new Date().getHours()<5});
 }
 const life=new AbortController();doc.addEventListener('scroll',()=>{scrollUntil=performance.now()+250;clock.reset();},{capture:true,passive:true,signal:life.signal});
 for(const name of ['visibilitychange','fullscreenchange'])doc.addEventListener(name,()=>{focused=doc.hasFocus();clock.reset();},{signal:life.signal});
 win.addEventListener('blur',()=>{focused=false;clock.reset();},{signal:life.signal});win.addEventListener('focus',()=>{focused=true;clock.reset();},{signal:life.signal});
 const timer=setInterval(tick,500);tick();return ()=>{clearInterval(timer);controller.abort();life.abort();};
}
