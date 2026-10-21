-- Run once in your own Supabase project's SQL Editor.
-- No privileged service key is needed in the website.
create table if not exists public.yoru_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  revision bigint not null default 0,
  updated_at timestamptz not null default now(),
  constraint yoru_state_object check (jsonb_typeof(data) = 'object'),
  constraint yoru_state_size check (octet_length(data::text) < 1048576)
);
alter table public.yoru_state enable row level security;
revoke all on public.yoru_state from anon;
grant select, insert, update, delete on public.yoru_state to authenticated;
drop policy if exists "Read own Yoru data" on public.yoru_state;
create policy "Read own Yoru data" on public.yoru_state for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Create own Yoru data" on public.yoru_state;
create policy "Create own Yoru data" on public.yoru_state for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "Update own Yoru data" on public.yoru_state;
create policy "Update own Yoru data" on public.yoru_state for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "Delete own Yoru data" on public.yoru_state;
create policy "Delete own Yoru data" on public.yoru_state for delete to authenticated using ((select auth.uid()) = user_id);

-- Optional private media bucket. Uploads are managed by the owner in Dashboard.
insert into storage.buckets (id, name, public) values ('anime-media','anime-media',false) on conflict (id) do nothing;
drop policy if exists "Members can watch anime media" on storage.objects;
create policy "Members can watch anime media" on storage.objects for select to authenticated using (bucket_id = 'anime-media');

-- Private avatars, only readable and writable by their owners.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('avatars','avatars',false,2097152,array['image/jpeg','image/png','image/webp']) on conflict (id) do nothing;
drop policy if exists "Read own avatar" on storage.objects;
create policy "Read own avatar" on storage.objects for select to authenticated using (bucket_id='avatars' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists "Upload own avatar" on storage.objects;
create policy "Upload own avatar" on storage.objects for insert to authenticated with check (bucket_id='avatars' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists "Delete own avatar" on storage.objects;
create policy "Delete own avatar" on storage.objects for delete to authenticated using (bucket_id='avatars' and (storage.foldername(name))[1]=(select auth.uid())::text);
