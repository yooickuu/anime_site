export const HISTORY_AGE=14*24*60*60*1000;
// History is a rolling view. Never delete episode progress, completions or lists.
export function recentHistory(progress,now=Date.now()){
 const seen=new Set();return Object.values(progress||{}).filter(p=>p&&p.id&&p.id!=='sintel'&&Number(p.updated)>now-HISTORY_AGE&&Number(p.updated)<=now+60000).sort((a,b)=>Number(b.updated)-Number(a.updated)).filter(p=>!seen.has(p.id)&&seen.add(p.id));
}
