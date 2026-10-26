import test from 'node:test';
import assert from 'node:assert/strict';
import {h,episodeKey,mergeMessages,member,scope} from '../src/social/common.js';
import {dimensions,validateImage} from '../src/social/media.js';
import {PUBLIC_FIELDS} from '../src/social/api.js';
test('episode comments use manifest ordinal and season, not UI index',()=>{assert.deepEqual(episodeKey({id:'mal-1',episodeManifest:[{season:0,ordinal:1},{season:2,ordinal:12}]},2),{anime:'mal-1',season:2,episode:12});});
test('social rendering escapes names, body, titles and attribute values',()=>{assert.equal(h('<img src=x onerror="alert(1)">&'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&amp;');assert.ok(!/email|preferences|metadata|data\b/.test(PUBLIC_FIELDS));});
test('guest and anonymous sessions open auth, registered sessions pass',()=>{let n=0;const ctx={login:()=>n++,user:()=>null};assert.equal(member(ctx),false);ctx.user=()=>({id:'anon',is_anonymous:true});assert.equal(member(ctx),false);ctx.user=()=>({id:'member'});assert.equal(member(ctx),true);assert.equal(n,2);});
test('navigation and account switch invalidate pending requests',()=>{let user={id:'a'};const root={isConnected:true};const life=scope(root,{user:()=>user});assert.equal(life.live(),true);user={id:'b'};assert.equal(life.live(),false);life.dispose();assert.equal(life.signal.aborted,true);});
test('message poll merges idempotently, sorts, and limits memory to 120 records',()=>{const rows=Array.from({length:180},(_,i)=>({id:String(i),created_at:new Date(1700000000000+i*1000).toISOString()}));const merged=mergeMessages(rows.slice(0,100),rows.slice(60));assert.equal(merged.length,120);assert.equal(merged[0].id,'60');assert.equal(new Set(merged.map(r=>r.id)).size,120);});
test('large compressed images are rejected before canvas decoding',()=>{const bytes=new Uint8Array(24),d=new DataView(bytes.buffer);d.setUint32(0,0x89504e47);d.setUint32(16,10000);d.setUint32(20,10000);assert.deepEqual(dimensions(bytes),[10000,10000]);assert.throws(()=>validateImage({type:'image/png',size:2000},...dimensions(bytes)),/invalid_image/);assert.throws(()=>validateImage({type:'image/svg+xml',size:100},100,100));assert.doesNotThrow(()=>validateImage({type:'image/jpeg',size:1000000},4000,3000));assert.doesNotThrow(()=>validateImage({type:'image/jpeg',size:2000000},4032,3024));});

test('same connected root is invalidated when its episode or route changes',()=>{let active=true;const life=scope({isConnected:true},{user:()=>null,active:()=>active});assert.equal(life.live(),true);active=false;assert.equal(life.live(),false);life.dispose();});
