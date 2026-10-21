// Runtime guard against an upstream replacement, added adverts or another cut.
// A timestamp reviewed for one recording must never skip dialogue in another.
export function approvedSkipTimes(info,duration){
 if(!Number.isFinite(duration)||!Number.isFinite(info?.duration)||info.duration<=0||Math.abs(duration-info.duration)>1)return {opening:null,ending:null};
 const result={opening:null,ending:null};
 for(const kind of ['opening','ending']){
  const mark=info[kind];if(mark?.review?.passed!==true)continue;
  if(mark.absent===true){result[kind]=mark;continue;}
  if(Number.isFinite(mark.start)&&Number.isFinite(mark.end)&&mark.start>=0&&mark.end>mark.start&&mark.end<=duration)result[kind]=mark;
 }
 return result;
}
