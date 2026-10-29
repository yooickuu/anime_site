// Keep unfinished fields across redraws, but never across accounts.
export function createProfileDraft() {
  let owner = null, fields = {};
  return {
    set(uid, name, value) {
      if (uid !== owner) { owner = uid; fields = {}; }
      if (['name', 'bio', 'language', 'theme'].includes(name)) fields[name] = value;
    },
    get(uid) { return uid === owner ? {...fields} : {}; },
    clear() { owner = null; fields = {}; },
  };
}

// Cache signed URLs until renewal, without blanking a valid avatar on transient failures.
export function createAvatarLoader({identity, sign, display, schedule = setTimeout, cancel = clearTimeout, now = Date.now, cache}) {
  let generation = 0, timer, cached = null, pending = null;
  const keyOf=({uid,path})=>uid&&path?JSON.stringify([uid,path]):'';
  async function refresh({force=false}={}) {
    const who=identity(),key=keyOf(who);
    if(!key){reset();return;}
    if(!cached&&cache){const saved=cache.image(who.uid,who.path);if(saved){cached={key,...saved};display(saved.url);cancel(timer);timer=schedule(()=>refresh({force:true}),Math.max(0,saved.expires-now()));}}
    if(!force&&cached?.key===key&&cached.expires>now())return;
    if(pending?.key===key)return pending.promise;
    const own=++generation;cancel(timer);
    if(cached&&cached.key!==key){cached=null;display('');}
    const promise=(async()=>{
      let url='';try{url=await sign(who.path);}catch{}
      if(own!==generation||key!==keyOf(identity()))return;
      if(url){if(cached?.url!==url)display(url);cached={key,url,expires:now()+50*60*1000};cache?.saveImage(who.uid,who.path,url,cached.expires);}
      // Keep the current photo if a renewal fails; never retain another user's image.
      if(!url&&!cached)display('');
      timer=schedule(()=>refresh({force:true}),url?50*60*1000:60*1000);
    })();
    pending={key,promise};
    try{await promise;}finally{if(pending?.promise===promise)pending=null;}
  }
  function reset(){++generation;cancel(timer);cached=null;pending=null;display('');}
  return {refresh,reset};
}
