begin;
create table if not exists public.yoru_login_limits (
 bucket text primary key, attempts integer not null, expires_at timestamptz not null
);
alter table public.yoru_login_limits enable row level security;
revoke all on public.yoru_login_limits from public,anon,authenticated;
-- Only the Edge function may resolve a nickname to an email address.
create or replace function public.yoru_login_lookup(candidate text, client_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare k text; hits integer; address text; limited boolean:=false;
begin
 if candidate is null or char_length(candidate)>160 or client_key !~ '^[a-f0-9]{64}$' or client_key is null then
  return jsonb_build_object('limited',true);
 end if;
 delete from public.yoru_login_limits where expires_at < now()-interval '1 hour';
 foreach k in array array['ip:'||client_key,'nick:'||md5(public.yoru_nickname_key(candidate))] loop
  insert into public.yoru_login_limits as lim(bucket,attempts,expires_at)
  values(k,1,now()+interval '10 minutes')
  on conflict(bucket) do update set
   attempts=case when lim.expires_at<=now() then 1 else lim.attempts+1 end,
   expires_at=case when lim.expires_at<=now() then now()+interval '10 minutes' else lim.expires_at end
  returning attempts into hits;
  if hits > (case when left(k,3)='ip:' then 50 else 10 end) then limited:=true; end if;
 end loop;
 if limited then return jsonb_build_object('limited',true); end if;
 select u.email into address from public.yoru_nicknames n join auth.users u on u.id=n.user_id
 where n.nickname_key=public.yoru_nickname_key(candidate);
 return jsonb_build_object('email',address,'limited',false);
end; $$;
revoke all on function public.yoru_login_lookup(text,text) from public,anon,authenticated;
grant execute on function public.yoru_login_lookup(text,text) to service_role;
commit;
