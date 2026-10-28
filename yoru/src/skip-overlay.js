// Separate from HLS/transport: the only playback action is an exact seek.
export function activeSkip(time,timing,duration){
 if(!Number.isFinite(time)||!Number.isFinite(duration)||duration<=0)return null;
 for(const kind of ['opening','ending']){
  const mark=timing?.[kind];
  if(mark&&!mark.absent&&Number.isFinite(mark.start)&&Number.isFinite(mark.end)&&mark.start>=0&&mark.end>mark.start&&mark.end<=duration&&time>=mark.start&&time<mark.end)return {kind,end:mark.end};
 }
 return null;
}
export function attachSkipOverlay(button,video,{context,t}){
 function active(){const s=context();return s?.ready&&!s.preferences.autoSkip&&!video.ended?activeSkip(video.currentTime,s.timing,video.duration):null;}
 function update(){
  const mark=active();button.hidden=!mark;
  if(mark)button.textContent=t(mark.kind==='opening'?'skipOpening':'skipEnding');
 }
 function click(event){
  event.preventDefault();event.stopPropagation();
  const mark=active();if(mark){video.currentTime=mark.end;update();}
 }
 const events=['timeupdate','seeking','seeked','loadedmetadata','durationchange','ended','emptied'];
 for(const name of events)video.addEventListener(name,update);
 button.addEventListener('click',click);update();
 return {update,destroy(){for(const name of events)video.removeEventListener(name,update);button.removeEventListener('click',click);button.hidden=true;}};
}
