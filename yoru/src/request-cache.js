// Short-lived public metadata cache; shares in-flight requests and retries failures.
export function requestCache(load,{ttl=60000,max=40,key=(...args)=>JSON.stringify(args),now=Date.now}={}){
 const entries=new Map();
 const get=(...args)=>{
  const id=key(...args),old=entries.get(id);
  if(old&&old.until>now())return old.promise;
  const entry={until:now()+ttl,promise:null};
  entry.promise=Promise.resolve().then(()=>load(...args)).catch(e=>{if(entries.get(id)===entry)entries.delete(id);throw e;});
  entries.set(id,entry);if(entries.size>max)entries.delete(entries.keys().next().value);
  return entry.promise;
 };
 get.clear=()=>entries.clear();return get;
}
