// Display-only achievement cache. No watch timer, sessions or pending seconds.
export function badgeCache(storage,uid){
 const key='yomiku.badges.v1.'+uid,read=k=>{try{return JSON.parse(storage?.getItem(k)||'null');}catch{return null;}};
 let snapshot={badges:(read(key)||read('yomiku.activity.v1.'+uid+'.snapshot'))?.badges||{}};
 return {get snapshot(){return snapshot;},accept(data){snapshot={badges:{...snapshot.badges,...data?.badges}};try{storage?.setItem(key,JSON.stringify(snapshot));}catch{}}};
}
