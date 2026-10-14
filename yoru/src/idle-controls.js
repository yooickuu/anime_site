// A resettable timer shared by mouse, touch, keyboard and playback events.
export function idleControls({active,blocked,show,hide,schedule=setTimeout,cancel=clearTimeout,delay=3000}){
 let timer=null,disposed=false;
 function arm(){timer=schedule(()=>{timer=null;if(disposed||!active())return;if(blocked()){arm();return;}hide();},delay);}
 function reveal(){if(disposed)return;if(timer!==null)cancel(timer);timer=null;show();if(active())arm();}
 function dispose(){disposed=true;if(timer!==null)cancel(timer);timer=null;show();}
 return {reveal,dispose};
}
