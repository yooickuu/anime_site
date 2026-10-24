// A resolver outage must not discard previously verified streams of the same track.
export async function refreshKodikMedia(media,config,id,index,{fetcher=fetch}={}){
 try{
  const response=await fetcher(config.supabaseUrl+'/functions/v1/anime-source',{method:'POST',headers:{'Content-Type':'application/json',apikey:config.supabaseKey},body:JSON.stringify({action:'kodik-video',id,episode:index,audio:media.audioId}),signal:AbortSignal.timeout(18000)});
  if(!response.ok)throw Error('providerError');const fresh=await response.json();
  if(fresh.audioId!==media.audioId||!fresh.sources?.length)throw Error('audioUnavailable');
  return {...media,...fresh};
 }catch(error){
  if(error.message==='audioUnavailable')throw error;
  if(media.sources?.length)return {...media,refreshFailed:true};
  throw Error('providerError');
 }
}
