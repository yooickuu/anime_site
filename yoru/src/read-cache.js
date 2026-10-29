// Read-only request sharing. Writers always bypass it and invalidate pending reads.
export function createReadCache(load,{ttl=15000,now=Date.now}={}){
 const entries=new Map();
 return {
  get(key){const old=entries.get(key);if(old&&(old.pending||old.until>now()))return old.promise;
   const entry={pending:true,until:0};entry.promise=Promise.resolve().then(()=>load(key)).then(value=>{entry.pending=false;entry.until=now()+ttl;return value;},error=>{if(entries.get(key)===entry)entries.delete(key);throw error;});entries.set(key,entry);while(entries.size>8)entries.delete(entries.keys().next().value);return entry.promise;},
  invalidate(key){entries.delete(key);},
 };
}
