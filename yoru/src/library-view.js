// Read-only projection: never rewrite entries, collections or account snapshots.
export function savedIds(state,list='all') {
 const collection=state.collections?.find(c=>c.id===list);
 if(collection)return [...new Set(collection.items)];
 return Object.keys(state.entries||{}).filter(id=>{const e=state.entries[id];return list==='all'||(list==='favorites'?e.favorite:e.status===list||e.legacyLists?.includes(list));});
}
export function savedCards(state,list,lookup) {
 return savedIds(state,list).map(id=>({...{title:id,genres:[],year:'',episodes:0,catalogOnly:true},...(state.entries[id]?.anime||{}),...(lookup(id)||{}),id}));
}
export function libraryPage(items,page=1,size=60) {
 const pages=Math.max(1,Math.ceil(items.length/size)),number=Math.max(1,Math.min(pages,page));
 return {items:items.slice((number-1)*size,number*size),page:number,pages,total:items.length};
}
export async function loadSavedCards(ids,resolve,{current=()=>true,onCard=()=>{}}={}) {
 let cursor=0;const failed=[];
 await Promise.all(Array.from({length:Math.min(4,ids.length)},async()=>{
  while(current()&&cursor<ids.length){const id=ids[cursor++];try{const card=await resolve({id});if(current()&&card)onCard(card);}catch{failed.push(id);}}
 }));return failed;
}
