import {identityKeys} from '../src/catalog-admission.js';
export function remember(known,item){
 for(const key of identityKeys(item))known.add(key);
 if(item.id)known.add(`id:${item.id}`);
}
export function isKnown(known,item){
 return (item.id&&known.has(`id:${item.id}`))||identityKeys(item).some(key=>known.has(key));
}
// First page catches new releases; later runs continue at the last incomplete page.
export async function* seedPages({fetchPage,startPage=1,retryPages=[]}){
 const start=Number.isSafeInteger(startPage)&&startPage>0?startPage:1;
 const preflight=[...new Set([...(start>1?[1]:[]),...retryPages.filter(p=>Number.isSafeInteger(p)&&p>0&&p<start)])];
 for(const page of preflight){
  const response=await fetchPage(page);
  if(!Array.isArray(response.data))throw Error(`Invalid catalogue page ${page}`);
  yield {page,items:response.data,resumePage:start,nextPage:start};
 }
 for(let page=start;;page++){
  const response=await fetchPage(page);
  if(!Array.isArray(response.data))throw Error(`Invalid catalogue page ${page}`);
  const last=Number(response.meta?.last_page||response.meta?.pagination?.total_pages);
  const end=response.data.length===0||(last>0&&page>=last);
  yield {page,items:response.data,resumePage:page,nextPage:end?1:page+1};
  if(end)return;
 }
}
