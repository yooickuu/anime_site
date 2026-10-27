// Fit the visible viewport while the phone keyboard is open; no page zoom lock.
export function chatViewport(root,win=window){
 const doc=root.ownerDocument,viewport=win.visualViewport;let frame;
 doc.body.classList.add('chat-open');
 const fit=()=>{frame=null;root.style.setProperty('--chat-height',`${viewport?.height||win.innerHeight}px`);root.style.setProperty('--chat-top',`${viewport?.offsetTop||0}px`);};
 const schedule=()=>{if(frame==null)frame=win.requestAnimationFrame(fit);};
 viewport?.addEventListener('resize',schedule);viewport?.addEventListener('scroll',schedule);win.addEventListener('resize',schedule);fit();
 return ()=>{if(frame!=null)win.cancelAnimationFrame(frame);viewport?.removeEventListener('resize',schedule);viewport?.removeEventListener('scroll',schedule);win.removeEventListener('resize',schedule);doc.body.classList.remove('chat-open');root.style.removeProperty('--chat-height');root.style.removeProperty('--chat-top');};
}
