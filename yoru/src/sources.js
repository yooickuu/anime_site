// Publication allowlist only. Legacy adapters are quarantined in legacy-sources.js.
import publication from './published-catalog.json' with {type:'json'};
import {createApprovedCatalogue} from './approved-catalog.js';
import {registerAnime} from './catalog.js';
import {requestCache} from './request-cache.js';
const approved=createApprovedCatalogue(publication);
export const publishedItems=approved.items;
export const isPublished=id=>publishedItems.some(a=>a.id===id);
export const combinedCatalogue=requestCache(async(options={})=>{
 let items=publishedItems.filter(a=>(!options.query||[a.title,a.alt].join(' ').toLocaleLowerCase().includes(options.query.toLocaleLowerCase()))&&(!options.ongoing||a.ongoing)&&(!options.genre||options.genre==='all'||a.genres?.includes(options.genre)));
 const total=items.length,page=Math.max(1,Number(options.page)||1);
 return {items:items.slice((page-1)*24,page*24).map(registerAnime),total,pages:Math.max(1,Math.ceil(total/24)),partial:false};
});
export const resolveRelease=requestCache(async a=>{const found=publishedItems.find(x=>x.id===a.id);if(!found)throw Error('notAdmitted');return registerAnime(found);});
export async function findWatchRelease(id){return publishedItems.find(a=>a.id===id)||null;}
export async function discoveryIndex(){return publishedItems;}
export async function prepareEpisodeAudio(){}
export async function releaseSeasons(a){return publishedItems.filter(x=>x.id===a.id||(a.franchiseId&&x.franchiseId===a.franchiseId));}
export async function videoEpisode(a,index,_refresh=false,audioId){return approved.video(a.id,index,audioId);}
