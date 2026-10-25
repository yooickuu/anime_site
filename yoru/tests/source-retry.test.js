import test from 'node:test';import assert from 'node:assert/strict';
import {retrySourceRequest} from '../src/source-retry.js';
test('resolver succeeds after three silent retries; final outage is reported once',async()=>{
 let calls=0;const pauses=[];
 assert.equal(await retrySourceRequest(async()=>{if(++calls<4)throw Error('providerError');return 'video';},{wait:async ms=>pauses.push(ms)}),'video');
 assert.equal(calls,4);assert.deepEqual(pauses,[1500,1500,1500]);
 calls=0;await assert.rejects(retrySourceRequest(async()=>{calls++;throw Error('providerError');},{wait:async()=>{}}));assert.equal(calls,4);
});
test('missing audio is not retried; old episode retry stops after navigation',async()=>{
 let calls=0;await assert.rejects(retrySourceRequest(async()=>{calls++;throw Error('audioUnavailable');}),/audioUnavailable/);assert.equal(calls,1);
 let active=true;calls=0;await assert.rejects(retrySourceRequest(async()=>{calls++;throw Error('providerError');},{current:()=>active,wait:async()=>{active=false;}}),/stalePlayback/);assert.equal(calls,1);
});
