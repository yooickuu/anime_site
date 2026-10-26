import test from 'node:test';
import assert from 'node:assert/strict';
import {createConsumetProvider,attachSubtitles,DEFAULT_SERVERS} from '../src/consumet-provider.js';
const anime={ids:{mal:100,anilist:999},episodeManifest:[{ordinal:1,season:1},{ordinal:2,season:1}]};
const servers=['https://first.test/','https://backup.test/'];
const json=x=>Response.json(x);
function stub({failFirst=false,mal=100,hasDub=true,subtitles=true,manifest='#EXTM3U\n#EXT-X-VERSION:3',onCall=()=>{}}={}){
 const calls=[];
 const fetchImpl=async (value,options={})=>{
  const url=new URL(value);calls.push(url.href);onCall(url,options);
  if(url.hostname==='graphql.anilist.co'){assert.equal(JSON.parse(options.body).variables.id,100);return json({data:{Media:{id:200,idMal:100}}});}
  if(failFirst&&url.hostname==='first.test')throw TypeError('network');
  if(url.pathname.includes('/info/')){assert.ok(url.pathname.endsWith('/200'));return json({id:200,malId:mal,hasDub,episodes:[{id:'second?ep=42',number:2},{id:'first?ep=41',number:1}]});}
  if(url.pathname.includes('/watch/'))return json({sources:[{url:'https://cdn.test/master.m3u8',quality:'auto',isM3U8:true}],subtitles:subtitles?[{lang:'English',url:'https://cdn.test/en.vtt'}]:[]});
  if(url.pathname.endsWith('.vtt'))return new Response('WEBVTT\n\n00:00.000 --> 00:01.000\nHello');
  return new Response(manifest);
 };
 return {calls,fetchImpl};
}
test('no external requests at creation; exact MAL mapping and episode, not a supplied unverified AniList ID',async()=>{
 const s=stub(),p=createConsumetProvider({...s,servers});assert.equal(s.calls.length,0);
 const result=await p.resolve(anime,2,'consumet:dub');
 assert.equal(result.ordinal,2);assert.equal(result.sources[0].stream,true);assert.equal(result.sources[0].quality,0);
 const watch=new URL(s.calls.find(x=>x.includes('/watch/')));assert.equal(decodeURIComponent(watch.pathname.split('/').at(-1)),'second?ep=42');assert.equal(watch.searchParams.get('dub'),'true');
 assert.ok(s.calls.every(x=>!x.includes('supabase')&&!x.includes('kodik')));
});
test('network failure switches host and never reuses primary episode IDs',async()=>{
 const s=stub({failFirst:true});await createConsumetProvider({...s,servers}).resolve(anime,1,'consumet:dub');
 assert.ok(s.calls.some(x=>x.startsWith(servers[1])&&x.includes('/info/')));
 assert.ok(s.calls.some(x=>x.startsWith(servers[1])&&x.includes('/watch/')));
 assert.ok(!s.calls.some(x=>x.startsWith(servers[0])&&x.includes('/watch/')));
});
test('HTTP errors and JSON error bodies also fall back',async()=>{
 for(const response of [()=>new Response('',{status:504}),()=>json({message:'broken'})]){
  const s=stub();const fetchImpl=(url,opts)=>String(url).startsWith(servers[0])?response():s.fetchImpl(url,opts);
  const media=await createConsumetProvider({fetchImpl,servers}).resolve(anime,1,'consumet:dub');assert.equal(media.ordinal,1);
 }
});
test('hung request has a timeout and advances to backup',async()=>{
 const s=stub();let aborted=false;
 const fetchImpl=(url,opts)=>String(url).startsWith(servers[0])?new Promise((_,reject)=>opts.signal.addEventListener('abort',()=>{aborted=true;reject(Error('timeout'));})):s.fetchImpl(url,opts);
 await createConsumetProvider({fetchImpl,servers,timeout:5}).resolve(anime,1,'consumet:dub');assert.equal(aborted,true);
});
test('sub means Japanese audio with English VTT; no forged subtitle option',async()=>{
 const s=stub();const result=await createConsumetProvider({...s,servers}).resolve(anime,2,'consumet:sub');
 assert.match(result.subtitleText,/^WEBVTT/);assert.ok(s.calls.some(x=>x.includes('/watch/')&&x.includes('dub=false')));
});
test('rejects wrong title, missing episode, unavailable dub and HTML instead of HLS',async()=>{
 for(const options of [{mal:101},{hasDub:false},{manifest:'<html>blocked</html>'}]){
  await assert.rejects(createConsumetProvider({...stub(options),servers}).resolve(anime,2,'consumet:dub'),/consumetUnavailable/);
 }
 await assert.rejects(createConsumetProvider({...stub(),servers}).resolve(anime,3,'consumet:dub'),/consumetUnavailable/);
});
test('does not map season zero or ambiguous combined seasons to a regular episode',async()=>{
 const s=stub();const provider=createConsumetProvider({...s,servers});
 for(const episodeManifest of [[{season:0,ordinal:1}],[{season:1,ordinal:1},{season:2,ordinal:1}]])await assert.rejects(provider.resolve({...anime,episodeManifest},1,'consumet:dub'),/consumetIdentity/);
 assert.equal(s.calls.length,0);
});
test('cancelled selection stops requests and cannot start a stale source',async()=>{
 let active=true;const s=stub({onCall:url=>{if(url.pathname.includes('/info/'))active=false;}});
 await assert.rejects(createConsumetProvider({...s,servers}).resolve(anime,1,'consumet:dub',{current:()=>active}),/consumetCancelled/);
 assert.ok(!s.calls.some(x=>x.includes('/watch/')));
});
test('bounded info caching avoids repeat episode listing but refresh renews it',async()=>{
 const s=stub();const p=createConsumetProvider({...s,servers});
 await p.resolve(anime,1,'consumet:dub');await p.resolve(anime,2,'consumet:dub');
 assert.equal(s.calls.filter(x=>x.includes('/info/')).length,1);
 await p.resolve(anime,2,'consumet:dub',{refresh:true});assert.equal(s.calls.filter(x=>x.includes('/info/')).length,2);
});
test('subtitle cleanup disables and removes only the attached track',()=>{
 const node={track:{mode:'disabled'},addEventListener(){},removeEventListener(){},remove(){this.removed=true;}};
 const video={ownerDocument:{createElement:()=>node},append:n=>assert.equal(n,node)};
 const cleanup=attachSubtitles(video,'WEBVTT\n');assert.equal(node.track.mode,'showing');assert.match(node.src,/^blob:/);
 cleanup();assert.equal(node.track.mode,'disabled');assert.equal(node.removed,true);
});
test('defaults are only the two user-authorized public instances',()=>{assert.deepEqual(DEFAULT_SERVERS,['https://consumet-api-clone.vercel.app/','https://api.consumet.stream/']);});
