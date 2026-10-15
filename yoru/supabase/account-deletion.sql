-- Run in the Supabase SQL Editor. Does NOT delete any existing account.
-- Then deploy supabase/functions/delete-account/index.ts as "delete-account".
begin;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;
create schema if not exists yooickuu_private;
revoke all on schema yooickuu_private from public,anon,authenticated;
create table if not exists yooickuu_private.secrets (
  id boolean primary key default true check(id), secret bytea not null
);
insert into yooickuu_private.secrets(id,secret) values(true,extensions.gen_random_bytes(32)) on conflict(id) do nothing;
create table if not exists yooickuu_private.deletion_guard (
  fingerprint text primary key, attempts smallint not null, expires_at timestamptz not null
);
revoke all on all tables in schema yooickuu_private from public,anon,authenticated;

create or replace function yooickuu_private.email_fingerprint(address text)
returns text language sql security definer set search_path='' as $$
  select encode(extensions.hmac(convert_to(lower(btrim(address)),'UTF8'),secret,'sha256'),'hex')
  from yooickuu_private.secrets where id=true;
$$;
revoke all on function yooickuu_private.email_fingerprint(text) from public,anon,authenticated;

create or replace function yooickuu_private.on_account_deleted()
returns trigger language plpgsql security definer set search_path='' as $$
declare mark text;
begin
  -- Storage must be erased through its API, never by deleting storage.objects.
  if exists(select 1 from storage.objects where owner_id=old.id::text or (bucket_id='avatars' and (storage.foldername(name))[1]=old.id::text)) then
    raise exception 'Avatar cleanup is incomplete';
  end if;
  if old.email is not null and old.email<>'' then
    mark:=yooickuu_private.email_fingerprint(old.email);
    perform pg_advisory_xact_lock(hashtextextended(mark,0));
    insert into yooickuu_private.deletion_guard as guard(fingerprint,attempts,expires_at)
    values(mark,1,now()+interval '3 days')
    on conflict(fingerprint) do update set
      attempts=case when guard.expires_at<=now() then 1 else least(2,guard.attempts+1) end,
      expires_at=now()+interval '3 days';
  end if;
  return old;
end; $$;
revoke all on function yooickuu_private.on_account_deleted() from public,anon,authenticated;
drop trigger if exists yooickuu_account_deleted on auth.users;
create trigger yooickuu_account_deleted before delete on auth.users for each row execute function yooickuu_private.on_account_deleted();

create or replace function yooickuu_private.check_registration()
returns trigger language plpgsql security definer set search_path='' as $$
declare mark text;
begin
  if new.email is not null and new.email<>'' then
    mark:=yooickuu_private.email_fingerprint(new.email);
    perform pg_advisory_xact_lock(hashtextextended(mark,0));
    if exists(select 1 from yooickuu_private.deletion_guard where fingerprint=mark and attempts>=2 and expires_at>now()) then
      raise exception 'registration_cooldown' using errcode='P0001';
    end if;
    delete from yooickuu_private.deletion_guard where fingerprint=mark and expires_at<=now();
  end if;
  return new;
end; $$;
revoke all on function yooickuu_private.check_registration() from public,anon,authenticated;
drop trigger if exists yooickuu_registration_guard on auth.users;
create trigger yooickuu_registration_guard before insert on auth.users for each row execute function yooickuu_private.check_registration();

-- Expired marks stop blocking immediately and are physically removed every minute.
select cron.schedule('yooickuu-expire-deletion-guards','* * * * *',
  $job$delete from yooickuu_private.deletion_guard where expires_at<=now()$job$);

create or replace function public.yooickuu_account_active()
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from auth.users where id=(select auth.uid()));
$$;
revoke all on function public.yooickuu_account_active() from public,anon;
grant execute on function public.yooickuu_account_active() to authenticated;
-- A previously issued JWT cannot create new files after its account is gone.
drop policy if exists "Upload own avatar" on storage.objects;
create policy "Upload own avatar" on storage.objects for insert to authenticated
with check(bucket_id='avatars' and (storage.foldername(name))[1]=(select auth.uid())::text and (select public.yooickuu_account_active()));

create or replace function public.yooickuu_deletion_ready()
returns boolean language sql security definer set search_path='' as $$
  select exists(select 1 from pg_trigger where tgname='yooickuu_registration_guard' and tgenabled='O')
    and exists(select 1 from pg_trigger where tgname='yooickuu_account_deleted' and tgenabled='O');
$$;
revoke all on function public.yooickuu_deletion_ready() from public,anon,authenticated;
grant execute on function public.yooickuu_deletion_ready() to service_role;
commit;
