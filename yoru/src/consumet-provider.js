// This module is a separate, on-demand browser asset. It never touches Kodik.
export const DEFAULT_SERVERS = ['https://consumet-api-clone.vercel.app/', 'https://api.consumet.stream/'];
const external = id => id === 'consumet:dub' || id === 'consumet:sub';
function httpsURL(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password ? u.href : null; } catch { return null; }
}
function remember(cache, key, value, now) {
  cache.delete(key); cache.set(key, {value, time:now});
  while (cache.size > 8) cache.delete(cache.keys().next().value);
  return value;
}

export function createConsumetProvider({fetchImpl=globalThis.fetch, servers=DEFAULT_SERVERS, timeout=8000, now=Date.now}={}) {
  const mappings = new Map(), details = new Map();
  const bases = [...new Set(servers.map(httpsURL).filter(Boolean))];
  async function request(url, options={}, text=false) {
    const controller = new AbortController(), timer = setTimeout(()=>controller.abort(), timeout);
    try {
      const response = await fetchImpl(url, {...options, credentials:'omit', signal:controller.signal});
      if (!response.ok) throw Error('consumetUnavailable');
      return text ? await response.text() : await response.json();
    } finally { clearTimeout(timer); }
  }
  async function anilistID(malId) {
    const saved = mappings.get(malId); if (saved) return saved.value;
    const data = await request('https://graphql.anilist.co', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({query:'query($id:Int!){Media(idMal:$id,type:ANIME){id idMal}}',variables:{id:malId}}),
    });
    const media = data?.data?.Media;
    if (Number(media?.idMal) !== malId || !Number.isSafeInteger(media?.id) || media.id < 1) throw Error('consumetIdentity');
    return remember(mappings, malId, media.id, now());
  }
  async function resolve(anime, index, audioId, {refresh=false, current=()=>true}={}) {
    if (!external(audioId)) throw Error('consumetAudio');
    const malId=Number(anime.ids?.mal || anime.malId), row=anime.episodeManifest?.[index-1];
    const ordinal=Number(row?.ordinal ?? index), dub=audioId==='consumet:dub';
    // Separate specials and combined multi-season records need an exact mapping,
    // rather than guessing that their local episode number belongs to season one.
    const seasons=new Set((anime.episodeManifest||[]).map(e=>e.season??1));
    if (!Number.isSafeInteger(malId) || malId<1 || !Number.isSafeInteger(ordinal) || ordinal<1 || row?.season===0 || seasons.size>1) throw Error('consumetIdentity');
    const check=()=>{if(!current())throw Error('consumetCancelled');};
    check(); const id=await anilistID(malId); check();
    // A host's episode IDs are only ever used against that same host/provider.
    for (const provider of ['zoro','gogoanime']) for (const base of bases) {
      check();
      try {
        const key=`${base}|${provider}|${id}|${dub}`, cached=details.get(key);
        const infoURL=new URL(`meta/anilist/info/${id}`,base);
        infoURL.search=new URLSearchParams({provider,dub:String(dub)}).toString();
        const info=!refresh && cached && now()-cached.time<600000 ? cached.value : await request(infoURL.href);
        check();
        if(Number(info?.malId)!==malId || Number(info.id)!==id)throw Error('consumetIdentity');
        if(dub && (info.hasDub===false || /^sub$/i.test(info.subOrDub||'')))throw Error('consumetAudio');
        if(!dub && (info.hasSub===false || /^dub$/i.test(info.subOrDub||'')))throw Error('consumetAudio');
        const episode=info.episodes?.find(e=>Number(e.number)===ordinal);
        if(!episode?.id || (dub && episode.isDubbed===false))throw Error('consumetAudio');
        // Gogo represents dubbed releases with distinct IDs. Do not accept a
        // sub release when an old server silently ignores its dub parameter.
        if(dub && provider==='gogoanime' && !/(?:^|-)dub(?:-|$)/i.test(episode.id) && !/^dub$/i.test(info.subOrDub||''))throw Error('consumetAudio');
        if(!dub && provider==='gogoanime' && /(?:^|-)dub(?:-|$)/i.test(episode.id))throw Error('consumetAudio');
        remember(details,key,info,now());
        const watchURL=new URL(`meta/anilist/watch/${encodeURIComponent(episode.id)}`,base);
        watchURL.search=new URLSearchParams({provider,dub:String(dub)}).toString();
        const result=await request(watchURL.href);check();
        if(dub && /^sub$/i.test(result.subOrDub||''))throw Error('consumetAudio');
        if(!dub && /^dub$/i.test(result.subOrDub||''))throw Error('consumetAudio');
        const sources=(result.sources||[]).filter(s=>s.isM3U8===true || /\.m3u8(?:[?#]|$)/i.test(s.url||'')).map(s=>({url:httpsURL(s.url),quality:parseInt(s.quality,10)||0,stream:true})).filter(s=>s.url);
        if(!sources.length)throw Error('consumetUnavailable');
        // Test in the browser with its real CORS/referrer rules. We cannot forge
        // Referer/Origin or route third-party URLs through the Kodik proxy.
        const verified=[];
        for(const source of sources){
          try {const manifest=await request(source.url,{},true);check();if(!manifest.trimStart().startsWith('#EXTM3U'))continue;verified.push(source);break;}catch{check();}
        }
        if(!verified.length)throw Error('consumetUnavailable');
        let subtitleText=null;
        if(!dub){
          const sub=(result.subtitles||[]).find(s=>/^(en(?:[-_]|$)|english)/i.test(s.lang||s.language||s.label||'') && !/sign|song|forced/i.test(s.lang||s.label||'') && httpsURL(s.url));
          if(sub){subtitleText=await request(httpsURL(sub.url),{},true);check();if(!subtitleText.trimStart().startsWith('WEBVTT'))throw Error('consumetSubtitles');}
          else if(provider!=='gogoanime')throw Error('consumetSubtitles');
        }
        return {sources:verified,subtitleText,audioId,ordinal,provider:'consumet',opening:null,ending:null};
      } catch {check();}
    }
    throw Error('consumetUnavailable');
  }
  return {resolve};
}

let instance;
export function videoEpisode(...args){return (instance ||= createConsumetProvider({servers:globalThis.window?.YORU_CONFIG?.consumetApiUrls||DEFAULT_SERVERS})).resolve(...args);}

// Attach a fetched, validated English VTT locally, without reloading the video.
export function attachSubtitles(video,text){
  if(!text)return ()=>{};
  const url=URL.createObjectURL(new Blob([text],{type:'text/vtt'}));
  const node=video.ownerDocument.createElement('track');
  node.kind='subtitles';node.srclang='en';node.label='English';node.default=true;node.src=url;
  const show=()=>{node.track.mode='showing';};
  node.addEventListener('load',show);video.append(node);show();
  return ()=>{node.track.mode='disabled';node.removeEventListener('load',show);node.remove();URL.revokeObjectURL(url);};
}

export function showFailure({container,status,lang='ru',onRussian}){
  const messages={ru:['Английская версия сейчас недоступна. Попробуйте ещё раз или выберите русскую озвучку.','Вернуться к русской озвучке'],en:['The English version is unavailable. Try again or choose a Russian dub.','Switch to Russian audio'],ja:['英語版を読み込めません。再試行するか、ロシア語音声を選択してください。','ロシア語音声に戻る']};
  const [message,label]=messages[lang]||messages.en;
  container.hidden=false;container.querySelector('h3').textContent=message;status.textContent=message;
  container.querySelector('[data-consumet-return]')?.remove();
  if(onRussian){const button=container.ownerDocument.createElement('button');button.type='button';button.className='button soft';button.dataset.consumetReturn='';button.textContent=label;button.addEventListener('click',onRussian);container.append(button);}
}
