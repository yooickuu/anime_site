import {skipTarget,nextEpisodeAction} from './state.js';
// A single event owner for all providers; old/repeated end events cannot advance twice.
export function attachPlaybackAutomation(video,{context,onSkip=()=>{},onTick=()=>{},onEnded=()=>{}}){
 const events=new AbortController();let token,opening=false,ending=false,finished=false;
 function state(){const s=context();if(!s?.ready)return null;if(token!==s.token){token=s.token;opening=ending=finished=false;}return s;}
 video.addEventListener('timeupdate',()=>{
  const s=state();if(!s)return;
  if(!video.paused&&!video.seeking&&!video.ended){
   const start=skipTarget(video.currentTime,s.timing?.opening,s.preferences.autoSkip,opening,video.duration);
   if(start!==null){opening=true;video.currentTime=start;onSkip('opening');}
   const end=skipTarget(video.currentTime,s.timing?.ending,s.preferences.autoSkip,ending,video.duration+.1);
   if(end!==null){ending=true;video.currentTime=Math.min(video.duration,end);onSkip('ending');}
  }
  onTick();
 },{signal:events.signal});
 video.addEventListener('ended',()=>{
  const s=state();if(!s||finished||!video.ended)return;
  finished=true;
  onEnded(nextEpisodeAction(s.preferences,s.episode,s.total,s.hasNext));
 },{signal:events.signal});
 return ()=>events.abort();
}
