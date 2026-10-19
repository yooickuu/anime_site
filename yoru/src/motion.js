const seen=new WeakSet();
let observer;
const pending=new Set();
// Only animate surfaces as they enter the viewport; content is never hidden by JS.
export function revealSurfaces(root){
 if(!root||matchMedia('(prefers-reduced-motion: reduce)').matches||!('IntersectionObserver' in window))return;
 observer??=new IntersectionObserver(entries=>{
  for(const entry of entries)if(entry.isIntersecting){
   entry.target.classList.add('motion-enter');observer.unobserve(entry.target);pending.delete(entry.target);
  }
 },{threshold:.06});
 for(const node of pending)if(!node.isConnected){observer.unobserve(node);pending.delete(node);}
 root.querySelectorAll('.anime-card,.continue-card,.discovery-tile,.profile-fields,.profile-history,.profile-preferences,.profile-appearance,.profile-evening,.library-sidebar').forEach((node,i)=>{
  if(seen.has(node))return;seen.add(node);
  node.style.setProperty('--reveal-delay',`${Math.min(i%6,5)*35}ms`);observer.observe(node);pending.add(node);
 });
}
