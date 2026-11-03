-- Additive activity/replies/realtime support. Existing auth, table RLS and video stay unchanged.
begin;
create table if not exists public.yoru_watch_metrics (
 user_id uuid primary key references auth.users(id) on delete cascade,
 seconds bigint not null default 0 check(seconds>=0), night_seconds bigint not null default 0,
 badges jsonb not null default '{}', credited_at timestamptz not null default now()
);
create table if not exists public.yoru_watch_sessions (
 user_id uuid not null references auth.users(id) on delete cascade, session_id uuid not null,
 seconds bigint not null default 0, night_seconds bigint not null default 0,
 primary key(user_id,session_id)
);
alter table public.yoru_watch_metrics enable row level security;
alter table public.yoru_watch_sessions enable row level security;
revoke all on public.yoru_watch_metrics,public.yoru_watch_sessions from public,anon,authenticated;
grant select on public.yoru_watch_metrics to authenticated;
drop policy if exists activity_owner_read on public.yoru_watch_metrics;
create policy activity_owner_read on public.yoru_watch_metrics for select to authenticated using(user_id=auth.uid() and yoru_social_private.registered());
create or replace function public.yoru_activity_sync(p_session uuid default null,p_seconds bigint default 0,p_night bigint default 0)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=yoru_social_private.require_user(); old public.yoru_watch_sessions; met public.yoru_watch_metrics;
 delta bigint:=0; credit bigint:=0; night bigint:=0; d jsonb; eps bigint; titles bigint; fav bigint; candidates text[]:=array[]::text[]; badge text; tier record;
begin
 if p_seconds<0 or p_seconds>315576000 or p_night<0 or p_night>p_seconds then raise exception 'invalid_activity'; end if;
 perform pg_advisory_xact_lock(hashtext('activity:'||uid::text));
 insert into public.yoru_watch_metrics(user_id,credited_at) values(uid,now()-interval '2 minutes') on conflict do nothing;
 select * into met from public.yoru_watch_metrics where user_id=uid for update;
 if p_session is not null then
  insert into public.yoru_watch_sessions(user_id,session_id) values(uid,p_session) on conflict do nothing;
  select * into old from public.yoru_watch_sessions where user_id=uid and session_id=p_session;
  delta:=greatest(0,p_seconds-old.seconds);
  -- One account cannot accrue faster than elapsed wall time through multiple tabs/devices.
  credit:=least(delta,greatest(0,floor(extract(epoch from now()-met.credited_at)))::bigint);
  night:=least(credit,greatest(0,p_night-old.night_seconds));
  update public.yoru_watch_sessions set seconds=greatest(seconds,p_seconds),night_seconds=greatest(night_seconds,p_night) where user_id=uid and session_id=p_session;
  if credit>0 then update public.yoru_watch_metrics set seconds=seconds+credit,night_seconds=night_seconds+night,credited_at=now() where user_id=uid returning * into met; end if;
 end if;
 select coalesce(data,'{}') into d from public.yoru_state where user_id=uid;
 select count(*) into eps from jsonb_each(coalesce(d->'progress','{}')) p where p.value->>'completed'='true' and p.value->>'id'<>'sintel';
 select count(*) into titles from jsonb_each(coalesce(d->'entries','{}')) p where p.value->>'status'='completed';
 select count(*) into fav from jsonb_each(coalesce(d->'entries','{}')) p where p.value->>'favorite'='true';
 for tier in select * from (values ('episode_1',1),('episode_10',10),('episode_50',50),('episode_100',100),('episode_500',500)) t(id,n) loop if eps>=tier.n then candidates:=array_append(candidates,tier.id); end if; end loop;
 for tier in select * from (values ('hour_1',3600),('hour_10',36000),('hour_50',180000),('hour_100',360000),('hour_500',1800000)) t(id,n) loop if met.seconds>=tier.n then candidates:=array_append(candidates,tier.id); end if; end loop;
 for tier in select * from (values ('title_1',1),('title_10',10),('title_50',50)) t(id,n) loop if titles>=tier.n then candidates:=array_append(candidates,tier.id); end if; end loop;
 if met.night_seconds>=600 then candidates:=array_append(candidates,'night'); end if;
 if fav>=10 then candidates:=array_append(candidates,'favorites'); end if;
 if exists(select 1 from public.yoru_messages where author_id=uid) then candidates:=array_append(candidates,'message'); end if;
 if exists(select 1 from public.yoru_comments where author_id=uid and deleted_at is null) then candidates:=array_append(candidates,'comment'); end if;
 if exists(select 1 from public.yoru_friendships where status='accepted' and uid in (requester,recipient)) then candidates:=array_append(candidates,'friend'); end if;
 foreach badge in array candidates loop if not met.badges ? badge then met.badges:=met.badges||jsonb_build_object(badge,now()); end if; end loop;
 update public.yoru_watch_metrics set badges=met.badges where user_id=uid;
 return jsonb_build_object('seconds',met.seconds,'night_seconds',met.night_seconds,'badges',met.badges,'session_seconds',greatest(coalesce(old.seconds,0),p_seconds),'session_night',greatest(coalesce(old.night_seconds,0),p_night));
end; $$;
revoke all on function public.yoru_activity_sync(uuid,bigint,bigint) from public,anon,authenticated;
grant execute on function public.yoru_activity_sync(uuid,bigint,bigint) to authenticated;

alter table public.yoru_messages add column if not exists reply_to uuid references public.yoru_messages(id) on delete set null;
create or replace function public.yoru_social_message_v2(p_room uuid,p_body text default '',p_image text default null,p_anime text default null,p_id uuid default gen_random_uuid(),p_reply uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=yoru_social_private.require_user(); mid uuid;
begin
 if not yoru_social_private.is_member(p_room) then raise exception 'members_only'; end if;
 if p_reply is not null and not exists(select 1 from public.yoru_messages where id=p_reply and room_id=p_room) then raise exception 'invalid_reply'; end if;
 if exists(select 1 from public.yoru_messages where id=p_id and author_id=uid and room_id=p_room) then return p_id; end if;
 mid:=public.yoru_social_message(p_room,p_body,p_image,p_anime,p_id);
 update public.yoru_messages set reply_to=p_reply where id=mid;
 return mid;
end; $$;
revoke all on function public.yoru_social_message_v2(uuid,text,text,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.yoru_social_message_v2(uuid,text,text,text,uuid,uuid) to authenticated;

-- Private notifications carry IDs only. The client reads content through existing table RLS.
create or replace function yoru_social_private.channel_member(topic text) returns boolean language plpgsql stable security definer set search_path='' as $$
begin
 if topic !~ '^yomiku:room:[0-9a-f-]{36}$' then return false; end if;
 return yoru_social_private.is_member(split_part(topic,':',3)::uuid);
exception when invalid_text_representation then return false;
end; $$;
revoke all on function yoru_social_private.channel_member(text) from public,anon,authenticated;
grant execute on function yoru_social_private.channel_member(text) to authenticated;
drop policy if exists yomiku_room_receive on realtime.messages;
create policy yomiku_room_receive on realtime.messages for select to authenticated using(extension in ('broadcast','presence') and yoru_social_private.channel_member(realtime.topic()));
drop policy if exists yomiku_room_presence on realtime.messages;
create policy yomiku_room_presence on realtime.messages for insert to authenticated with check(extension='presence' and yoru_social_private.channel_member(realtime.topic()));
create or replace function yoru_social_private.chat_signal() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_TABLE_NAME='yoru_messages' then
  perform realtime.send(jsonb_build_object('id',NEW.id),'message','yomiku:room:'||NEW.room_id::text,true);
 else
  perform realtime.send(jsonb_build_object('user_id',NEW.user_id),'read','yomiku:room:'||NEW.room_id::text,true);
 end if;
 return NEW;
exception when others then return NEW; -- A Realtime outage must not reject a committed message.
end; $$;
revoke all on function yoru_social_private.chat_signal() from public,anon,authenticated;
drop trigger if exists yomiku_message_signal on public.yoru_messages;
create trigger yomiku_message_signal after insert or update of reply_to on public.yoru_messages for each row execute function yoru_social_private.chat_signal();
drop trigger if exists yomiku_read_signal on public.yoru_chat_members;
create trigger yomiku_read_signal after update of last_read_at,last_read_id on public.yoru_chat_members for each row execute function yoru_social_private.chat_signal();
notify pgrst,'reload schema';
commit;
