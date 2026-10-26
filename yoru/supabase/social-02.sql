-- Stage 2. Apply social-01.sql first.
begin;
create table if not exists public.yoru_friendships (
 id uuid primary key default gen_random_uuid(), requester uuid not null references public.yoru_public_profiles(user_id) on delete cascade,
 recipient uuid not null references public.yoru_public_profiles(user_id) on delete cascade,
 status text not null default 'pending' check(status in ('pending','accepted')),
 pair text generated always as (least(requester::text,recipient::text)||':'||greatest(requester::text,recipient::text)) stored unique,
 created_at timestamptz not null default now(), check(requester<>recipient)
);
create index if not exists yoru_friends_requester on public.yoru_friendships(requester);
create index if not exists yoru_friends_recipient on public.yoru_friendships(recipient);
create table if not exists public.yoru_conversations (
 id uuid primary key default gen_random_uuid(), kind text not null check(kind in ('dm','group')),
 title text not null default '' check(char_length(title)<=80), owner_id uuid references public.yoru_public_profiles(user_id) on delete set null,
 dm_key text unique, created_at timestamptz not null default now()
);
create table if not exists public.yoru_chat_members (
 room_id uuid not null references public.yoru_conversations(id) on delete cascade,
 user_id uuid not null references public.yoru_public_profiles(user_id) on delete cascade,
 joined_at timestamptz not null default now(), primary key(room_id,user_id)
);
create index if not exists yoru_members_user on public.yoru_chat_members(user_id,room_id);
create table if not exists public.yoru_messages (
 id uuid primary key default gen_random_uuid(), room_id uuid not null references public.yoru_conversations(id) on delete cascade,
 author_id uuid references public.yoru_public_profiles(user_id) on delete set null,
 body text not null default '' check(char_length(body)<=4000), image_path text,
 anime_id text check(anime_id ~ '^(mal|shikimori|anilist|lib|vost|kitsu|go)-[0-9]+$'),
 created_at timestamptz not null default now(),
 check(char_length(btrim(body))>0 or image_path is not null or anime_id is not null)
);
create index if not exists yoru_messages_page on public.yoru_messages(room_id,created_at desc,id desc);
create index if not exists yoru_messages_rate on public.yoru_messages(author_id,created_at desc);
create or replace function yoru_social_private.is_friend(a uuid,b uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.yoru_friendships where pair=least(a::text,b::text)||':'||greatest(a::text,b::text) and status='accepted'); $$;
create or replace function yoru_social_private.is_member(room uuid) returns boolean language sql stable security definer set search_path='' as $$
 select yoru_social_private.registered() and exists(select 1 from public.yoru_chat_members where room_id=room and user_id=auth.uid()); $$;
create or replace function yoru_social_private.image_access(path text) returns boolean language plpgsql stable security definer set search_path='' as $$
begin return yoru_social_private.is_member(split_part(path,'/',1)::uuid); exception when invalid_text_representation then return false; end; $$;
create or replace function public.yoru_social_friend(p_user uuid,p_action text) returns void language plpgsql security definer set search_path='' as $$
declare uid uuid:=yoru_social_private.require_user(); key text:=least(uid::text,p_user::text)||':'||greatest(uid::text,p_user::text);
begin
 if uid=p_user then raise exception 'invalid_friend'; end if;
 perform pg_advisory_xact_lock(hashtext(uid::text));
 if p_action='request' then
  if (select count(*) from public.yoru_friendships where requester=uid and status='pending')>=50 then raise exception 'too_many_requests'; end if;
  insert into public.yoru_friendships(requester,recipient) values(uid,p_user) on conflict(pair) do nothing;
 elsif p_action='accept' then
  update public.yoru_friendships set status='accepted' where pair=key and recipient=uid and status='pending';
  if not found then raise exception 'request_not_found'; end if;
 elsif p_action in ('reject','cancel','remove') then
  delete from public.yoru_friendships where pair=key and ((p_action='reject' and recipient=uid and status='pending') or (p_action='cancel' and requester=uid and status='pending') or (p_action='remove' and status='accepted' and uid in (requester,recipient)));
  if not found then raise exception 'request_not_found'; end if;
 else raise exception 'invalid_action'; end if;
end; $$;
create or replace function public.yoru_social_room(p_users uuid[],p_title text default '') returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=yoru_social_private.require_user(); people uuid[]; peer uuid; rid uuid; key text;
begin
 select array_agg(distinct u) into people from unnest(p_users) u where u<>uid;
 if coalesce(cardinality(people),0) not between 1 and 19 or char_length(p_title)>80 then raise exception 'invalid_members'; end if;
 foreach peer in array people loop if not yoru_social_private.is_friend(uid,peer) then raise exception 'friends_only'; end if; end loop;
 perform pg_advisory_xact_lock(hashtext(uid::text));
 if cardinality(people)=1 and coalesce(p_title,'')='' then
  key:=least(uid::text,people[1]::text)||':'||greatest(uid::text,people[1]::text);
  insert into public.yoru_conversations(kind,owner_id,dm_key) values('dm',uid,key) on conflict(dm_key) do nothing;
  select id into rid from public.yoru_conversations where dm_key=key;
 else
  if char_length(btrim(p_title)) not between 1 and 80 then raise exception 'invalid_title'; end if;
  if (select count(*) from public.yoru_conversations where owner_id=uid and kind='group')>=50 then raise exception 'too_many_groups'; end if;
  insert into public.yoru_conversations(kind,title,owner_id) values('group',btrim(p_title),uid) returning id into rid;
 end if;
 insert into public.yoru_chat_members(room_id,user_id) select rid,u from unnest(people||array[uid]) u on conflict do nothing;
 return rid;
end; $$;
create or replace function public.yoru_social_manage_room(p_room uuid,p_action text,p_user uuid default null,p_title text default null) returns void language plpgsql security definer set search_path='' as $$
declare uid uuid:=yoru_social_private.require_user(); room public.yoru_conversations;
begin
 select * into room from public.yoru_conversations where id=p_room for update;
 if not yoru_social_private.is_member(p_room) or room.kind<>'group' then raise exception 'not_group_member'; end if;
 if p_action='leave' then
  if room.owner_id=uid then update public.yoru_conversations set owner_id=(select user_id from public.yoru_chat_members where room_id=p_room and user_id<>uid order by joined_at,user_id limit 1) where id=p_room; end if;
  delete from public.yoru_chat_members where room_id=p_room and user_id=uid;
 elsif room.owner_id is distinct from uid then raise exception 'owner_only';
 elsif p_action='rename' and char_length(btrim(p_title)) between 1 and 80 then update public.yoru_conversations set title=btrim(p_title) where id=p_room;
 elsif p_action='remove' and p_user<>uid then delete from public.yoru_chat_members where room_id=p_room and user_id=p_user;
 elsif p_action='add' then
  if not yoru_social_private.is_friend(uid,p_user) or (select count(*) from public.yoru_chat_members where room_id=p_room)>=20 then raise exception 'invalid_members'; end if;
  insert into public.yoru_chat_members(room_id,user_id) values(p_room,p_user) on conflict do nothing;
 else raise exception 'invalid_action'; end if;
end; $$;
create or replace function public.yoru_social_message(p_room uuid,p_body text default '',p_image text default null,p_anime text default null,p_id uuid default gen_random_uuid()) returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=yoru_social_private.require_user();
begin
 if not yoru_social_private.is_member(p_room) then raise exception 'members_only'; end if;
 perform pg_advisory_xact_lock(hashtext(uid::text));
 if exists(select 1 from public.yoru_messages where id=p_id and author_id=uid and room_id=p_room) then return p_id; end if;
 if (select count(*) from public.yoru_messages where author_id=uid and created_at>now()-interval '1 minute')>=30 then raise exception 'rate_limited'; end if;
 if p_image is not null and (split_part(p_image,'/',1)<>p_room::text or split_part(p_image,'/',2)<>uid::text or not exists(select 1 from storage.objects where bucket_id='social-chat-media' and name=p_image)) then raise exception 'invalid_image'; end if;
 insert into public.yoru_messages(id,room_id,author_id,body,image_path,anime_id) values(p_id,p_room,uid,coalesce(btrim(p_body),''),p_image,p_anime);
 return p_id;
end; $$;

alter table public.yoru_friendships enable row level security;
alter table public.yoru_conversations enable row level security;
alter table public.yoru_chat_members enable row level security;
alter table public.yoru_messages enable row level security;
revoke all on public.yoru_friendships,public.yoru_conversations,public.yoru_chat_members,public.yoru_messages from public,anon,authenticated;
grant select on public.yoru_friendships,public.yoru_conversations,public.yoru_chat_members,public.yoru_messages to authenticated;
drop policy if exists social_friend_read on public.yoru_friendships;
create policy social_friend_read on public.yoru_friendships for select to authenticated using(yoru_social_private.registered() and auth.uid() in (requester,recipient));
drop policy if exists social_room_read on public.yoru_conversations;
create policy social_room_read on public.yoru_conversations for select to authenticated using(yoru_social_private.is_member(id));
drop policy if exists social_member_read on public.yoru_chat_members;
create policy social_member_read on public.yoru_chat_members for select to authenticated using(yoru_social_private.is_member(room_id));
drop policy if exists social_message_read on public.yoru_messages;
create policy social_message_read on public.yoru_messages for select to authenticated using(yoru_social_private.is_member(room_id));
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('social-chat-media','social-chat-media',false,3145728,array['image/webp','image/jpeg','image/png']) on conflict(id) do nothing;
drop policy if exists social_chat_read on storage.objects;
create policy social_chat_read on storage.objects for select to authenticated using(bucket_id='social-chat-media' and yoru_social_private.image_access(name));
drop policy if exists social_chat_upload on storage.objects;
create policy social_chat_upload on storage.objects for insert to authenticated with check(bucket_id='social-chat-media' and split_part(name,'/',2)=auth.uid()::text and yoru_social_private.image_access(name));
drop policy if exists social_chat_delete on storage.objects;
create policy social_chat_delete on storage.objects for delete to authenticated using(bucket_id='social-chat-media' and split_part(name,'/',2)=auth.uid()::text and yoru_social_private.image_access(name));
revoke all on function yoru_social_private.is_friend(uuid,uuid),yoru_social_private.is_member(uuid),yoru_social_private.image_access(text) from public,anon,authenticated;
grant execute on function yoru_social_private.is_member(uuid),yoru_social_private.image_access(text) to authenticated;
revoke all on function public.yoru_social_friend(uuid,text),public.yoru_social_room(uuid[],text),public.yoru_social_manage_room(uuid,text,uuid,text),public.yoru_social_message(uuid,text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.yoru_social_friend(uuid,text),public.yoru_social_room(uuid[],text),public.yoru_social_manage_room(uuid,text,uuid,text),public.yoru_social_message(uuid,text,text,text,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
