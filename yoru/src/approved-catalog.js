import {auditBatch,admissionPolicy} from './catalog-admission.js';

// Provider IDs and cached cards cannot resolve media: only this audited manifest.
export function createApprovedCatalogue(publication,{now=Date.now(),playerSubtitlesReady=true,strict=false}={}){
 const records=new Map();
 const rawItems=publication?.policyVersion===admissionPolicy.version?publication.items||[]:[];
 // Invalid optional skip timestamps must disable skipping, not hide a whole title.
 const items=strict?rawItems:rawItems.map(item=>({...item,episodes:(item.episodes||[]).map(e=>({...e,audio:(e.audio||[]).map(track=>{
  const copy={...track};
  for(const kind of ['opening','ending']){const m=copy[kind];if(m&&m.absent!==true&&!(Number.isFinite(m.start)&&Number.isFinite(m.end)&&m.start>=0&&m.end>m.start&&m.end<=track.duration))copy[kind]=null;}
  return copy;
 })}))}));
 const audited=auditBatch(items,{now,playerSubtitlesReady,strict});
 items.forEach((item,i)=>{if(audited[i].passed){const copy=structuredClone(item);copy.episodes.sort((a,b)=>a.number-b.number);records.set(item.id,copy);}});
 const model=a=>({...a,catalogApproved:true,catalogOnly:false,malId:a.ids?.mal,
  image:a.artwork?.poster?.url||a.image,banner:a.artwork?.backdrop?.url||a.banner,detailsBanner:a.artwork?.backdrop?.url||a.banner,
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
