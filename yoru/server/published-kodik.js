import {kodikVideo,validEmbed,jsonFetch} from './animego.js';
const manifestCache=new Map();
async function fetchManifest(url){try{const data=await jsonFetch(url);return {ok:true,json:async()=>data};}catch(error){throw Error('manifest_'+error.message);}}
export async function publishedKodikVideo(id,index,audio,{fetcher=fetchManifest,resolve=kodikVideo,season,ordinal}={}){
 if(!/^(mal|shikimori|lib)-\d+$/.test(id)||!Number.isSafeInteger(index)||index<1||!/^kodik-\d+$/.test(audio))throw Error('invalid_request');
 let cached=manifestCache.get(id);
 if(!cached||Date.now()>cached.until){
  const response=await fetcher(`https://raw.githubusercontent.com/yooickuu/anime_site/main/data/kodik/${id}.json`,{signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Error('episode_missing');const data=await response.json();
  if(data.id!==id||!Array.isArray(data.episodes))throw Error('invalid_manifest');
  cached={data,until:Date.now()+60000};manifestCache.set(id,cached);if(manifestCache.size>100)manifestCache.delete(manifestCache.keys().next().value);
 }
 const exact=Number.isFinite(ordinal)&&Number.isInteger(season);
 const track=exact?cached.data.episodes.flatMap(e=>e.tracks||[]).find(t=>t.audioId===audio&&t.ordinal===ordinal&&t.season===season):cached.data.episodes[index-1]?.tracks?.find(t=>t.audioId===audio);
 if(!track||!validEmbed(track.url)||audio!==`kodik-${track.translationId}`)throw Error('audio_missing');
 let video;try{video=await resolve(track.url,track.ordinal);}catch(error){throw Error('player_'+error.message);}
 return {...video,audioId:audio};
}
