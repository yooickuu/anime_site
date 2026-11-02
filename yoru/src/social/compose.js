// Small, tab-local drafts. No message content enters the catalogue or database cache.
export function createDrafts(){
 let owner=null;const values=new Map();
 return {get(uid,room){if(owner!==uid){owner=uid;values.clear();}return values.get(room)||'';},set(uid,room,text){if(owner!==uid){owner=uid;values.clear();}values.delete(room);if(text)values.set(room,text.slice(0,4000));while(values.size>20)values.delete(values.keys().next().value);}};
}
export const chatDrafts=createDrafts();
export function growInput(input,signal){
 const resize=()=>{input.style.height='auto';input.style.height=Math.min(140,Math.max(44,input.scrollHeight))+'px';};
 input.addEventListener('input',resize,{signal});resize();return resize;
}
