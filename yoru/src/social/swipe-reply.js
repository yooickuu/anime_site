// Pointer Events preserve vertical scrolling and work with both touch and mouse.
export function swipeReply(root,reply,signal){
 let start=null,suppressUntil=0;
 const reset=()=>{if(start){start.node.classList.remove('is-swiping');start.node.style.removeProperty('--reply-drag');start=null;}};
 root.addEventListener('pointerdown',e=>{if(e.button!==0||e.isPrimary===false)return;const node=e.target.closest('[data-message]');if(!node||e.target.closest('a,input,textarea'))return;start={node,x:e.clientX,y:e.clientY,id:e.pointerId,dx:0,drag:false};},{signal});
 root.addEventListener('pointermove',e=>{if(!start||start.id!==e.pointerId)return;const dx=e.clientX-start.x,dy=e.clientY-start.y;if(!start.drag&&Math.abs(dy)>12&&Math.abs(dy)>Math.abs(dx)){reset();return;}if(Math.abs(dx)>12&&Math.abs(dx)>Math.abs(dy)*1.3){start.drag=true;start.dx=dx;start.node.classList.add('is-swiping');start.node.style.setProperty('--reply-drag',Math.sign(dx)*Math.min(64,Math.abs(dx)*.6)+'px');try{start.node.setPointerCapture(e.pointerId);}catch{}if(e.cancelable)e.preventDefault();}},{signal,passive:false});
 root.addEventListener('pointerup',e=>{if(!start||e.pointerId!==start.id)return;const {node,dx,drag}=start;reset();if(drag){suppressUntil=Date.now()+400;if(Math.abs(dx)>=55)reply(node.dataset.message);}},{signal});
 root.addEventListener('pointercancel',reset,{signal});
 root.addEventListener('click',e=>{if(Date.now()<suppressUntil){e.preventDefault();e.stopImmediatePropagation();}},{capture:true,signal});
 root.addEventListener('contextmenu',e=>{const node=e.target.closest('[data-message]');if(!node||e.target.closest('a,img'))return;e.preventDefault();reply(node.dataset.message);},{signal});
 root.addEventListener('keydown',e=>{if(e.target.matches('[data-message]')&&e.key==='Enter'){e.preventDefault();reply(e.target.dataset.message);}},{signal});
 signal.addEventListener('abort',reset,{once:true});
}
