export const subtitleLanguages=['ru','en','ja'];
export function usableSubtitles(items=[]){
 const seen=new Set();
 return items.filter(s=>{
  if(!subtitleLanguages.includes(s.language)||s.format!=='vtt'||seen.has(s.language))return false;
  try{const u=new URL(s.url);if(u.protocol!=='https:'||u.username||u.password)return false;}catch{return false;}
  seen.add(s.language);return true;
 });
}

// Text tracks survive quality switches; replace them only when recording changes.
// No video reload/pause and no automatic selection of another subtitle language.
export function createSubtitles(video,{onError=()=>{}}={}){
 let nodes=[],signature='',selected='off',disposed=false;
 function apply(){for(const node of nodes)if(node.track)node.track.mode=node.srclang===selected?'showing':'disabled';}
 function clear(){for(const node of nodes){if(node.track)node.track.mode='disabled';node.remove();}nodes=[];}
 return {
  set(items,preference='off'){
   const valid=usableSubtitles(items),next=JSON.stringify(valid.map(s=>[s.language,s.url]));
   selected=subtitleLanguages.includes(preference)?preference:'off';
   if(disposed)return [];
   if(next!==signature){
    signature=next;clear();
    for(const sub of valid){
     const node=video.ownerDocument.createElement('track');
     node.kind='subtitles';node.srclang=sub.language;node.label=sub.label||{ru:'Русский',en:'English',ja:'日本語'}[sub.language];
     node.src=sub.url;
     node.addEventListener('load',()=>{if(nodes.includes(node))apply();});
     node.addEventListener('error',()=>{if(nodes.includes(node)&&selected===node.srclang)onError(node.srclang);});
     nodes.push(node);video.append(node);
    }
   }
   apply();return valid;
  },
  select(language){selected=subtitleLanguages.includes(language)?language:'off';apply();},
  destroy(){disposed=true;clear();},
 };
}
