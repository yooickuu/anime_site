import {kodikVideo,validEmbed,textFetch} from './animego.js';
const manifestCache=new Map();
async function fetchManifest(url){const raw=await textFetch(url);return {ok:true,json:async()=>JSON.parse(raw)};}
export async function publishedKodikVideo(id,index,audio,{fetcher=fetchManifest,resolve=kodikVideo}={}){
 if(!/^(mal|shikimori|lib)-\d+$/.test(id)||!Number.isSafeInteger(index)||index<1||!/^kodik-\d+$/.test(audio))throw Error('invalid_request');
 let cached=manifestCache.get(id);
 if(!cached||Date.now()>cached.until){
  const response=await fetcher(`https://yomiku.site/data/kodik/${id}.json`,{signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Error('episode_missing');const data=await response.json();
  if(data.id!==id||!Array.isArray(data.episodes))throw Error('invalid_manifest');
  cached={data,until:Date.now()+60000};manifestCache.set(id,cached);if(manifestCache.size>100)manifestCache.delete(manifestCache.keys().next().value);
 }
 const track=cached.data.episodes[index-1]?.tracks?.find(t=>t.audioId===audio);
 if(!track||!validEmbed(track.url)||audio!==`kodik-${track.translationId}`)throw Error('audio_missing');
 const video=await resolve(track.url,track.ordinal);
 return {...video,audioId:audio};
}
