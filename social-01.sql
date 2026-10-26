-- Stage 1: public projections + episode comments. No existing private policy is changed.
begin;
create schema if not exists yoru_social_private;
revoke all on schema yoru_social_private from public;
grant usage on schema yoru_social_private to anon,authenticated;
create or replace function yoru_social_private.registered() returns boolean language sql stable set search_path='' as $$
 select auth.uid() is not null and coalesce(auth.jwt()->>'is_anonymous','false') <> 'true';
$$;
create or replace function yoru_social_private.require_user() returns uuid language plpgsql stable set search_path='' as $$
begin if not yoru_social_private.registered() then raise exception 'login_required'; end if; return auth.uid(); end; $$;

create table if not exists public.yoru_public_profiles (
 user_id uuid primary key references auth.users(id) on delete cascade,
 nickname text not null check(char_length(nickname) between 1 and 40),
 nickname_key text generated always as (public.yoru_nickname_key(nickname)) stored unique,
 bio text not null default '' check(char_length(bio)<=240),
 avatar_path text, banner_path text,
 history_public boolean not null default false,
 stats jsonb not null default '{"saved":0,"lists":0,"completed":0,"rating":null}',
 updated_at timestamptz not null default now()
);
create table if not exists public.yoru_public_history (
 user_id uuid not null references public.yoru_public_profiles(user_id) on delete cascade,
 anime_id text not null check(anime_id ~ '^(mal|shikimori|anilist|lib|vost|kitsu|go)-[0-9]+$'),
 season integer not null, episode integer not null, watched_at timestamptz not null,
 primary key(user_id,anime_id)
);
create index if not exists yoru_history_order on public.yoru_public_history(user_id,watched_at desc);
create or replace function yoru_social_private.mirror_nickname() returns trigger language plpgsql security definer set search_path='' as $$
begin insert into public.yoru_public_profiles(user_id,nickname) values(new.user_id,new.nickname)
 on conflict(user_id) do update set nickname=excluded.nickname; return new; end; $$;
drop trigger if exists yoru_social_nickname on public.yoru_nicknames;
create trigger yoru_social_nickname after insert or update of nickname on public.yoru_nicknames for each row execute function yoru_social_private.mirror_nickname();
insert into public.yoru_public_profiles(user_id,nickname) select user_id,nickname from public.yoru_nicknames on conflict(user_id) do nothing;

-- Export only bounded, explicit fields from private state. Never send its JSON to guests.
create or replace function yoru_social_private.project_state(uid uuid, d jsonb) returns void language plpgsql security definer set search_path='' as $$
declare saved bigint; lists integer; completed bigint; rating numeric;
begin
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
create or replace function yoru_social_private.state_changed() returns trigger language plpgsql security definer set search_path='' as $$
begin perform yoru_social_private.project_state(new.user_id,new.data); return new; exception when others then raise warning 'Social projection deferred; private state saved'; return new; end; $$;
drop trigger if exists yoru_social_state on public.yoru_state;
create trigger yoru_social_state after insert or update of data on public.yoru_state for each row execute function yoru_social_private.state_changed();

create or replace function public.yoru_social_save_profile(p_bio text,p_history boolean,p_avatar text default null,p_banner text default null)
returns void language plpgsql security definer set search_path='' as $$
declare uid uuid:=yoru_social_private.require_user(); path text;
begin
 if p_bio is null or char_length(p_bio)>240 then raise exception 'invalid_profile'; end if;
 foreach path in array array[p_avatar,p_banner] loop
  if path is not null and (split_part(path,'/',1)<>uid::text or not exists(select 1 from storage.objects where bucket_id='social-profile-media' and name=path)) then raise exception 'invalid_image'; end if;
 end loop;
 update public.yoru_public_profiles set bio=p_bio,history_public=coalesce(p_history,false),avatar_path=p_avatar,banner_path=p_banner,updated_at=now() where user_id=uid;
 perform yoru_social_private.project_state(uid,coalesce((select data from public.yoru_state where user_id=uid),'{}'));
end; $$;

create table if not exists public.yoru_comments (
 id uuid primary key default gen_random_uuid(),
 anime_id text not null check(anime_id ~ '^(mal|shikimori|anilist|lib|vost|kitsu|go)-[0-9]+$'),
 season integer not null check(season between 0 and 9999), episode integer not null check(episode between 0 and 999999),
 author_id uuid not null references public.yoru_public_profiles(user_id) on delete cascade,
 parent_id uuid, body text not null check(char_length(body)<=2000),
 created_at timestamptz not null default now(), edited_at timestamptz, deleted_at timestamptz,
 unique(id,anime_id,season,episode),
 foreign key(parent_id,anime_id,season,episode) references public.yoru_comments(id,anime_id,season,episode) on delete cascade
);
create index if not exists yoru_comments_episode on public.yoru_comments(anime_id,season,episode,parent_id,created_at,id);
create index if not exists yoru_comments_rate on public.yoru_comments(author_id,created_at desc);
create or replace function public.yoru_social_comment(p_anime text,p_season integer,p_episode integer,p_body text,p_parent uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=yoru_social_private.require_user(); cid uuid;
begin
 perform pg_advisory_xact_lock(hashtext(uid::text));
 if p_body is null or char_length(btrim(p_body)) not between 1 and 2000 then raise exception 'invalid_comment'; end if;
 if (select count(*) from public.yoru_comments where author_id=uid and created_at>now()-interval '1 minute')>=5 then raise exception 'rate_limited'; end if;
 if p_parent is not null and not exists(select 1 from public.yoru_comments where id=p_parent and parent_id is null and anime_id=p_anime and season=p_season and episode=p_episode) then raise exception 'invalid_parent'; end if;
 insert into public.yoru_comments(anime_id,season,episode,author_id,parent_id,body) values(p_anime,p_season,p_episode,uid,p_parent,btrim(p_body)) returning id into cid;
 return cid;
end; $$;
create or replace function public.yoru_social_edit_comment(p_id uuid,p_body text default null) returns void language plpgsql security definer set search_path='' as $$
declare uid uuid:=yoru_social_private.require_user();
begin
 if p_body is not null and char_length(btrim(p_body)) not between 1 and 2000 then raise exception 'invalid_comment'; end if;
 update public.yoru_comments set body=coalesce(btrim(p_body),''),edited_at=now(),deleted_at=case when p_body is null then now() else null end where id=p_id and author_id=uid and deleted_at is null;
 if not found then raise exception 'comment_not_owned'; end if;
end; $$;

alter table public.yoru_public_profiles enable row level security;
alter table public.yoru_public_history enable row level security;
alter table public.yoru_comments enable row level security;
revoke all on public.yoru_public_profiles,public.yoru_public_history,public.yoru_comments from public,anon,authenticated;
grant select on public.yoru_public_profiles,public.yoru_public_history,public.yoru_comments to anon,authenticated;
drop policy if exists social_profiles_read on public.yoru_public_profiles;
create policy social_profiles_read on public.yoru_public_profiles for select to anon,authenticated using(true);
drop policy if exists social_history_read on public.yoru_public_history;
create policy social_history_read on public.yoru_public_history for select to anon,authenticated using(exists(select 1 from public.yoru_public_profiles p where p.user_id=yoru_public_history.user_id and p.history_public));
drop policy if exists social_comments_read on public.yoru_comments;
create policy social_comments_read on public.yoru_comments for select to anon,authenticated using(true);
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('social-profile-media','social-profile-media',true,3145728,array['image/webp','image/jpeg','image/png']) on conflict(id) do nothing;
drop policy if exists social_profile_upload on storage.objects;
create policy social_profile_upload on storage.objects for insert to authenticated with check(bucket_id='social-profile-media' and yoru_social_private.registered() and split_part(name,'/',1)=auth.uid()::text);
drop policy if exists social_profile_owner_read on storage.objects;
create policy social_profile_owner_read on storage.objects for select to authenticated using(bucket_id='social-profile-media' and yoru_social_private.registered() and split_part(name,'/',1)=auth.uid()::text);
drop policy if exists social_profile_delete on storage.objects;
create policy social_profile_delete on storage.objects for delete to authenticated using(bucket_id='social-profile-media' and yoru_social_private.registered() and split_part(name,'/',1)=auth.uid()::text);

revoke all on function yoru_social_private.registered(),yoru_social_private.require_user(),yoru_social_private.mirror_nickname(),yoru_social_private.project_state(uuid,jsonb),yoru_social_private.state_changed() from public,anon,authenticated;
grant execute on function yoru_social_private.registered(),yoru_social_private.require_user() to anon,authenticated;
revoke all on function public.yoru_social_save_profile(text,boolean,text,text),public.yoru_social_comment(text,integer,integer,text,uuid),public.yoru_social_edit_comment(uuid,text) from public,anon,authenticated;
grant execute on function public.yoru_social_save_profile(text,boolean,text,text),public.yoru_social_comment(text,integer,integer,text,uuid),public.yoru_social_edit_comment(uuid,text) to authenticated;
-- Only the existing account-deletion server may enumerate an owner's uploads.
create or replace function public.yoru_social_owned_media(p_user uuid)
returns table(bucket_id text,name text) language sql security definer set search_path='' as $$
 select o.bucket_id,o.name from storage.objects o where
 (o.bucket_id='social-profile-media' and split_part(o.name,'/',1)=p_user::text)
 or (o.bucket_id='social-chat-media' and split_part(o.name,'/',2)=p_user::text)
 order by o.bucket_id,o.name limit 100;
$$;
revoke all on function public.yoru_social_owned_media(uuid) from public,anon,authenticated;
grant execute on function public.yoru_social_owned_media(uuid) to service_role;
notify pgrst,'reload schema';
commit;
