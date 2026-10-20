import {applyOperation} from './state.js';

const playbackPreferences=new Set(['autoSkip','autoNext','autoPlay','speed','quality','audio','audioByAnime','volume','muted','language']);
// Guest playback state is in memory only, never queued for account persistence.
export function applyGuestPlaybackOperation(state,op){
 if(op.type==='preferences'){
  const entries=Object.entries(op.patch||{});
  if(!entries.length||entries.some(([key])=>!playbackPreferences.has(key)))return null;
 }else return null;
 return applyOperation(state,op);
}
