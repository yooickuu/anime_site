// Only the server can issue signed proxy URLs for validated catalogue tracks.
export async function refreshKodikMedia(media,config,id,index,{fetcher=fetch}={}){
 const endpoint=new URL(config.supabaseUrl+'/functions/v1/anime-source');
 const response=await fetcher(endpoint.href,{method:'POST',headers:{'Content-Type':'application/json',apikey:config.supabaseKey},body:JSON.stringify({action:'kodik-video',id,episode:index,audio:media.audioId,season:media.providerRef?.season,ordinal:media.providerRef?.ordinal}),signal:AbortSignal.timeout(180000)});
 if(!response.ok){const error=await response.json().catch(()=>({}));throw Error(error.error==='audio_missing'?'audioUnavailable':'providerError');}
 const fresh=await response.json();
 if(fresh.audioId!==media.audioId||!fresh.sources?.length)throw Error('audioUnavailable');
 if(fresh.proxied!==true||fresh.sources.some(s=>{try{const u=new URL(s.url);return u.origin!==endpoint.origin||u.pathname!==endpoint.pathname||u.searchParams.get('stream')!=='1';}catch{return true;}}))throw Error('proxyUnavailable');
 return {...media,...fresh,stream:true};
}
