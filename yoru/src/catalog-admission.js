export const admissionPolicy = Object.freeze({version:2,batchSize:250,qualities:[360,480,720,1080],requiredQualities:[1080],qualityMode:'real-available-hd',audio:{ru:2,en:1,ja:1},subtitles:['ru','en','ja']});
export const normalized = s => String(s||'').normalize('NFKC').trim().toLocaleLowerCase().replace(/\s+/g,' ');
export const fresh = (proof,now) => proof?.passed===true && Number.isFinite(Date.parse(proof.checkedAt)) && Date.parse(proof.checkedAt)<=now && now-Date.parse(proof.checkedAt)<=86400000;
const mediaURL=value=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password;}catch{return false;}};
export function identityKeys(a){
 return ['mal','anilist','shikimori'].flatMap(k=>Number.isSafeInteger(a.ids?.[k])&&a.ids[k]>0?[`${k}:${a.ids[k]}`]:[]);
}
// Only local verifier output belongs in evidence. Provider claims are not proof.
export function auditAdmission(a,{now=Date.now(),playerSubtitlesReady=false}={}){
 const issues=[];const fail=(code,path)=>issues.push({code,path});
 for(const issue of a.assemblyIssues||[])fail(issue.code,issue.path);
 if(!identityKeys(a).length)fail('canonical_identity_missing','ids');
 if(!fresh(a.evidence?.identity,now))fail('identity_unverified','evidence.identity');
 if(!playerSubtitlesReady)fail('player_subtitles_not_ready','player');
 const expected=a.releasedEpisodes,actual=(a.episodes||[]).map(e=>e.number);
 if(!Array.isArray(expected)||!expected.length||!expected.every(n=>Number.isFinite(n)&&n>0)||new Set(expected).size!==expected.length)fail('release_manifest_missing','releasedEpisodes');
 if(!fresh(a.evidence?.releaseManifest,now))fail('release_manifest_unverified','evidence.releaseManifest');
 if(new Set(actual).size!==actual.length||expected?.length!==actual.length||expected?.some(n=>!actual.includes(n)))fail('episode_coverage_mismatch','episodes');
 for(const [key,minWidth,minHeight] of [['poster',800,1200],['backdrop',1920,1080]]){
  const image=a.artwork?.[key];
  if(!mediaURL(image?.url)||image.width<minWidth||image.height<minHeight||!Number.isFinite(image.width)||!Number.isFinite(image.height))fail('artwork_resolution_missing',`artwork.${key}`);
  if(!fresh(image?.review,now))fail('artwork_visual_review_missing',`artwork.${key}`);
 }
 if(!fresh(a.evidence?.playerDesktop,now)||!fresh(a.evidence?.playerMobile,now))fail('player_acceptance_missing','evidence.player');
 if(a.ongoing&&(!a.updates?.adapter||!a.updates?.schedule||!fresh(a.updates?.probe,now)))fail('automatic_updates_unverified','updates');
 for(const e of a.episodes||[]){
  const path=`episodes.${e.number}`,audio=e.audio||[];
  for(const [language,count] of Object.entries(admissionPolicy.audio)){
   const tracks=audio.filter(t=>t.language===language);
   const distinct=new Set(tracks.map(t=>normalized(t.dubId)).filter(Boolean));
   if(distinct.size<count)fail('audio_language_missing',`${path}.audio.${language}`);
  }
  if(!audio.some(t=>t.language==='ja'&&t.original===true))fail('japanese_original_unverified',path);
  const ids=audio.map(t=>t.id);if(ids.some(id=>!id)||new Set(ids).size!==ids.length)fail('duplicate_audio_id',path);
  for(const track of audio){
   issues.push(...auditAudioTrack(track,{now,path:`${path}.audio.${track.id}`}));
  }
 }
 return {id:a.id,passed:issues.length===0,issues};
}
export function auditBatch(candidates,{existing=[],...options}={}){
 const seen=new Map();for(const a of existing)for(const k of identityKeys(a))seen.set(k,a.id);
 return candidates.map(a=>{
  const result=auditAdmission(a,options);
  for(const k of identityKeys(a))if(seen.has(k))result.issues.push({code:'duplicate_release',path:k,existingId:seen.get(k)});
  // Reserve even rejected identities: duplicate candidates need reconciliation before admission.
  for(const k of identityKeys(a))if(!seen.has(k))seen.set(k,a.id);
  result.passed=result.issues.length===0;return result;
 });
}

export function auditAudioTrack(track,{now=Date.now(),path="audio"}={}){
 const issues=[],fail=(code,path)=>issues.push({code,path});
   const p=path;
   if(!fresh(track.languageReview,now))fail('audio_language_unverified',p);
   // Latest user decision: a genuine 1080 rendition may be admitted alone.
   // Never invent lower resolutions; continue discovery for the missing ones.
   const sources=track.sources||[];
   for(const quality of admissionPolicy.requiredQualities)if(!sources.some(s=>s.quality===quality))fail('quality_unverified',`${p}.${quality}`);
   const qualities=new Set();
   for(const s of sources){
    if(!admissionPolicy.qualities.includes(s.quality)||qualities.has(s.quality))fail('invalid_quality',`${p}.${s.quality}`);
    qualities.add(s.quality);
    if(!mediaURL(s.url)||s.height!==s.quality||!fresh(s.probe,now)||s.probe?.decoded!==true||s.probe?.browserPlayable!==true)fail('quality_unverified',`${p}.${s.quality}`);
   }
   for(const language of admissionPolicy.subtitles){
    const sub=track.subtitles?.find(s=>s.language===language);
    if(!mediaURL(sub?.url)||sub.format!=='vtt'||!fresh(sub.review,now)||sub.review?.synchronized!==true)fail('subtitle_unverified',`${p}.subtitles.${language}`);
   }
   for(const kind of ['opening','ending']){
    const mark=track[kind];
    if(!fresh(mark?.review,now)||!(mark?.absent===true||(Number.isFinite(mark?.start)&&Number.isFinite(mark?.end)&&mark.start>=0&&mark.end>mark.start&&mark.end<=track.duration)))fail('skip_timing_unverified',`${p}.${kind}`);
   }
 return issues;
}
