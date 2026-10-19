import test from 'node:test';
import assert from 'node:assert/strict';
import {createProfileDraft,createAvatarLoader} from '../src/profile.js';

test('unfinished profile fields survive redraws and never leak between accounts',()=>{
  const draft=createProfileDraft();
  draft.set('alice','bio','Two\nlines');draft.set('alice','name','Alice');
  draft.set('alice','avatar','not-a-profile-field');
  assert.deepEqual(draft.get('alice'),{bio:'Two\nlines',name:'Alice'});
  assert.deepEqual(draft.get('bob'),{});
  draft.set('bob','name','Bob');
  assert.deepEqual(draft.get('alice'),{});
  draft.clear();assert.deepEqual(draft.get('bob'),{});
});
test('old avatar requests cannot overwrite a new photo or a signed-out account',async()=>{
  let who={uid:'alice',path:'old'},shown;const pending=[];
  const loader=createAvatarLoader({identity:()=>who,sign:()=>new Promise(resolve=>pending.push(resolve)),display:url=>shown=url,schedule:()=>0,cancel:()=>{}});
  const old=loader.refresh();who={uid:'alice',path:'new'};
  const fresh=loader.refresh();pending[1]('new-url');await fresh;
  pending[0]('old-url');await old;assert.equal(shown,'new-url');
  const late=loader.refresh({force:true});who={};loader.reset();pending[2]('private-url');await late;
  assert.equal(shown,'');
});
test('avatar links renew before expiry and retry transient failures',async()=>{
  let shown,delay,retry,fail=false,cancelled=[];
  const loader=createAvatarLoader({identity:()=>({uid:'alice',path:'photo'}),sign:async()=>{if(fail)throw Error('offline');return 'signed-url';},display:url=>shown=url,schedule:(fn,ms)=>{retry=fn;delay=ms;return 12;},cancel:id=>cancelled.push(id)});
  await loader.refresh();assert.equal(shown,'signed-url');assert.equal(delay,50*60*1000);
  fail=true;await retry();assert.equal(delay,60000);assert.equal(shown,'signed-url');
  fail=false;await retry();assert.equal(shown,'signed-url');
  loader.reset();assert.ok(cancelled.includes(12));assert.equal(shown,'');
});

test('visibility refreshes share requests and keep a cached avatar stable',async()=>{
 let resolve,count=0,shown=0,who={uid:'alice',path:'one'};
 const loader=createAvatarLoader({identity:()=>who,sign:()=>{count++;return new Promise(r=>resolve=r)},display:()=>shown++,schedule:()=>0,cancel:()=>{}});
 const a=loader.refresh(),b=loader.refresh();assert.equal(count,1);resolve('url');await Promise.all([a,b]);
 await loader.refresh();await loader.refresh();assert.equal(count,1);assert.equal(shown,1);
 who={uid:'alice',path:'two'};const c=loader.refresh();assert.equal(count,2);resolve('new');await c;assert.equal(shown,3);
});
