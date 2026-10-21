-- One-time migration. Existing accounts and lists are preserved.
begin;
create or replace function public.yoru_clean_nickname(value text)
returns text language sql immutable strict set search_path='' as $$
  select btrim(regexp_replace(normalize(value,NFKC),'[[:space:]]+',' ','g'));
$$;
create or replace function public.yoru_nickname_key(value text)
returns text language sql immutable strict set search_path='' as $$
  select lower(public.yoru_clean_nickname(value));
$$;
create table if not exists public.yoru_nicknames (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null check(char_length(nickname) between 1 and 40),
  nickname_key text generated always as (public.yoru_nickname_key(nickname)) stored,
  constraint yoru_nicknames_unique unique(nickname_key)
);
alter table public.yoru_nicknames enable row level security;
revoke all on public.yoru_nicknames from public,anon,authenticated;
grant select on public.yoru_nicknames to authenticated;
drop policy if exists "Read own nickname" on public.yoru_nicknames;
create policy "Read own nickname" on public.yoru_nicknames for select to authenticated using(user_id=(select auth.uid()));

-- Abort atomically if old accounts already share a nickname. Never rename them silently.
insert into public.yoru_nicknames(user_id,nickname)
select u.id,coalesce(nullif(public.yoru_clean_nickname(s.data#>>'{preferences,name}'),''),
  nullif(public.yoru_clean_nickname(u.raw_user_meta_data->>'name'),''),'user_'||left(replace(u.id::text,'-',''),20))
from auth.users u left join public.yoru_state s on s.user_id=u.id
where not exists(select 1 from public.yoru_nicknames n where n.user_id=u.id);

create or replace function public.yoru_reserve_signup_nickname()
returns trigger language plpgsql security definer set search_path='' as $$
declare chosen text;
begin
 chosen:=coalesce(nullif(public.yoru_clean_nickname(new.raw_user_meta_data->>'name'),''),'user_'||left(replace(new.id::text,'-',''),20));
 insert into public.yoru_nicknames(user_id,nickname) values(new.id,chosen);
 return new;
end; $$;
revoke all on function public.yoru_reserve_signup_nickname() from public,anon,authenticated;
drop trigger if exists yoru_signup_nickname on auth.users;
create trigger yoru_signup_nickname after insert on auth.users for each row execute function public.yoru_reserve_signup_nickname();

create or replace function public.yoru_enforce_profile_nickname()
returns trigger language plpgsql security definer set search_path='' as $$
declare chosen text;
begin
 if tg_op='UPDATE' and new.data#>>'{preferences,name}' is not distinct from old.data#>>'{preferences,name}' then return new; end if;
 chosen:=nullif(public.yoru_clean_nickname(new.data#>>'{preferences,name}'),'');
 if chosen is null then select nickname into chosen from public.yoru_nicknames where user_id=new.user_id; end if;
 if chosen is null then raise exception 'nickname_invalid'; end if;
 update public.yoru_nicknames set nickname=chosen where user_id=new.user_id;
 if not found then raise exception 'nickname_invalid'; end if;
 new.data:=jsonb_set(new.data,'{preferences}',coalesce(new.data->'preferences','{}'::jsonb)||jsonb_build_object('name',chosen));
 return new;
end; $$;
revoke all on function public.yoru_enforce_profile_nickname() from public,anon,authenticated;
drop trigger if exists yoru_profile_nickname on public.yoru_state;
create trigger yoru_profile_nickname before insert or update of data on public.yoru_state for each row execute function public.yoru_enforce_profile_nickname();
update public.yoru_state s set data=jsonb_set(s.data,'{preferences}',coalesce(s.data->'preferences','{}'::jsonb)||jsonb_build_object('name',n.nickname)),revision=revision+1
from public.yoru_nicknames n where n.user_id=s.user_id and s.data#>>'{preferences,name}' is distinct from n.nickname;

create or replace function public.yoru_nickname_available(candidate text)
returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(char_length(public.yoru_clean_nickname(candidate)) between 1 and 40,false)
 and not exists(select 1 from public.yoru_nicknames where nickname_key=public.yoru_nickname_key(candidate) and user_id is distinct from (select auth.uid()));
$$;
revoke all on function public.yoru_nickname_available(text) from public;
grant execute on function public.yoru_nickname_available(text) to anon,authenticated;
commit;
