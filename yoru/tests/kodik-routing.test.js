import test from 'node:test';
import assert from 'node:assert/strict';
import {refreshKodikMedia} from '../src/kodik-playback.js';

const config={supabaseUrl:'https://project.supabase.co',supabaseKey:'public-key'};
const media={audioId:'kodik-42',providerRef:{season:2,ordinal:7},sources:[]};
const signed='https://project.supabase.co/functions/v1/anime-source?stream=1&p=signed-payload&s=signature';

test('Kodik resolves in the working region while retaining episode, voice and signed proxy URLs',async()=>{
 let calls=0;
 const result=await refreshKodikMedia(media,config,'mal-123',19,{fetcher:async(url,options)=>{
  calls++;
  const endpoint=new URL(url);
  assert.equal(endpoint.origin,config.supabaseUrl);
  assert.equal(endpoint.pathname,'/functions/v1/anime-source');
  assert.equal(endpoint.searchParams.get('forceFunctionRegion'),'us-east-1');
  assert.deepEqual(JSON.parse(options.body),{action:'kodik-video',id:'mal-123',episode:19,audio:'kodik-42',season:2,ordinal:7});
  assert.equal(options.headers.apikey,'public-key');
  assert.equal(options.headers['x-region'],undefined); // no extra CORS/preflight headers
  return Response.json({audioId:'kodik-42',proxied:true,url:signed,sources:[{quality:720,url:signed}]});
 }});
 assert.equal(calls,1);
 assert.equal(result.url,signed);
 assert.equal(result.sources[0].url,signed);
 assert.equal(result.stream,true);
});

test('regional routing still rejects unsigned external streams and wrong voices',async()=>{
 for(const fresh of [
  {audioId:'kodik-42',proxied:true,sources:[{quality:720,url:'https://external.test/video.m3u8'}]},
  {audioId:'kodik-99',proxied:true,sources:[{quality:720,url:signed}]}
 ])await assert.rejects(refreshKodikMedia(media,config,'mal-123',19,{fetcher:async()=>Response.json(fresh)}),/proxyUnavailable|audioUnavailable/);
});
