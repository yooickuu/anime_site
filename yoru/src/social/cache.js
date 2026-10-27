// Bounded, account-scoped metadata cache. Never stores message bodies or watch history.
const clients=new WeakMap();
export function createCache({fresh=15000,ttl=60000,max=32,now=Date.now}={}){
 const entries=new Map();let version=0;
 return {
  peek(key){const entry=entries.get(key);if(!entry)return;if(now()-entry.at>=ttl){entries.delete(key);return;}entries.delete(key);entries.set(key,entry);return {value:entry.value,fresh:now()-entry.at<fresh};},
  clear(){version++;entries.clear();},
  async swr(key,load,paint,live=()=>true){const cached=this.peek(key),epoch=version;if(cached&&live())paint(cached.value,true);if(cached?.fresh)return cached.value;
   const value=await load();if(epoch===version&&live()){entries.delete(key);entries.set(key,{value,at:now()});while(entries.size>max)entries.delete(entries.keys().next().value);paint(value,false);}return value;
  },
 };
}
export function cacheFor(client){let cache=clients.get(client);if(!cache){cache=createCache();clients.set(client,cache);}return cache;}
export function clearCache(client){clients.get(client)?.clear();}
export const cacheKey=(ctx,key)=>`${ctx.user()?.id||'guest'}:${key}`;
