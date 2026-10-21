import {auditBatch,admissionPolicy} from './catalog-admission.js';

// Provider IDs and cached cards cannot resolve media: only this audited manifest.
export function createApprovedCatalogue(publication,{now=Date.now(),playerSubtitlesReady=true}={}){
 const records=new Map();
 const items=publication?.policyVersion===admissionPolicy.version?publication.items||[]:[];
 const audited=auditBatch(items,{now,playerSubtitlesReady});
 items.forEach((item,i)=>{if(audited[i].passed){const copy=structuredClone(item);copy.episodes.sort((a,b)=>a.number-b.number);records.set(item.id,copy);}});
 const model=a=>({...a,catalogApproved:true,catalogOnly:false,malId:a.ids?.mal,
  image:a.artwork.poster.url,banner:a.artwork.backdrop.url,detailsBanner:a.artwork.backdrop.url,
  episodes:a.episodes.length,episodeNumbers:a.episodes.map(e=>e.number),
  episodeManifest:a.episodes.map(e=>({ordinal:e.number,audio:e.audio.map(t=>t.id),tracks:e.audio.map(t=>({id:t.id,label:t.label||t.dubId,language:t.language,original:t.original===true}))}))});
 return {
  items:[...records.values()].map(model),
  find(id){const a=records.get(id);return a?model(a):null;},
  video(id,index,audioId){
   const a=records.get(id);if(!a)throw Error('notAdmitted');
   if(!Number.isInteger(index)||index<1||index>a.episodes.length)throw Error('episodeUnavailable');
   const e=a.episodes[index-1],track=audioId?e.audio.find(t=>t.id===audioId):e.audio[0];
   if(!track)throw Error('audioUnavailable');
   return structuredClone({sources:track.sources,subtitles:track.subtitles,duration:track.duration,
    audioId:track.id,ordinal:e.number,recordingId:track.recordingId,cutId:track.cutId,
    opening:track.opening,ending:track.ending});
  },
 };
}
