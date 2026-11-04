-- Watch Together and opt-in public lists/achievements. Existing playback/auth/state untouched.
begin;
alter table public.yoru_public_profiles add column if not exists lists_public boolean not null default false;
alter table public.yoru_public_profiles add column if not exists badges_public boolean not null default false;
create or replace function public.yoru_social_visibility(p_kind text,p_visible boolean) returns void
language plpgsql security definer set search_path='' as $$
declare uid uuid:=yoru_social_private.require_user();
begin
 if p_visible is null or p_kind not in ('lists','badges') then raise exception 'invalid_visibility'; end if;
 if p_kind='lists' then update public.yoru_public_profiles set lists_public=p_visible where user_id=uid;
 else update public.yoru_public_profiles set badges_public=p_visible where user_id=uid; end if;
end; $$;
create or replace function public.yoru_social_public_lists(p_user uuid,p_list text default 'all',p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare d jsonb; items jsonb; total bigint; labels jsonb;
begin
 if not exists(select 1 from public.yoru_public_profiles where user_id=p_user and (lists_public or user_id=auth.uid())) then return jsonb_build_object('visible',false); end if;
 select data into d from public.yoru_state where user_id=p_user;
 select coalesce(jsonb_agg(jsonb_build_object('id',s->>'id','key',s->>'key','name',left(s->>'name',80))),'[]') into labels
 from jsonb_array_elements(coalesce(d->'statuses','[]')) s;
 with ids as (
 select key anime_id from jsonb_each(coalesce(d->'entries','{}'))
 where p_list='all' or (p_list='favorites' and value->>'favorite'='true') or value->>'status'=p_list or coalesce(value->'legacyLists','[]') ? p_list
 union select jsonb_array_elements_text(coalesce(c->'items','[]')) from jsonb_array_elements(coalesce(d->'collections','[]')) c where c->>'id'=p_list
 ), valid as (select anime_id from ids where anime_id ~ '^(mal|shikimori|anilist|lib|vost|kitsu|go)-[0-9]+$')
 select (select count(*) from valid),coalesce((select jsonb_agg(jsonb_build_object('anime_id',anime_id)) from (select anime_id from valid order by anime_id offset greatest(0,least(coalesce(p_offset,0),100000)) limit 40) p),'[]') into total,items;
 return jsonb_build_object('visible',true,'statuses',labels,'total',total,'items',items);
end; $$;
create or replace function public.yoru_social_public_badges(p_user uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select case when exists(select 1 from public.yoru_public_profiles where user_id=p_user and (badges_public or user_id=auth.uid())) then
 jsonb_build_object('visible',true,'badges',coalesce((select badges from public.yoru_watch_metrics where user_id=p_user),'{}'))
 else jsonb_build_object('visible',false) end;
$$;

create table if not exists public.yoru_watch_rooms(
 id uuid primary key default gen_random_uuid(),host_id uuid not null references public.yoru_public_profiles(user_id) on delete cascade,
 anime_id text not null check(anime_id ~ '^(mal|shikimori|anilist|lib|vost|kitsu|go)-[0-9]+$'),episode integer not null check(episode between 1 and 100000),
 position double precision not null default 0 check(position between 0 and 86400),playing boolean not null default false,
 speed double precision not null default 1 check(speed between .25 and 4),revision bigint not null default 0,
 sent_at timestamptz not null default now(),updated_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '24 hours',closed boolean not null default false
);
create table if not exists public.yoru_watch_members(
 room_id uuid references public.yoru_watch_rooms(id) on delete cascade,user_id uuid references public.yoru_public_profiles(user_id) on delete cascade,
 joined_at timestamptz not null default now(),primary key(room_id,user_id)
);
create table if not exists public.yoru_watch_messages(
 id uuid primary key default gen_random_uuid(),room_id uuid not null references public.yoru_watch_rooms(id) on delete cascade,
 author_id uuid not null references public.yoru_public_profiles(user_id) on delete cascade,body text not null check(char_length(body) between 1 and 500),created_at timestamptz not null default now()
);
create index if not exists watch_messages_room_time on public.yoru_watch_messages(room_id,created_at desc);
create index if not exists watch_rooms_host on public.yoru_watch_rooms(host_id);
create index if not exists watch_messages_author_time on public.yoru_watch_messages(author_id,created_at desc);
alter table public.yoru_watch_rooms enable row level security;
alter table public.yoru_watch_members enable row level security;
alter table public.yoru_watch_messages enable row level security;
revoke all on public.yoru_watch_rooms,public.yoru_watch_members,public.yoru_watch_messages from public,anon,authenticated;
-- No direct REST writes or reads: all accesses below enforce membership and expiry.
create or replace function yoru_social_private.watch_member(p_room uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select yoru_social_private.registered() and exists(select 1 from public.yoru_watch_rooms r join public.yoru_watch_members m on m.room_id=r.id
 where r.id=p_room and m.user_id=auth.uid() and not r.closed and r.expires_at>now());
$$;
create or replace function yoru_social_private.watch_channel(p_topic text,p_host boolean default false) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare rid uuid;
begin
 if p_topic !~ '^yomiku:watch:[0-9a-f-]{36}$' then return false; end if;
 begin rid:=substring(p_topic from 14)::uuid; exception when others then return false; end;
 return yoru_social_private.watch_member(rid) and (not p_host or exists(select 1 from public.yoru_watch_rooms where id=rid and host_id=auth.uid()));
end; $$;
create or replace function public.yoru_watch_create(p_anime text,p_episode integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=yoru_social_private.require_user(); r public.yoru_watch_rooms;
begin
 perform pg_advisory_xact_lock(hashtext('watch-create:'||uid::text));
 delete from public.yoru_watch_rooms where host_id=uid and expires_at<now();
 if (select count(*) from public.yoru_watch_rooms where host_id=uid and not closed)>=3 then raise exception 'too_many_rooms'; end if;
 insert into public.yoru_watch_rooms(host_id,anime_id,episode) values(uid,p_anime,p_episode) returning * into r;
 insert into public.yoru_watch_members values(r.id,uid,now());
 return to_jsonb(r)||jsonb_build_object('server_now',now());
end; $$;
create or replace function public.yoru_watch_join(p_room uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=yoru_social_private.require_user(); r public.yoru_watch_rooms;
begin
 select * into r from public.yoru_watch_rooms where id=p_room for update;
 if r.id is null or r.closed or r.expires_at<=now() then raise exception 'room_unavailable'; end if;
 if not exists(select 1 from public.yoru_watch_members where room_id=p_room and user_id=uid) and (select count(*) from public.yoru_watch_members where room_id=p_room)>=12 then raise exception 'room_full'; end if;
 insert into public.yoru_watch_members values(p_room,uid,now()) on conflict do nothing;
 return to_jsonb(r)||jsonb_build_object('server_now',now());
end; $$;
create or replace function public.yoru_watch_snapshot(p_room uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not yoru_social_private.watch_member(p_room) then raise exception 'room_unavailable'; end if;
 return (select to_jsonb(r)||jsonb_build_object('server_now',now()) from public.yoru_watch_rooms r where id=p_room);
end; $$;
create or replace function public.yoru_watch_state(p_room uuid,p_anime text,p_episode integer,p_position double precision,p_playing boolean,p_speed double precision,p_revision bigint) returns void
language plpgsql security definer set search_path='' as $$
declare uid uuid:=yoru_social_private.require_user();
begin
 if not yoru_social_private.watch_member(p_room) or not exists(select 1 from public.yoru_watch_rooms where id=p_room and host_id=uid) then raise exception 'host_only'; end if;
 update public.yoru_watch_rooms set anime_id=p_anime,episode=p_episode,position=p_position,playing=p_playing,speed=p_speed,revision=p_revision,sent_at=now(),updated_at=now()
 where id=p_room and revision<p_revision;
end; $$;
create or replace function public.yoru_watch_messages(p_room uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not yoru_social_private.watch_member(p_room) then raise exception 'members_only'; end if;
 return coalesce((select jsonb_agg(to_jsonb(m) order by created_at,id) from (
 select m.id,m.body,m.author_id,m.created_at,p.nickname from public.yoru_watch_messages m join public.yoru_public_profiles p on p.user_id=m.author_id where m.room_id=p_room order by m.created_at desc,m.id desc limit 50) m),'[]');
end; $$;
create or replace function public.yoru_watch_message(p_room uuid,p_body text,p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=yoru_social_private.require_user(); m public.yoru_watch_messages;
begin
 if not yoru_social_private.watch_member(p_room) then raise exception 'members_only'; end if;
 perform pg_advisory_xact_lock(hashtext('watch-message:'||uid::text));
 select * into m from public.yoru_watch_messages where id=p_id;
 if m.id is not null then
  if m.author_id<>uid or m.room_id<>p_room then raise exception 'invalid_message'; end if;
 else
  if (select count(*) from public.yoru_watch_messages where author_id=uid and created_at>now()-interval '1 minute')>=30 then raise exception 'rate_limited'; end if;
  insert into public.yoru_watch_messages(id,room_id,author_id,body) values(p_id,p_room,uid,btrim(p_body)) returning * into m;
  begin perform realtime.send(jsonb_build_object('id',m.id),'chat','yomiku:watch:'||p_room::text,true); exception when others then null; end;
 end if;
 return to_jsonb(m)||jsonb_build_object('nickname',(select nickname from public.yoru_public_profiles where user_id=uid));
end; $$;
create or replace function public.yoru_watch_leave(p_room uuid) returns void
language plpgsql security definer set search_path='' as $$
declare uid uuid:=yoru_social_private.require_user();
begin
 if exists(select 1 from public.yoru_watch_rooms where id=p_room and host_id=uid) then
  update public.yoru_watch_rooms set closed=true where id=p_room;
  begin perform realtime.send('{}','closed','yomiku:watch:'||p_room::text,true); exception when others then null; end;
 else delete from public.yoru_watch_members where room_id=p_room and user_id=uid; end if;
end; $$;
revoke all on function yoru_social_private.watch_member(uuid),yoru_social_private.watch_channel(text,boolean) from public,anon,authenticated;
grant execute on function yoru_social_private.watch_channel(text,boolean) to authenticated;
drop policy if exists yomiku_watch_receive on realtime.messages;
create policy yomiku_watch_receive on realtime.messages for select to authenticated using(extension in ('broadcast','presence') and yoru_social_private.watch_channel(realtime.topic(),false));
drop policy if exists yomiku_watch_send on realtime.messages;
create policy yomiku_watch_send on realtime.messages for insert to authenticated with check((extension='broadcast' and yoru_social_private.watch_channel(realtime.topic(),true)) or (extension='presence' and yoru_social_private.watch_channel(realtime.topic(),false)));
revoke all on function public.yoru_social_visibility(text,boolean),public.yoru_social_public_lists(uuid,text,integer),public.yoru_social_public_badges(uuid),public.yoru_watch_create(text,integer),public.yoru_watch_join(uuid),public.yoru_watch_snapshot(uuid),public.yoru_watch_state(uuid,text,integer,double precision,boolean,double precision,bigint),public.yoru_watch_messages(uuid),public.yoru_watch_message(uuid,text,uuid),public.yoru_watch_leave(uuid) from public,anon,authenticated;
grant execute on function public.yoru_social_public_lists(uuid,text,integer),public.yoru_social_public_badges(uuid) to anon,authenticated;
grant execute on function public.yoru_social_visibility(text,boolean),public.yoru_watch_create(text,integer),public.yoru_watch_join(uuid),public.yoru_watch_snapshot(uuid),public.yoru_watch_state(uuid,text,integer,double precision,boolean,double precision,bigint),public.yoru_watch_messages(uuid),public.yoru_watch_message(uuid,text,uuid),public.yoru_watch_leave(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
