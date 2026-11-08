-- Stage 3: public profile tabs and achievement-only sync. No private state mutation.
begin;
create or replace function yoru_social_private.profile_always_public() returns trigger
language plpgsql set search_path='' as $$ begin
 new.lists_public:=true; new.badges_public:=true; new.history_public:=true; return new;
end; $$;
drop trigger if exists profile_always_public on public.yoru_public_profiles;
create trigger profile_always_public before insert or update on public.yoru_public_profiles for each row execute function yoru_social_private.profile_always_public();
update public.yoru_public_profiles set lists_public=true,badges_public=true,history_public=true;
create or replace function public.yoru_social_visibility(p_kind text,p_visible boolean) returns void
language plpgsql security definer set search_path='' as $$
declare uid uuid:=yoru_social_private.require_user();
begin
 if p_kind is null or p_kind not in ('lists','badges','history') then raise exception 'invalid_visibility'; end if;
 update public.yoru_public_profiles set lists_public=true,badges_public=true,history_public=true where user_id=uid;
end; $$;
-- Public friends expose accepted relationships and public identity only, never requests or email.
create or replace function public.yoru_social_public_friends(p_user uuid,p_offset integer default 0) returns jsonb
language sql stable security definer set search_path='' as $$
 with peers as (
  select case when f.requester=p_user then f.recipient else f.requester end uid
  from public.yoru_friendships f where f.status='accepted' and p_user in (f.requester,f.recipient)
 ), people as (select p.user_id,p.nickname,p.avatar_path from public.yoru_public_profiles p join peers f on f.uid=p.user_id)
 select jsonb_build_object('total',(select count(*) from people),'items',coalesce((select jsonb_agg(to_jsonb(p)) from (select * from people order by nickname,user_id offset greatest(0,least(coalesce(p_offset,0),100000)) limit 40) p),'[]'));
$$;
revoke all on function public.yoru_social_public_friends(uuid,integer) from public,anon,authenticated;
grant execute on function public.yoru_social_public_friends(uuid,integer) to anon,authenticated;
create or replace function public.yoru_activity_sync(p_session uuid default null,p_seconds bigint default 0,p_night bigint default 0)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=yoru_social_private.require_user(); old public.yoru_watch_sessions; met public.yoru_watch_metrics;
 delta bigint:=0; credit bigint:=0; night bigint:=0; d jsonb; eps bigint; titles bigint; fav bigint; candidates text[]:=array[]::text[]; badge text; tier record;
begin
 perform pg_advisory_xact_lock(hashtext('activity:'||uid::text));
 insert into public.yoru_watch_metrics(user_id) values(uid) on conflict do nothing;
 select * into met from public.yoru_watch_metrics where user_id=uid for update;
 select coalesce(data,'{}') into d from public.yoru_state where user_id=uid;
 select count(*) into eps from jsonb_each(coalesce(d->'progress','{}')) p where p.value->>'completed'='true' and p.value->>'id'<>'sintel';
 select count(*) into titles from jsonb_each(coalesce(d->'entries','{}')) p where p.value->>'status'='completed';
 select count(*) into fav from jsonb_each(coalesce(d->'entries','{}')) p where p.value->>'favorite'='true';
 for tier in select * from (values ('episode_1',1),('episode_10',10),('episode_50',50),('episode_100',100),('episode_500',500),('episode_250',250),('episode_1000',1000),('episode_2000',2000)) t(id,n) loop if eps>=tier.n then candidates:=array_append(candidates,tier.id); end if; end loop;
 for tier in select * from (values ('title_1',1),('title_10',10),('title_50',50),('title_5',5),('title_25',25),('title_100',100)) t(id,n) loop if titles>=tier.n then candidates:=array_append(candidates,tier.id); end if; end loop;
 if fav>=10 then candidates:=array_append(candidates,'favorites'); end if;
 if exists(select 1 from public.yoru_messages where author_id=uid) then candidates:=array_append(candidates,'message'); end if;
 if exists(select 1 from public.yoru_comments where author_id=uid and deleted_at is null) then candidates:=array_append(candidates,'comment'); end if;
 if exists(select 1 from public.yoru_friendships where status='accepted' and uid in (requester,recipient)) then candidates:=array_append(candidates,'friend'); end if;
 if (select count(*) from (select 1 from public.yoru_messages where author_id=uid limit 50) q)>=50 then candidates:=array_append(candidates,'message_50'); end if;
 if (select count(*) from (select 1 from public.yoru_comments where author_id=uid and deleted_at is null limit 10) q)>=10 then candidates:=array_append(candidates,'comment_10'); end if;
 if (select count(*) from (select 1 from public.yoru_friendships where status='accepted' and uid in (requester,recipient) limit 5) q)>=5 then candidates:=array_append(candidates,'friend_5'); end if;
 foreach badge in array candidates loop if not met.badges ? badge then met.badges:=met.badges||jsonb_build_object(badge,now()); end if; end loop;
 update public.yoru_watch_metrics set badges=met.badges where user_id=uid;
 return jsonb_build_object('badges',met.badges);
end; $$;

revoke all on function public.yoru_social_public_watch_time(uuid) from public,anon,authenticated;
-- Rebuild public projections only. Lists, playback progress and earned badges stay intact.
do $$ declare r record; begin
 for r in select user_id,data from public.yoru_state loop perform yoru_social_private.project_state(r.user_id,r.data); end loop;
end $$;
notify pgrst,'reload schema';
commit;
