// Transport-independent synchronization. Never replaces a source or HLS instance.
const anime=/^(mal|shikimori|anilist|lib|vost|kitsu|go)-[0-9]+$/;
export function validState(s){return !!s&&anime.test(s.anime_id)&&Number.isInteger(s.episode)&&s.episode>0&&s.episode<=100000&&Number.isFinite(s.position)&&s.position>=0&&s.position<=86400&&typeof s.playing==='boolean'&&Number.isFinite(s.speed)&&s.speed>=.25&&s.speed<=4&&Number.isSafeInteger(s.revision)&&s.revision>=0&&Number.isFinite(Date.parse(s.sent_at));}
export function targetTime(s,now=Date.now()){
 const elapsed=s.playing?Math.min(15,Math.max(0,(now-Date.parse(s.sent_at))/1000)):0;
 return s.position+elapsed*s.speed;
}
export async function syncVideo(video,s,{now=Date.now(),allowPlay=true,onBlocked=()=>{}}={}){
 if(!validState(s)||!video||video.readyState<1)return false;
 const max=Number.isFinite(video.duration)?Math.max(0,video.duration-.05):86400,target=Math.min(max,targetTime(s,now));
 if(Math.abs(video.currentTime-target)>2&&!video.seeking)video.currentTime=target;
 if(video.playbackRate!==s.speed)video.playbackRate=s.speed;
 if(!s.playing&&!video.paused)video.pause();
 else if(s.playing&&video.paused&&allowPlay){try{await video.play();}catch{onBlocked();}}
 return true;
}
