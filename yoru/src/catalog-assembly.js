import {identityKeys,normalized,fresh,auditAudioTrack} from './catalog-admission.js';

const proofTime=p=>p?.passed===true?(Date.parse(p.checkedAt)||0):0;
const newest=(items,key)=>items.slice().sort((a,b)=>proofTime(b?.[key])-proofTime(a?.[key]))[0];
const unique=items=>[...new Set(items)];
const markKey=m=>JSON.stringify(m?.absent===true?['absent']:[m?.start,m?.end]);

// Assemble in quarantine BEFORE slicing into batches. Provider IDs and fuzzy
// titles never establish identity; conflicting canonical crosswalks stay held.
export function assembleCandidates(records,{now=Date.now()}={}){
 const parent=records.map((_,i)=>i),byKey=new Map();
 const root=i=>parent[i]===i?i:(parent[i]=root(parent[i]));
 records.forEach((a,i)=>identityKeys(a).forEach(k=>{
  if(byKey.has(k))parent[root(i)]=root(byKey.get(k));else byKey.set(k,i);
 }));
 const groups=new Map();records.forEach((a,i)=>{
  const k=root(i);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(a);
 });
 const items=[...groups.values()].map(rows=>{
  const aliases=unique(rows.flatMap(identityKeys)).sort(),ids={};
  const issues=[];
  for(const kind of ['mal','anilist','shikimori']){
   const values=aliases.filter(k=>k.startsWith(kind+':')).map(k=>Number(k.split(':')[1]));
   if(values.length>1)issues.push({code:'conflicting_canonical_ids',path:`ids.${kind}`});
   if(values.length===1)ids[kind]=values[0];
  }
  const base=rows.find(r=>fresh(r.evidence?.identity,now))||rows[0];
  const result=structuredClone(base);
  result.ids=ids;result.id=ids.mal?`mal-${ids.mal}`:ids.anilist?`anilist-${ids.anilist}`:ids.shikimori?`shikimori-${ids.shikimori}`:base.id;
  result.sourceRefs=unique(rows.flatMap(r=>r.sourceRefs||[`${r.provider||r.metadataSource||'unknown'}:${r.id}`]));
  result.evidence={...result.evidence};
  // Playback approval for an individual provider does not certify this newly
  // assembled combination. The verifier must exercise the resulting record.
  delete result.evidence.playerDesktop;delete result.evidence.playerMobile;
  // Never manufacture a release manifest from the union of provider episodes.
  const manifests=rows.filter(r=>fresh(r.evidence?.releaseManifest,now)&&Array.isArray(r.releasedEpisodes));
  if(new Set(manifests.map(r=>JSON.stringify([...r.releasedEpisodes].sort((a,b)=>a-b)))).size>1)
   issues.push({code:'conflicting_release_manifests',path:'releasedEpisodes'});
  if(manifests.length){result.releasedEpisodes=[...manifests[0].releasedEpisodes];result.evidence.releaseManifest=manifests[0].evidence.releaseManifest;}
  result.artwork={};
  for(const kind of ['poster','backdrop']){
   const images=rows.flatMap(r=>r.artwork?.[kind]?[r.artwork[kind]]:[]);
   if(images.length)result.artwork[kind]=structuredClone(newest(images,'review'));
  }
  const episodes=new Map();
  rows.forEach((r,sourceIndex)=>(r.episodes||[]).forEach(e=>{
   if(!episodes.has(e.number))episodes.set(e.number,[]);
   for(const t of e.audio||[]){
    const track=structuredClone(t);
    track.sourceRefs=unique([...(t.sourceRefs||[]),`${r.provider||r.metadataSource||'unknown'}:${r.id}`]);
    // A recording/cut match must be established by our verifier, not a name.
    const mapping=t.mappingReview;
    const mapped=fresh(mapping,now)&&identityKeys(result).includes(mapping.releaseKey)&&mapping.episode===e.number;
    track._assemblyKey=mapped&&t.recordingId&&t.cutId
     ?JSON.stringify([t.language,normalized(t.dubId),t.original===true,t.recordingId,t.cutId,t.duration,markKey(t.opening),markKey(t.ending)])
     :JSON.stringify(['separate',sourceIndex,episodes.get(e.number).length]);
    // Without a verified release+episode binding this track cannot be admitted.
    track.assemblyMappingVerified=mapped;
    episodes.get(e.number).push(track);
   }
  }));
  result.episodes=[...episodes].sort(([a],[b])=>a-b).map(([number,tracks])=>{
   const merged=new Map();
   for(const t of tracks){
    const key=t._assemblyKey;delete t._assemblyKey;
    if(!merged.has(key)){merged.set(key,t);continue;}
    const prev=merged.get(key);
    for(const [field,selector,review] of [['sources','quality','probe'],['subtitles','language','review']]){
     const buckets=new Map();
     for(const item of [...(prev[field]||[]),...(t[field]||[])]){
      if(!buckets.has(item[selector]))buckets.set(item[selector],[]);
      buckets.get(item[selector]).push(item);
     }
     prev[field]=[...buckets.values()].map(items=>newest(items,review));
    }
    prev.sourceRefs=unique([...prev.sourceRefs,...t.sourceRefs]);
   }
   // One recording of a studio per language. An incomplete mirror must not
   // invalidate a complete verified alternative, or count as a second dub.
   const studios=new Map();
   for(const t of merged.values()){
    const key=JSON.stringify([t.language,normalized(t.dubId)]);
    const score=x=>auditAudioTrack(x,{now}).length+(x.assemblyMappingVerified?0:1000);
    if(!studios.has(key)||score(t)<score(studios.get(key)))studios.set(key,t);
   }
   const choices=[...studios.values()].map(t=>({...t,id:`${t.language}:${normalized(t.dubId)}`}));
   const complete=choices.filter(t=>t.assemblyMappingVerified&&!auditAudioTrack(t,{now}).length);
   const sufficient=complete.filter(t=>t.language==='ru').length>=2&&complete.some(t=>t.language==='en')&&complete.some(t=>t.language==='ja'&&t.original===true);
   const audio=sufficient?complete:choices;
   for(const t of audio)if(!t.assemblyMappingVerified)issues.push({code:'episode_mapping_unverified',path:`episodes.${number}.audio.${t.id}`});
   return {number,audio,heldAudio:sufficient?choices.filter(t=>!complete.includes(t)):[]};
  });
  result.assemblyIssues=[...(base.assemblyIssues||[]),...issues];
  return result;
 });
 return {items,summary:{inputRecords:records.length,uniqueCandidates:items.length,mergedRecords:records.length-items.length,conflicts:items.filter(a=>a.assemblyIssues.some(i=>i.code.startsWith('conflicting_'))).length}};
}
