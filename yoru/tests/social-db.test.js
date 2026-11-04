import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
const A='00000000-0000-4000-8000-000000000001',B='00000000-0000-4000-8000-000000000002',E='00000000-0000-4000-8000-000000000003';
async function as(uid,sql,params=[],anonymous=false){
 await db.exec(`set role ${uid?'authenticated':'anon'}`);
 await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.anonymous',$2,false)",[uid||'',String(anonymous)]);
 try{return (await db.query(sql,params)).rows;}finally{await db.exec('reset role');}
}
before(async()=>{
 await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth; create schema storage;
 create table auth.users(id uuid primary key,email text);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('is_anonymous',current_setting('request.jwt.claim.anonymous',true)='true') $$;
 grant usage on schema auth to anon,authenticated;
 create table public.yoru_nicknames(user_id uuid primary key references auth.users(id) on delete cascade,nickname text);
 create function public.yoru_nickname_key(value text) returns text language sql immutable as $$ select lower(btrim(value)) $$;
 create table public.yoru_state(user_id uuid primary key references auth.users(id) on delete cascade,data jsonb default '{}');
 alter table public.yoru_state enable row level security; grant select,insert,update on public.yoru_state to authenticated;
 create policy own on public.yoru_state to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,primary key(bucket_id,name));
 alter table storage.objects enable row level security; grant usage on schema storage to anon,authenticated;grant select,insert,delete on storage.objects to authenticated;
 insert into auth.users values('${A}','alice@private.test'),('${B}','bob@private.test'),('${E}','eve@private.test');
 insert into public.yoru_nicknames values('${A}','Alice'),('${B}','Bob'),('${E}','Eve');`);
 for(let i=0;i<2;i++)for(const file of ['social-01.sql','social-02.sql'])await db.exec(await readFile('supabase/'+file,'utf8'));
});
after(()=>db.close());
test('guests see only public fields; private state/email and writes stay inaccessible',async()=>{
 const rows=await as(null,'select * from yoru_public_profiles');assert.equal(rows.length,3);assert.ok(rows.every(r=>!JSON.stringify(r).includes('@')&&!('email'in r)&&!r.history_public));
 await assert.rejects(as(null,'select * from yoru_state'),/permission/);await assert.rejects(as(null,'select email from auth.users'),/permission/);
 await assert.rejects(as(null,"select yoru_social_comment('mal-1',1,1,'guest',null)"),/permission/);
 await assert.rejects(as(A,"select yoru_social_comment('mal-1',1,1,'anon',null)",[],true),/login_required/);
 await assert.rejects(as(E,"update yoru_public_profiles set bio='spoof' where user_id=$1",[A]),/permission/);
});
test('history is opt-in, stats are derived, and visibility can be revoked',async()=>{
 const state={entries:{a:{rating:8},b:{rating:10}},statuses:[1,2,3,4,5,6],preferences:{email:'private',token:'private'},progress:{x:{id:'mal-1',ordinal:2,season:1,completed:true,updated:1770000000000}}};
 await as(A,'insert into yoru_state(user_id,data) values($1,$2)',[A,state]);assert.equal((await as(null,'select * from yoru_public_history')).length,0);
 await as(A,"select yoru_social_save_profile('Hello',true,null,null)");
 assert.deepEqual((await as(null,'select stats from yoru_public_profiles where user_id=$1',[A]))[0].stats,{saved:2,lists:6,completed:1,rating:9});
 assert.equal((await as(null,'select * from yoru_public_history')).length,1);
 await as(A,"select yoru_social_save_profile('Hello',false,null,null)");assert.equal((await as(null,'select * from yoru_public_history')).length,0);
});
test('episode isolation, author edits and soft delete preserve replies',async()=>{
 const id=(await as(A,"select yoru_social_comment('mal-100',1,2,'Parent',null) id"))[0].id;
 await assert.rejects(as(B,"select yoru_social_comment('mal-100',1,3,'wrong',$1)",[id]),/invalid_parent/);
 const reply=(await as(B,"select yoru_social_comment('mal-100',1,2,'Reply',$1) id",[id]))[0].id;
 await assert.rejects(as(E,"select yoru_social_edit_comment($1,'spoof')",[id]),/comment_not_owned/);
 await as(A,"select yoru_social_edit_comment($1,'Edited')",[id]);await as(A,'select yoru_social_edit_comment($1,null)',[id]);
 const rows=await as(null,"select body,deleted_at from yoru_comments where anime_id='mal-100' and episode=2 order by created_at");assert.equal(rows[0].body,'');assert.ok(rows[0].deleted_at);assert.equal(rows[1].body,'Reply');
 await assert.rejects(as(B,"select yoru_social_comment('mal-100',1,2,'deep',$1)",[reply]),/invalid_parent/);
});
let room;
test('recipient alone accepts friendship, unique pair and DM',async()=>{
 await assert.rejects(as(A,"select yoru_social_room(array[$1::uuid],'')",[B]),/friends_only/);
 await as(A,"select yoru_social_friend($1,'request')",[B]);await as(B,"select yoru_social_friend($1,'request')",[A]);
 await assert.rejects(as(A,"select yoru_social_friend($1,'accept')",[B]),/request_not_found/);await as(B,"select yoru_social_friend($1,'accept')",[A]);
 assert.equal((await as(A,'select * from yoru_friendships')).length,1);
 room=(await as(A,"select yoru_social_room(array[$1::uuid],'') id",[B]))[0].id;
 assert.equal((await as(B,"select yoru_social_room(array[$1::uuid],'') id",[A]))[0].id,room);
});
test('nonmembers cannot read/write messages, membership or photos',async()=>{
 await as(A,"select yoru_social_message($1,'Private hello')",[room]);assert.equal((await as(B,'select * from yoru_messages')).length,1);
 for(const table of ['yoru_messages','yoru_conversations','yoru_chat_members'])assert.equal((await as(E,'select * from '+table)).length,0);
 await assert.rejects(as(null,'select * from yoru_messages'),/permission/);await assert.rejects(as(E,"select yoru_social_message($1,'Intruder')",[room]),/members_only/);
 const path=`${room}/${A}/photo.webp`;await as(A,"insert into storage.objects(bucket_id,name) values('social-chat-media',$1)",[path]);
 assert.equal((await as(B,'select * from storage.objects where name=$1',[path])).length,1);assert.equal((await as(E,'select * from storage.objects where name=$1',[path])).length,0);
 await assert.rejects(as(E,"insert into storage.objects(bucket_id,name) values('social-chat-media',$1)",[`${room}/${E}/bad.webp`]),/row-level security/);
 await assert.rejects(as(B,"select yoru_social_message($1,'',$2)",[room,path]),/invalid_image/);await as(A,"select yoru_social_message($1,'',$2,'mal-1')",[room,path]);
});
test('group owner permissions and membership revocation',async()=>{
 const group=(await as(A,"select yoru_social_room(array[$1::uuid],'Anime night') id",[B]))[0].id;
 await assert.rejects(as(B,"select yoru_social_manage_room($1,'rename',null,'Hijack')",[group]),/owner_only/);
 await as(A,"select yoru_social_manage_room($1,'rename',null,'Friends')",[group]);await as(A,"select yoru_social_message($1,'group secret')",[group]);
 await as(A,"select yoru_social_manage_room($1,'remove',$2)",[group,B]);assert.equal((await as(B,'select * from yoru_messages where room_id=$1',[group])).length,0);
 await assert.rejects(as(B,"select yoru_social_message($1,'after removal')",[group]),/members_only/);
});
test('message retry idempotency and public image ownership',async()=>{
 const id='10000000-0000-4000-8000-000000000001';for(let i=0;i<2;i++)await as(A,"select yoru_social_message($1,'once',null,null,$2)",[room,id]);assert.equal((await as(A,'select * from yoru_messages where id=$1',[id])).length,1);
 await as(A,"insert into storage.objects(bucket_id,name) values('social-profile-media',$1)",[`${A}/avatar.webp`]);await assert.rejects(as(B,"select yoru_social_save_profile('',false,$1,null)",[`${A}/avatar.webp`]),/invalid_image/);
});

test('cleanup RPC is service-only and malformed private state cannot break saving',async()=>{
 await assert.rejects(as(A,'select * from yoru_social_owned_media($1)',[B]),/permission/);
 await as(A,'update yoru_state set data=$2 where user_id=$1',[A,{entries:{a:{rating:'not-a-number'}},progress:{},statuses:[]}]);
 await as(A,'update yoru_state set data=$2 where user_id=$1',[A,{entries:[],progress:[],statuses:[]}]);
 assert.ok((await as(A,'select * from yoru_state where user_id=$1',[A])).length);
});
test('comments reject empty text and enforce a database rate limit',async()=>{
 await assert.rejects(as(E,"select yoru_social_comment('mal-2',1,1,'  ',null)"),/invalid_comment/);
 for(let i=0;i<5;i++)await as(E,"select yoru_social_comment('mal-2',1,1,'valid',null)");
 await assert.rejects(as(E,"select yoru_social_comment('mal-2',1,1,'sixth',null)"),/rate_limited/);
});

test('unified profile migration preserves privacy and exposes only viewing dates',async()=>{
 for(let i=0;i<2;i++)await db.exec(await readFile('supabase/social-03.sql','utf8'));
 const data={entries:{a:{rating:8}},statuses:[1,2],preferences:{bio:'Main profile',avatar:A+'/main.png',historyPublic:true},progress:{a:{id:'mal-1',ordinal:19,season:3,completed:true,updated:1770000000000}}};
 await as(A,"insert into storage.objects(bucket_id,name) values('social-profile-media',$1)",[A+'/main.png']);
 await as(A,'update yoru_state set data=$2 where user_id=$1',[A,data]);
 const p=(await as(null,'select bio,avatar_path,stats from yoru_public_profiles where user_id=$1',[A]))[0];
 assert.equal(p.bio,'Main profile');assert.equal(p.avatar_path,A+'/main.png');assert.equal(p.stats.completed,1);
 await assert.rejects(as(null,'select * from yoru_public_history'),/permission/);
 assert.equal((await as(B,'select * from yoru_public_history where user_id=$1',[A])).length,0);
 const history=await as(null,'select * from yoru_social_history($1)',[A]);assert.equal(history.length,1);assert.deepEqual(Object.keys(history[0]).sort(),['anime_id','watched_date']);
 await assert.rejects(as(A,"select yoru_social_save_profile('Second copy',true,null,null)"),/permission/);
 await as(A,"update yoru_state set data=jsonb_set(data,'{preferences,historyPublic}','false') where user_id=$1",[A]);
 assert.equal((await as(null,'select * from yoru_social_history($1)',[A])).length,0);
 await as(A,'select yoru_social_sync_profile()');
});

test('unread counts rooms, excludes own messages, and read cursors cannot swallow newer messages',async()=>{
 for(let i=0;i<2;i++)await db.exec(await readFile('supabase/social-04.sql','utf8'));
 const first=(await as(A,"select yoru_social_message($1,'Unread one') id",[room]))[0].id;
 assert.equal((await as(B,'select * from yoru_social_unread()')).filter(x=>x.room_id===room).length,1);
 const second=(await as(A,"select yoru_social_message($1,'Unread two') id",[room]))[0].id;
 await as(B,'select yoru_social_mark_read($1,$2)',[room,first]);
 assert.equal((await as(B,'select * from yoru_social_unread()')).filter(x=>x.room_id===room).length,1);
 await as(B,'select yoru_social_mark_read($1,$2)',[room,second]);
 assert.equal((await as(B,'select * from yoru_social_unread()')).length,0);
 await as(B,'select yoru_social_mark_read($1,$2)',[room,first]);assert.equal((await as(B,'select * from yoru_social_unread()')).length,0);
 await assert.rejects(as(E,'select yoru_social_mark_read($1,$2)',[room,second]),/members_only/);
 await assert.rejects(as(null,'select * from yoru_social_unread()'),/permission/);
 assert.equal((await as(E,'select * from yoru_social_unread()')).length,0);
});

test('permanent comment deletion cascades replies, preserves siblings and enforces ownership',async()=>{
 for(let i=0;i<2;i++)await db.exec(await readFile('supabase/social-05.sql','utf8'));
 assert.equal((await as(null,"select * from yoru_comments where anime_id='mal-100'")).length,0);
 const parent=(await as(A,"select yoru_social_comment('mal-999',1,1,'parent',null) id"))[0].id;
 const reply=(await as(B,"select yoru_social_comment('mal-999',1,1,'reply',$1) id",[parent]))[0].id;
 const sibling=(await as(A,"select yoru_social_comment('mal-999',1,1,'sibling',null) id"))[0].id;
 await assert.rejects(as(B,'select yoru_social_edit_comment($1,null)',[parent]),/comment_not_owned/);
 await assert.rejects(as(null,'select yoru_social_edit_comment($1,null)',[parent]),/permission/);
 await as(A,'select yoru_social_edit_comment($1,null)',[parent]);
 assert.equal((await as(null,'select * from yoru_comments where id in ($1,$2)',[parent,reply])).length,0);
 assert.equal((await as(null,'select * from yoru_comments where id=$1',[sibling])).length,1);
});

test('removing a chat affects only the current member; leaving a group revokes access',async()=>{
 await db.exec(await readFile('supabase/social-05.sql','utf8'));
 await assert.rejects(as(E,'select yoru_social_remove_chat($1)',[room]),/members_only/);
 await as(B,'select yoru_social_remove_chat($1)',[room]);
 assert.equal((await as(B,'select * from yoru_conversations where id=$1',[room])).length,0);
 assert.equal((await as(A,'select * from yoru_conversations where id=$1',[room])).length,1);
 await as(A,"select yoru_social_message($1,'new after removal')",[room]);
 assert.equal((await as(B,'select * from yoru_conversations where id=$1',[room])).length,1);
 const group=(await as(A,"select yoru_social_room(array[$1::uuid],'Leave test') id",[B]))[0].id;
 await as(A,'select yoru_social_remove_chat($1)',[group]);
 assert.equal((await as(A,'select * from yoru_conversations where id=$1',[group])).length,0);
 assert.equal((await as(B,'select owner_id from yoru_conversations where id=$1',[group]))[0].owner_id,B);
});

test('activity migration is repeatable and Realtime policies are private room scoped',async()=>{
 await db.exec(`create schema realtime;create table realtime.messages(extension text);alter table realtime.messages enable row level security;grant usage on schema realtime to authenticated;grant select,insert on realtime.messages to authenticated;
 create function realtime.topic() returns text language sql stable as $$select current_setting('realtime.topic',true)$$;
 create table realtime.signals(payload jsonb,event text,topic text,private boolean);
 create function realtime.send(payload jsonb,event text,topic text,private boolean) returns void language sql as $$insert into realtime.signals values(payload,event,topic,private)$$;`);
 for(let i=0;i<2;i++)await db.exec(await readFile('supabase/social-06.sql','utf8'));
 await db.query("select set_config('realtime.topic',$1,false)",['yomiku:room:'+room]);
 await as(A,"insert into realtime.messages values('presence')");
 await assert.rejects(as(E,"insert into realtime.messages values('presence')"),/row-level/);
 await assert.rejects(as(A,"insert into realtime.messages values('broadcast')"),/row-level/);
 assert.equal((await as(B,'select * from realtime.messages')).length,1);
 assert.equal((await as(E,'select * from realtime.messages')).length,0);
 await db.query("select set_config('realtime.topic',$1,false)",['other:'+room]);
 assert.equal((await as(A,'select * from realtime.messages')).length,0);
});
test('watch seconds are owned, cumulative idempotent and limited across concurrent sessions',async()=>{
 const session='90000000-0000-4000-8000-000000000001';
 const sync=async(uid,seconds,night=0)=>(await as(uid,'select yoru_activity_sync($1,$2,$3) data',[session,seconds,night]))[0].data;
 assert.equal((await sync(A,30)).seconds,30);
 assert.equal((await sync(A,30)).seconds,30);
 assert.equal((await sync(A,10)).seconds,30);
 await db.query("update yoru_watch_metrics set credited_at=now()-interval '35 seconds' where user_id=$1",[A]);
 assert.equal((await sync(A,60,10)).seconds,60);
 assert.equal((await sync(B,5)).seconds,5);
 assert.equal((await as(A,'select seconds from yoru_watch_metrics')).length,1);
 await assert.rejects(as(A,'update yoru_watch_metrics set seconds=9999'),/permission/);
 await assert.rejects(as(null,'select yoru_activity_sync()'),/permission/);
 await assert.rejects(as(A,'select yoru_activity_sync()',[],true),/login_required/);
 await assert.rejects(sync(A,1,2),/invalid_activity/);
 const huge=await sync(A,1000000);assert.ok(huge.seconds<=61);
 assert.ok(huge.badges.message&&huge.badges.friend&&huge.badges.comment);
 await db.query("update yoru_watch_metrics set seconds=36000,night_seconds=600 where user_id=$1",[A]);
 const badge=(await as(A,'select yoru_activity_sync() data'))[0].data;
 assert.ok(badge.badges.hour_10&&badge.badges.night);assert.equal(badge.seconds,36000);
});
test('replies use the same room, retry is idempotent and broadcasts contain IDs only',async()=>{
 const parent=(await as(A,"select yoru_social_message_v2($1,'reply parent') id",[room]))[0].id;
 const id='80000000-0000-4000-8000-000000000001';
 for(let i=0;i<2;i++)await as(B,"select yoru_social_message_v2($1,'answer',null,null,$2,$3)",[room,id,parent]);
 assert.equal((await as(A,'select reply_to from yoru_messages where id=$1',[id]))[0].reply_to,parent);
 assert.equal((await as(A,'select * from yoru_messages where id=$1',[id])).length,1);
 const group=(await as(A,"select yoru_social_room(array[$1::uuid],'Other') id",[B]))[0].id;
 await assert.rejects(as(A,"select yoru_social_message_v2($1,'wrong room',null,null,gen_random_uuid(),$2)",[group,parent]),/invalid_reply/);
 await assert.rejects(as(E,"select yoru_social_message_v2($1,'intruder')",[room]),/members_only/);
 await as(A,'select yoru_social_mark_read($1,$2)',[room,id]);
 const hints=(await db.query('select * from realtime.signals')).rows;
 assert.ok(hints.length>=3);assert.ok(hints.every(h=>h.private&&!JSON.stringify(h.payload).includes('answer')));
 assert.ok(hints.some(h=>h.event==='read'));assert.ok(hints.some(h=>h.payload.id===id));
});

test('compact upgrade records actual read time once and retains original cursors/security',async()=>{
 for(let i=0;i<2;i++)await db.exec(await readFile('supabase/social-07.sql','utf8'));
 const id=(await as(A,"select yoru_social_message_v2($1,'Read timestamp') id",[room]))[0].id;
 await db.query("update yoru_messages set created_at=now()-interval '3 hours' where id=$1",[id]);
 // Reset only this disposable fixture's cursor so the old message is unread.
 await db.query("update yoru_chat_members set last_read_at='-infinity',last_read_id='00000000-0000-0000-0000-000000000000',last_seen_at=null where room_id=$1 and user_id=$2",[room,B]);
 await as(B,'select yoru_social_mark_read($1,$2)',[room,id]);
 const first=(await as(B,'select last_seen_at,last_read_at from yoru_chat_members where room_id=$1 and user_id=$2',[room,B]))[0];
 assert.ok(Date.parse(first.last_seen_at)-Date.parse(first.last_read_at)>2.9*3600000);
 await as(B,'select yoru_social_mark_read($1,$2)',[room,id]);assert.deepEqual((await as(B,'select last_seen_at,last_read_at from yoru_chat_members where room_id=$1 and user_id=$2',[room,B]))[0],first);
 await assert.rejects(as(E,'select yoru_social_mark_read($1,$2)',[room,id]),/members_only/);
});
test('new achievement milestones unlock while previous awards remain and private progress survives history expiry',async()=>{
 const now=Date.now(),data={entries:Object.fromEntries(Array.from({length:100},(_,i)=>['mal-'+i,{status:'completed'}])),progress:Object.fromEntries(Array.from({length:2000},(_,i)=>['ep-'+i,{id:'mal-'+i,completed:true,time:500,updated:now-20*86400000}]))};
 data.preferences={historyPublic:true};data.progress.fresh={id:'mal-9000',completed:false,time:50,updated:now};
 await as(A,'update yoru_state set data=$1 where user_id=$2',[data,A]);
 await db.query('update yoru_watch_metrics set seconds=900000 where user_id=$1',[A]);
 const badges=(await as(A,'select yoru_activity_sync() data'))[0].data.badges;
 for(const id of ['episode_250','episode_1000','episode_2000','hour_5','hour_25','hour_250','title_5','title_25','title_100','message','friend'])assert.ok(badges[id],id);
 const history=await as(null,'select * from yoru_social_history($1)',[A]);assert.deepEqual(history.map(h=>h.anime_id),['mal-9000']);
 const unchanged=(await as(A,'select data from yoru_state where user_id=$1',[A]))[0].data;assert.deepEqual(unchanged,data);
});

test('watch rooms restrict host broadcasts, snapshots and chat to registered room members',async()=>{
 for(let i=0;i<2;i++)await db.exec(await readFile('supabase/social-08.sql','utf8'));
 await assert.rejects(as(null,"select yoru_watch_create('mal-1',1)"),/permission/);
 await assert.rejects(as(A,"select yoru_watch_create('mal-1',1)",[],true),/login_required/);
 const r=(await as(A,"select yoru_watch_create('mal-1',1) r"))[0].r;
 await assert.rejects(as(E,'select yoru_watch_snapshot($1)',[r.id]),/room_unavailable/);
 await as(B,'select yoru_watch_join($1)',[r.id]);
 await db.query("select set_config('realtime.topic',$1,false)",['yomiku:watch:'+r.id]);
 await as(A,"insert into realtime.messages values('broadcast')");
 await as(B,"insert into realtime.messages values('presence')");
 await assert.rejects(as(B,"insert into realtime.messages values('broadcast')"),/row-level/);
 await assert.rejects(as(E,"insert into realtime.messages values('presence')"),/row-level/);
 await assert.rejects(as(B,"select yoru_watch_state($1,'mal-2',2,300,true,1,2)",[r.id]),/host_only/);
 await as(A,"select yoru_watch_state($1,'mal-2',2,300,true,1,2)",[r.id]);
 await as(A,"select yoru_watch_state($1,'mal-1',1,0,false,1,1)",[r.id]);
 assert.equal((await as(B,'select yoru_watch_snapshot($1) r',[r.id]))[0].r.anime_id,'mal-2');
 await assert.rejects(as(A,"select yoru_watch_state($1,'mal-2',2,'NaN',true,1,3)",[r.id]),/check constraint/);
 const mid='91000000-0000-4000-8000-000000000001';
 for(let i=0;i<2;i++)await as(B,"select yoru_watch_message($1,'Hi',$2)",[r.id,mid]);
 const messages=(await as(A,'select yoru_watch_messages($1) m',[r.id]))[0].m;assert.equal(messages.length,1);assert.equal(messages[0].nickname,'Bob');assert.ok(!JSON.stringify(messages).includes('@'));
 await assert.rejects(as(E,'select yoru_watch_messages($1)',[r.id]),/members_only/);
 await as(B,'select yoru_watch_leave($1)',[r.id]);await assert.rejects(as(B,'select yoru_watch_snapshot($1)',[r.id]),/room_unavailable/);
 await as(B,'select yoru_watch_join($1)',[r.id]);await as(A,'select yoru_watch_leave($1)',[r.id]);
 await assert.rejects(as(B,'select yoru_watch_snapshot($1)',[r.id]),/room_unavailable/);
 await assert.rejects(as(A,'select * from yoru_watch_rooms'),/permission/);
});
test('public lists and badges are opt-in, paginated and never return private account state',async()=>{
 const before=(await as(A,'select data from yoru_state where user_id=$1',[A]))[0].data;
 assert.equal((await as(null,'select yoru_social_public_lists($1) d',[A]))[0].d.visible,false);
 assert.equal((await as(null,'select yoru_social_public_badges($1) d',[A]))[0].d.visible,false);
 await as(A,"select yoru_social_visibility('lists',true)");await as(A,"select yoru_social_visibility('badges',true)");
 const lists=(await as(null,"select yoru_social_public_lists($1,'all',0) d",[A]))[0].d;
 assert.equal(lists.total,100);assert.equal(lists.items.length,40);assert.deepEqual(Object.keys(lists.items[0]),['anime_id']);
 assert.equal((await as(null,"select yoru_social_public_lists($1,'all',80) d",[A]))[0].d.items.length,20);
 assert.ok((await as(null,'select yoru_social_public_badges($1) d',[A]))[0].d.badges.hour_250);
 await as(A,"select yoru_social_visibility('lists',false)");await as(A,"select yoru_social_visibility('badges',false)");
 assert.equal((await as(B,'select yoru_social_public_lists($1) d',[A]))[0].d.visible,false);
 assert.equal((await as(B,'select yoru_social_public_badges($1) d',[A]))[0].d.visible,false);
 assert.deepEqual((await as(A,'select data from yoru_state where user_id=$1',[A]))[0].data,before);
});
test('section visibility defaults open once; later hides persist and private state stays intact',async()=>{
 const before=(await as(A,'select data from yoru_state where user_id=$1',[A]))[0].data;
 const migration=await readFile('supabase/social-09.sql','utf8');await db.exec(migration);
 const flags=(await as(null,'select lists_public,badges_public,history_public from yoru_public_profiles where user_id=$1',[A]))[0];
 assert.deepEqual(flags,{lists_public:true,badges_public:true,history_public:true});
 const seconds=(await as(null,'select yoru_social_public_watch_time($1) seconds',[A]))[0].seconds;
 assert.ok(Number(seconds)>=0);await assert.rejects(as(null,'select * from yoru_watch_metrics'),/permission/);
 for(const kind of ['lists','badges','history'])await as(A,'select yoru_social_visibility($1,false)',[kind]);
 await as(A,'select yoru_social_sync_profile()');await db.exec(migration);
 assert.deepEqual((await as(null,'select lists_public,badges_public,history_public from yoru_public_profiles where user_id=$1',[A]))[0],{lists_public:false,badges_public:false,history_public:false});
 assert.deepEqual((await as(A,'select data from yoru_state where user_id=$1',[A]))[0].data,before);
 await assert.rejects(as(null,"select yoru_social_visibility('history',true)"),/permission/);
 await as(A,"select yoru_social_visibility('history',true)");
 assert.equal((await as(null,'select history_public from yoru_public_profiles where user_id=$1',[A]))[0].history_public,true);
 await db.exec("insert into auth.users values('00000000-0000-4000-8000-000000000099','new@test'); insert into yoru_nicknames values('00000000-0000-4000-8000-000000000099','NewUser')");
 assert.deepEqual((await as(null,"select lists_public,badges_public,history_public from yoru_public_profiles where nickname='NewUser'"))[0],{lists_public:true,badges_public:true,history_public:true});
});
