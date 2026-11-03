// Separate, account-scoped display/pending cache. Never touches uiCache or saved lists.
export function activityStore(storage,uid,id){
 const prefix='yomiku.activity.v1.'+uid+'.',own={seconds:0,night:0,acked:0},read=k=>{try{return JSON.parse(storage?.getItem(k)||'null');}catch{return null;}},write=(k,v)=>{try{storage?.setItem(k,JSON.stringify(v));}catch{}};
 let snapshot=read(prefix+'snapshot')||{seconds:0,badges:{}};
 function sessions(){const found=new Map();try{for(let i=0;i<storage.length;i++){const key=storage.key(i);if(key?.startsWith(prefix+'session.')){const value=read(key);if(value?.updatedAt&&Date.now()-value.updatedAt>7*86400000&&Math.floor(value.seconds)<=value.acked){storage.removeItem(key);i--;continue;}if(value&&Number.isFinite(value.seconds)&&Number.isFinite(value.acked))found.set(key.slice((prefix+'session.').length),value);}}}catch{}found.set(id,{...own,acked:Math.max(own.acked,found.get(id)?.acked||0)});return found;}
 function save(){if(own.seconds>0){const key=prefix+'session.'+id,old=read(key);own.acked=Math.max(own.acked,old?.acked||0);write(key,{...own,updatedAt:Date.now()});}}
 return {get snapshot(){return snapshot;},credit(seconds,night){own.seconds+=seconds;if(night)own.night+=seconds;},save,
  total(){return Number(snapshot.seconds||0)+[...sessions().values()].reduce((n,s)=>n+Math.max(0,Math.floor(s.seconds)-s.acked),0);},
  dirty(){save();return [...sessions()].filter(([,s])=>Math.floor(s.seconds)>s.acked).slice(0,20);},
  accept(data,session,seconds){const stored=read(prefix+'snapshot')||{};snapshot={...data,seconds:Math.max(data.seconds||0,stored.seconds||0,snapshot.seconds||0),badges:{...stored.badges,...snapshot.badges,...data.badges}};write(prefix+'snapshot',snapshot);
   if(session){const key=prefix+'session.'+session,s=session===id?own:read(key);if(s){s.acked=Math.max(s.acked||0,seconds);write(key,s);}}
  }
 };
}
