import test from 'node:test';
import assert from 'node:assert/strict';
import {createUiCache,displayState} from '../src/ui-cache.js';
import {createReadCache} from '../src/read-cache.js';
import {createAvatarLoader} from '../src/profile.js';
import {applyOperation,normalize} from '../src/state.js';
const storage=()=>{const map=new Map();return {getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};};
test('display cache isolates accounts, preserves all memberships and excludes media manifests',()=>{
 const cache=createUiCache(storage());const original=normalize({entries:{a:{favorite:true,anime:{id:'a',title:'A',image:'poster.webp',episodeManifest:Array(1000).fill({url:'secret-stream'})}}},collections:[{id:'custom',items:['a']}],progress:{a:{id:'a',time:36,episode:2}}});
 const before=structuredClone(original);cache.saveState('alice',original);
 assert.equal(cache.state('bob'),null);assert.equal(cache.state('alice').entries.a.anime.image,'poster.webp');assert.equal(cache.state('alice').entries.a.anime.episodeManifest,undefined);
 assert.deepEqual(cache.state('alice').collections,original.collections);assert.deepEqual(original,before);
 const pending={type:'entry',id:'a',patch:{favorite:false}};
 const projected=applyOperation(cache.state('alice'),pending);assert.equal(projected.entries.a.favorite,false);assert.equal(cache.state('alice').entries.a.favorite,true);
 cache.remove('alice');assert.equal(cache.state('alice'),null);
});
test('expired, corrupt and quota-limited caches fail softly without touching source data',()=>{
 let time=0;const cache=createUiCache(storage(),{now:()=>time});cache.saveState('a',normalize({}));time=8*86400000;assert.equal(cache.state('a'),null);
 const broken=createUiCache({getItem:()=>'{broken',setItem:()=>{throw Error('quota');}});assert.equal(broken.state('a'),null);assert.doesNotThrow(()=>broken.saveState('a',normalize({})));
});
test('poster metadata is bounded, deduplicated, and signed images expire per account and path',()=>{
 let time=0;const cache=createUiCache(storage(),{now:()=>time});cache.saveCards('a',Array.from({length:800},(_,i)=>({id:String(i),image:'original-'+i,episodeManifest:[1,2]})));
 assert.equal(cache.cards('a').length,600);assert.equal(cache.cards('a')[0].episodeManifest,undefined);assert.deepEqual(cache.cards('b'),[]);
 cache.saveImage('a','avatar','signed',100);assert.equal(cache.image('a','avatar').url,'signed');assert.equal(cache.image('b','avatar'),null);assert.equal(cache.image('a','other'),null);time=101;assert.equal(cache.image('a','avatar'),null);
});
test('avatar appears synchronously from disk without another signing request',async()=>{
 const cache=createUiCache(storage());cache.saveImage('a','photo','cached-url',Date.now()+60000);let shown='',calls=0;
 const loader=createAvatarLoader({cache,identity:()=>({uid:'a',path:'photo'}),sign:async()=>{calls++;return 'fresh';},display:url=>shown=url,schedule:()=>0,cancel:()=>{}});
 const request=loader.refresh();assert.equal(shown,'cached-url');await request;assert.equal(calls,0);
 loader.reset();assert.equal(shown,'');
});
test('read cache coalesces requests and never revives invalidated writes',async()=>{
 let calls=0,release,time=0;const cache=createReadCache(()=>{calls++;return new Promise(r=>release=r);},{now:()=>time,ttl:10});
 const first=cache.get('a'),second=cache.get('a');await Promise.resolve();assert.equal(calls,1);cache.invalidate('a');release('old');assert.deepEqual(await Promise.all([first,second]),['old','old']);
 const next=cache.get('a');await Promise.resolve();assert.equal(calls,2);release('new');assert.equal(await next,'new');assert.equal(await cache.get('a'),'new');assert.equal(calls,2);
 time=11;const expired=cache.get('a');await Promise.resolve();assert.equal(calls,3);release('latest');await expired;
});
test('failed reads can retry and one account never receives another account response',async()=>{
 let calls=0;const cache=createReadCache(async key=>{if(++calls===1)throw Error('offline');return key;});await assert.rejects(cache.get('a'));assert.equal(await cache.get('a'),'a');assert.equal(await cache.get('b'),'b');
});
test('session view paints cached lists before network completes and never sends cached data to save',async()=>{
 const {readFile}=await import('node:fs/promises'),{runInNewContext}=await import('node:vm');
 const source=await readFile(new URL('../src/app.js',import.meta.url),'utf8');
 const code=source.slice(source.indexOf('async function handleSession('),source.indexOf('function collectionDialog('));
 const cache=createUiCache(storage());cache.saveState('alice',normalize({entries:{a:{favorite:true,anime:{id:'a',title:'Saved',image:'poster'}}}}));cache.saveCards('alice',[{id:'a',title:'Saved',image:'poster'}]);
 const drafts=[{type:'entry',id:'a',patch:{favorite:false}}],paint=[];let release;
 const context={uiCache:cache,accounts:{remember(){}},user:null,current:null,authResolved:false,sourceGeneration:0,authGeneration:0,unifiedProfileKey:'',profileDraft:{clear(){}},avatarLoader:{reset(){}},bannerLoader:{reset(){}},socialModule:null,startNotifications(){},defaults:()=>normalize({}),normalize,read:(_,fallback)=>fallback,draftKey:()=>'',operations:[],ready:false,dataError:false,avatarUrl:'',syncFailure:false,cachedProfileVisible:false,displayCards:new Map(),cardCacheTimer:null,clearTimeout(){},libraryKey:'',libraryCards:new Map(),planKey:'',planCards:new Map(),applyOperation,byId:()=>null,registerAnime(){},avatarLoad:async()=>{},page:'library',render(){paint.push({user:context.user?.id,state:context.state,ready:context.ready});},loadProfile:()=>new Promise(r=>release=r)};
 context.read=(key,fallback)=>key==='draft'?drafts:fallback;context.draftKey=()=> 'draft';
 runInNewContext(code,context);const pending=context.handleSession({user:{id:'alice'}},'INITIAL_SESSION');
 assert.equal(paint[0].state.entries.a.anime.image,'poster');assert.equal(paint[0].state.entries.a.favorite,false);assert.equal(paint[0].ready,false);assert.equal(cache.state('alice').entries.a.favorite,true);assert.equal(context.operations.length,0);release();await pending;
 const switched=context.handleSession({user:{id:'bob'}},'SIGNED_IN');assert.deepEqual(Object.keys(paint.at(-1).state.entries),[]);assert.equal(context.displayCards.size,0);release();await switched;
});
