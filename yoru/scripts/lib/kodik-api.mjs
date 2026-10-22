const API='https://kodik-api.com';
export function apiPage(value='/list'){
 const u=new URL(value,API);
 if(u.origin!==API||!['/list','/search'].includes(u.pathname)||u.username||u.password)throw Error('invalid_kodik_page');
 u.searchParams.delete('token');return u.pathname+u.search;
}
export class KodikAPI{
 constructor(token,{fetcher=fetch}={}){if(!token)throw Error('KODIK_TOKEN не задан. Добавьте свой ключ в .env (см. KODIK_SETUP.md).');this.token=token;this.fetcher=fetcher;}
 async request(page='/list',params={}){
  const u=new URL(apiPage(page),API);for(const [k,v]of Object.entries(params))u.searchParams.set(k,String(v));
  u.searchParams.set('token',this.token);
  const r=await this.fetcher(u,{signal:AbortSignal.timeout(20000)});
  if(!r.ok)throw Error(`kodik_http_${r.status}`);
  const d=await r.json();if(d.error||!Array.isArray(d.results))throw Error('kodik_access_or_response_error');
  return {...d,next_page:d.next_page?apiPage(d.next_page):null};
 }
 async *pages(page='/list',params={}){
  const visited=new Set();while(page){if(visited.has(page))throw Error('kodik_pagination_loop');visited.add(page);const d=await this.request(page,params);yield {...d,page};page=d.next_page;}
 }
}
export const catalogParams={types:'anime,anime-serial',with_material_data:true,with_seasons:true,with_episodes:true,with_episodes_data:true,limit:100,sort:'updated_at',order:'desc'};
export function playerURL(value){
 const u=new URL(value,'https://kodikplayer.com');
 if(!['kodik.info','kodik.biz','kodik.cc','kodikplayer.com'].includes(u.hostname)||!['https:','http:'].includes(u.protocol)||u.port||u.username||u.password||!/^\/(seria|video|serial)\/\d+\/[a-z0-9]+\//i.test(u.pathname))throw Error('invalid_player_url');
 u.protocol='https:';u.hostname='kodikplayer.com';return u.href;
}
export function translationIdentity(release){
 const tr=release.translation||{},label=String(tr.title||'').trim(),type=tr.type;
 if(!tr.id||!label)throw Error('translation_missing');
 const declared=String(tr.language||'').toLowerCase();
 let language=['ja','jpn','japanese','японский'].includes(declared)?'ja':['en','eng','english','английский'].includes(declared)?'en':['ru','rus','russian','русский'].includes(declared)?'ru':null;
 if(!language){
  if(/english|английск/i.test(label))language='en';
  else if(/японск|japanese/i.test(label))language='ja';
  else if(type==='subtitles'&&(release.material_data?.countries||[]).some(c=>/япония|japan/i.test(c)))language='ja';
  else if(type==='subtitles'&&(release.material_data?.countries||[]).some(c=>/китай|china/i.test(c)))language='zh';
  else if(type==='voice')language='ru';
 }
 if(!language)throw Error('translation_language_unknown');
 return {id:`kodik-${tr.id}`,dubId:String(tr.id),label,language,original:language==='ja'};
}
// No slice(), page-size limit, or inferred missing episode links.
export function allEpisodes(release){
 const rows=[];for(const [season,value]of Object.entries(release.seasons||{}))for(const [number,e]of Object.entries(value.episodes||{})){
  if(!Number.isInteger(Number(season))||Number(season)<0||!Number.isFinite(Number(number))||Number(number)<0)throw Error('invalid_episode_number');
  rows.push({season:Number(season),ordinal:Number(number),url:playerURL(typeof e==='string'?e:e.link),title:typeof e==='object'?e.title||'':''});
 }
 if(!rows.length&&release.type==='anime'&&release.link)rows.push({season:1,ordinal:1,url:playerURL(release.link),title:release.title});
 const count=Number(release.episodes_count);if(count>rows.length)throw Error('incomplete_episode_manifest');
 const seen=new Set();for(const e of rows){const k=`${e.season}:${e.ordinal}`;if(seen.has(k))throw Error('duplicate_episode');seen.add(k);}
 if(!rows.length)throw Error('no_episodes');if(new Set(rows.map(e=>e.url)).size!==rows.length)throw Error('ambiguous_episode_links');return rows.sort((a,b)=>a.season-b.season||a.ordinal-b.ordinal);
}
export function mergeKodikRelease(existing,incoming){
 if(!existing)return incoming;
 const result=structuredClone(existing),added=structuredClone(incoming);
 result.kodikRevisions={...result.kodikRevisions,...added.kodikRevisions};
 result.kodikIds=[...new Set([...(result.kodikIds||[]),...(added.kodikIds||[])])];
 result.relatedMalIds=[...new Set([...(result.relatedMalIds||[]),...(added.relatedMalIds||[])])];
 for(const e of added.episodes){
  let prior=result.episodes.find(p=>(p.season??1)===(e.season??1)&&(p.ordinal??p.number)===(e.ordinal??e.number));
  if(!prior){result.episodes.push(e);continue;}
  for(const t of e.audio){const n=prior.audio.findIndex(a=>a.id===t.id);if(n>=0)prior.audio[n]=t;else prior.audio.push(t);}
 }
 result.episodes.sort((a,b)=>(a.season??1)-(b.season??1)||(a.ordinal??a.number)-(b.ordinal??b.number));
 const multi=new Set(result.episodes.map(e=>e.season??1)).size>1;
 result.episodes.forEach((e,i)=>{e.ordinal??=e.number;e.number=multi?i+1:e.ordinal;});result.releasedEpisodes=result.episodes.map(e=>e.number);
 result.ongoing=added.ongoing;return result;
}
