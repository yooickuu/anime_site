-- Compact profile/messenger: additive read timestamp, 30 achievements, rolling history.
-- Does not alter existing RLS, auth, private saved state or playback.
begin;
alter table public.yoru_chat_members add column if not exists last_seen_at timestamptz;
create or replace function public.yoru_social_mark_read(p_room uuid,p_message uuid)
returns void language plpgsql security definer set search_path='' as $$
declare uid uuid:=yoru_social_private.require_user(); stamp timestamptz;
begin
 if not yoru_social_private.is_member(p_room) then raise exception 'members_only'; end if;
 select created_at into stamp from public.yoru_messages where id=p_message and room_id=p_room;
 if stamp is null then raise exception 'message_not_found'; end if;
 update public.yoru_chat_members set last_read_at=stamp,last_read_id=p_message,last_seen_at=now()
 where room_id=p_room and user_id=uid and (last_read_at,last_read_id)<(stamp,p_message);
end; $$;
revoke all on function public.yoru_social_mark_read(uuid,uuid) from public,anon,authenticated;
grant execute on function public.yoru_social_mark_read(uuid,uuid) to authenticated;
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
 for tier in select * from (values ('episode_1',1),('episode_10',10),('episode_50',50),('episode_100',100),('episode_500',500),('episode_250',250),('episode_1000',1000),('episode_2000',2000)) t(id,n) loop if eps>=tier.n then candidates:=array_append(candidates,tier.id); end if; end loop;
 for tier in select * from (values ('hour_1',3600),('hour_10',36000),('hour_50',180000),('hour_100',360000),('hour_500',1800000),('hour_5',18000),('hour_25',90000),('hour_250',900000)) t(id,n) loop if met.seconds>=tier.n then candidates:=array_append(candidates,tier.id); end if; end loop;
 for tier in select * from (values ('title_1',1),('title_10',10),('title_50',50),('title_5',5),('title_25',25),('title_100',100)) t(id,n) loop if titles>=tier.n then candidates:=array_append(candidates,tier.id); end if; end loop;
 if met.night_seconds>=600 then candidates:=array_append(candidates,'night'); end if;
 if fav>=10 then candidates:=array_append(candidates,'favorites'); end if;
 if exists(select 1 from public.yoru_messages where author_id=uid) then candidates:=array_append(candidates,'message'); end if;
 if exists(select 1 from public.yoru_comments where author_id=uid and deleted_at is null) then candidates:=array_append(candidates,'comment'); end if;
 if exists(select 1 from public.yoru_friendships where status='accepted' and uid in (requester,recipient)) then candidates:=array_append(candidates,'friend'); end if;
 if (select count(*) from (select 1 from public.yoru_messages where author_id=uid limit 50) q)>=50 then candidates:=array_append(candidates,'message_50'); end if;
 if (select count(*) from (select 1 from public.yoru_comments where author_id=uid and deleted_at is null limit 10) q)>=10 then candidates:=array_append(candidates,'comment_10'); end if;
 if (select count(*) from (select 1 from public.yoru_friendships where status='accepted' and uid in (requester,recipient) limit 5) q)>=5 then candidates:=array_append(candidates,'friend_5'); end if;
 foreach badge in array candidates loop if not met.badges ? badge then met.badges:=met.badges||jsonb_build_object(badge,now()); end if; end loop;
 update public.yoru_watch_metrics set badges=met.badges where user_id=uid;
 return jsonb_build_object('seconds',met.seconds,'night_seconds',met.night_seconds,'badges',met.badges,'session_seconds',greatest(coalesce(old.seconds,0),p_seconds),'session_night',greatest(coalesce(old.night_seconds,0),p_night));
end; $$;
revoke all on function public.yoru_activity_sync(uuid,bigint,bigint) from public,anon,authenticated;
grant execute on function public.yoru_activity_sync(uuid,bigint,bigint) to authenticated;

create or replace function yoru_social_private.project_state(uid uuid, d jsonb) returns void language plpgsql security definer set search_path='' as $$
declare saved bigint; lists integer; completed bigint; rating numeric;
begin
 update public.yoru_public_profiles p set
 bio=left(coalesce(d->'preferences'->>'bio',''),240),
 history_public=coalesce(d->'preferences'->>'historyPublic','false')='true',
 avatar_path=(select o.name from storage.objects o where o.bucket_id='social-profile-media' and o.name=d->'preferences'->>'avatar' and split_part(o.name,'/',1)=uid::text),
 banner_path=(select o.name from storage.objects o where o.bucket_id='social-profile-media' and o.name=d->'preferences'->>'banner' and split_part(o.name,'/',1)=uid::text)
 where p.user_id=uid;
 select count(*) into saved from jsonb_each(coalesce(d->'entries','{}'));
 lists:=jsonb_array_length(coalesce(d->'statuses','[]'));
 select count(*) into completed from jsonb_each(coalesce(d->'progress','{}')) p where p.value->>'id'<>'sintel' and p.value->>'completed'='true';
 select round(avg(case when jsonb_typeof(value->'rating')='number' then case when (value->>'rating')::numeric between 1 and 10 then (value->>'rating')::numeric end end),1) into rating from jsonb_each(coalesce(d->'entries','{}'));
 update public.yoru_public_profiles set stats=jsonb_build_object('saved',saved,'lists',lists,'completed',completed,'rating',rating) where user_id=uid;
 delete from public.yoru_public_history where user_id=uid;
 if exists(select 1 from public.yoru_public_profiles where user_id=uid and history_public) then
  insert into public.yoru_public_history(user_id,anime_id,season,episode,watched_at)
  select uid, id, season, episode, to_timestamp(updated/1000) from (
   select distinct on (value->>'id') value->>'id' id,
   case when coalesce(value->>'season','') ~ '^[0-9]{1,4}$' then (value->>'season')::integer else 1 end season,
   case when coalesce(value->>'ordinal',value->>'episode','') ~ '^[0-9]{1,6}$' then coalesce(value->>'ordinal',value->>'episode')::integer else 1 end episode,
   case when coalesce(value->>'updated','') ~ '^[0-9]{1,15}$' then (value->>'updated')::numeric else 0 end updated
   from jsonb_each(coalesce(d->'progress','{}')) where value->>'id' ~ '^(mal|shikimori|anilist|lib|vost|kitsu|go)-[0-9]+$'
   order by value->>'id', (case when coalesce(value->>'updated','') ~ '^[0-9]{1,15}$' then (value->>'updated')::numeric else 0 end) desc
  ) recent where updated>extract(epoch from (now()-interval '14 days'))*1000 order by updated desc limit 30;
 end if;
end; $$;


create or replace function public.yoru_social_history(p_user uuid)
returns table(anime_id text,watched_date date) language sql stable security definer set search_path='' as $$
 select h.anime_id,(h.watched_at at time zone 'UTC')::date from public.yoru_public_history h
 where h.user_id=p_user and h.watched_at>now()-interval '14 days'
 and exists(select 1 from public.yoru_public_profiles p where p.user_id=p_user and p.history_public)
 order by h.watched_at desc limit 30;
$$;
revoke all on function public.yoru_social_history(uuid) from public,anon,authenticated;
grant execute on function public.yoru_social_history(uuid) to anon,authenticated;
delete from public.yoru_public_history where watched_at<=now()-interval '14 days';
notify pgrst,'reload schema';
commit;
