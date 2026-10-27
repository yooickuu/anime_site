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
