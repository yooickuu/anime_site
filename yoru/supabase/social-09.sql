-- Section visibility defaults; keep private saved lists/progress intact.
begin;
alter table public.yoru_public_profiles alter column lists_public set default true;
alter table public.yoru_public_profiles alter column badges_public set default true;
alter table public.yoru_public_profiles alter column history_public set default true;
create or replace function yoru_social_private.project_state(uid uuid, d jsonb) returns void language plpgsql security definer set search_path='' as $$
declare saved bigint; lists integer; completed bigint; rating numeric;
begin
 update public.yoru_public_profiles p set
 bio=left(coalesce(d->'preferences'->>'bio',''),240),
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
create or replace function public.yoru_social_visibility(p_kind text,p_visible boolean) returns void
language plpgsql security definer set search_path='' as $$
declare uid uuid:=yoru_social_private.require_user();
begin
 if p_visible is null or p_kind is null or p_kind not in ('lists','badges','history') then raise exception 'invalid_visibility'; end if;
 if p_kind='lists' then update public.yoru_public_profiles set lists_public=p_visible where user_id=uid;
 elsif p_kind='badges' then update public.yoru_public_profiles set badges_public=p_visible where user_id=uid;
 else
  update public.yoru_public_profiles set history_public=p_visible where user_id=uid;
  perform yoru_social_private.project_state(uid,coalesce((select data from public.yoru_state where user_id=uid),'{}'));
 end if;
end; $$;
revoke all on function public.yoru_social_visibility(text,boolean) from public,anon,authenticated;
grant execute on function public.yoru_social_visibility(text,boolean) to authenticated;
create or replace function public.yoru_social_public_watch_time(p_user uuid) returns bigint
language sql stable security definer set search_path='' as $$
 select coalesce((select m.seconds from public.yoru_watch_metrics m join public.yoru_public_profiles p on p.user_id=m.user_id where m.user_id=p_user),0);
$$;
revoke all on function public.yoru_social_public_watch_time(uuid) from public,anon,authenticated;
grant execute on function public.yoru_social_public_watch_time(uuid) to anon,authenticated;
-- Reset once, as requested; rerunning this SQL must preserve subsequent Hide choices.
create table if not exists yoru_social_private.applied_ui_migrations(name text primary key);
revoke all on yoru_social_private.applied_ui_migrations from public,anon,authenticated;
do $$ declare r record; begin
 if not exists(select 1 from yoru_social_private.applied_ui_migrations where name='public-defaults-v1') then
  update public.yoru_public_profiles set lists_public=true,badges_public=true,history_public=true;
  for r in select user_id,data from public.yoru_state loop perform yoru_social_private.project_state(r.user_id,r.data); end loop;
  insert into yoru_social_private.applied_ui_migrations values('public-defaults-v1');
 end if;
end $$;
notify pgrst,'reload schema';
commit;
