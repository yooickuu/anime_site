// Discovery only: provider labels select candidates, never certify timing.
const labels={ru:/^(?:russian|русский)(?:\b|\s|$)/iu,en:/^(?:english|английский)(?:\b|\s|$)/iu,ja:/^(?:japanese|японский|日本語)(?:\b|\s|$)/iu};
export function subtitleOffers(items=[]){
 const seen=new Set(),out=[];
 for(const row of items){
  const label=String(row.label||'').trim();
  if(/forced|signs\s*(?:\/|&|and)\s*songs|только надписи/iu.test(label))continue;
  const named=Object.entries(labels).find(([,pattern])=>pattern.test(label))?.[0];
  const declared=String(row.language||row.lang||'').toLowerCase().split('-')[0];
  const language=named||(['ru','en','ja'].includes(declared)&&!label?declared:null);
  if(!language)continue;
  let url;try{url=new URL(row.url||row.src);if(url.protocol!=='https:'||url.username||url.password)continue;}catch{continue;}
  const key=language+':'+url.href;if(seen.has(key))continue;seen.add(key);
  out.push({language,label,url:url.href,languageConflict:!!named&&!!declared&&named!==declared,verified:false});
 }
 return out;
}

// A cheap content check, NOT proof of translation quality or synchronization.
export function inspectVtt(text,language){
 const lines=String(text).replace(/^\uFEFF/,'').split(/\r?\n/),validHeader=lines[0]?.trim()==='WEBVTT'||lines[0]?.startsWith('WEBVTT ');
 const stamp=s=>{const p=s.split(':').map(Number);return p.every(Number.isFinite)?p.reduce((n,v)=>n*60+v,0):NaN;};
 const cues=[];let invalid=false,body=[];
 for(let i=1;i<lines.length;i++)if(lines[i].includes('-->')){
  const m=lines[i].match(/^(\d{2,}:\d{2}(?::\d{2})?\.\d{3})\s+-->\s+(\d{2,}:\d{2}(?::\d{2})?\.\d{3})(?:\s|$)/);
  if(!m){invalid=true;continue;}
  const start=stamp(m[1]),end=stamp(m[2]);if(!(start>=0&&end>start))invalid=true;
  cues.push({start,end});for(let j=i+1;j<lines.length&&lines[j].trim();j++)body.push(lines[j].replace(/<[^>]*>/g,''));
 }
 const content=body.join(' '),cyrillic=(content.match(/[А-Яа-яЁё]/g)||[]).length,kana=(content.match(/[ぁ-ゖァ-ヺ]/g)||[]).length;
 const languageSupported=language==='ru'?cyrillic>=20:language==='ja'?kana>=20:language==='en'?/[a-z]/i.test(content)&&cyrillic===0&&kana===0:false;
 return {valid:!!validHeader&&!invalid&&cues.length>0,cues:cues.length,lastEnd:Math.max(0,...cues.map(c=>c.end)),languageSupported,synchronizationVerified:false};
}
