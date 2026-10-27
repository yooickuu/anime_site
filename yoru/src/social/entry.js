import './social.css';
import {h,tr} from './common.js';
function css(){if(document.querySelector('[data-social-css]'))return;const link=document.createElement('link');link.rel='stylesheet';link.dataset.socialCss='';const url=new URL('./entry.css',import.meta.url);url.search=new URL(import.meta.url).search;link.href=url.href;document.head.append(link);}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function mountPage(root,ctx,route){css();if(!ctx.client){root.textContent=tr(ctx,'unavailable');return ()=>{};}
 const [kind,id]=route.split('/');if((kind==='user'||kind==='chat')&&!uuid.test(id||'')){root.textContent=tr(ctx,'notFound');return ()=>{};}
 const module=kind==='user'?await import('./profile.js'):kind==='chat'?await import('./chat.js'):await import('./community.js');
 if(!root.isConnected||!ctx.active())return ()=>{};return module.mount(root,ctx,id);
}
export async function mountComments(root,ctx,key){css();if(!ctx.client){root.textContent=tr(ctx,'unavailable');return ()=>{};}const module=await import('./comments.js');if(!root.isConnected||!ctx.active())return ()=>{};return module.mount(root,ctx,key);}

export async function syncProfile(ctx){return (await import('./unified-profile.js')).syncProfile(ctx);}
export async function notifications(ctx,update){const {start}=await import('./notifications.js');if(!ctx.active())return ()=>{};return start(ctx,update);}

export {clearCache} from './cache.js';
export async function prefetch(kind){css();return kind==='profile'?import('./profile.js'):import('./community.js');}
