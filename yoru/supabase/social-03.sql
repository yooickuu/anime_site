-- Stage 3: one canonical profile; public history contains calendar dates only.
begin;
-- Preserve the owner's previous visibility choice in the existing preferences JSON.
update public.yoru_state s set data=jsonb_set(s.data,'{preferences}',coalesce(s.data->'preferences','{}')||jsonb_build_object('historyPublic',p.history_public))
from public.yoru_public_profiles p where s.user_id=p.user_id and not coalesce(s.data->'preferences','{}') ? 'historyPublic';
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
  ) recent order by updated desc limit 30;
 end if;
end; $$;

create or replace function public.yoru_social_sync_profile() returns void language plpgsql security definer set search_path='' as $$
declare uid uuid:=yoru_social_private.require_user();
begin perform yoru_social_private.project_state(uid,coalesce((select data from public.yoru_state where user_id=uid),'{}')); end; $$;
revoke all on function public.yoru_social_sync_profile() from public,anon,authenticated;
grant execute on function public.yoru_social_sync_profile() to authenticated;
-- The old separate profile editor no longer writes a second copy of preferences.
revoke execute on function public.yoru_social_save_profile(text,boolean,text,text) from public,anon,authenticated;
-- Even a custom REST client cannot retrieve another user's episode/time progress.
revoke select on public.yoru_public_history from public,anon,authenticated;
grant select on public.yoru_public_history to authenticated;
drop policy if exists social_history_read on public.yoru_public_history;
create policy social_history_read on public.yoru_public_history for select to authenticated using(auth.uid()=user_id and yoru_social_private.registered());
create or replace function public.yoru_social_history(p_user uuid)
returns table(anime_id text,watched_date date) language sql stable security definer set search_path='' as $$
 select h.anime_id,(h.watched_at at time zone 'UTC')::date from public.yoru_public_history h
 where h.user_id=p_user and exists(select 1 from public.yoru_public_profiles p where p.user_id=p_user and p.history_public)
 order by h.watched_at desc limit 30;
$$;
revoke all on function public.yoru_social_history(uuid) from public,anon,authenticated;
grant execute on function public.yoru_social_history(uuid) to anon,authenticated;
-- Backfill aggregate statistics and bio without exposing private state/photos.
do $$ declare row record; begin
 for row in select user_id,data from public.yoru_state loop
  begin perform yoru_social_private.project_state(row.user_id,row.data); exception when others then raise warning 'Social projection deferred'; end;
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
