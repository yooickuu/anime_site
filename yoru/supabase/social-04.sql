-- Per-member read cursors: no message body or email in notification responses.
begin;
alter table public.yoru_chat_members add column if not exists last_read_at timestamptz not null default '-infinity';
alter table public.yoru_chat_members add column if not exists last_read_id uuid not null default '00000000-0000-0000-0000-000000000000';
create or replace function public.yoru_social_unread()
returns table(room_id uuid) language plpgsql stable security definer set search_path='' as $$
declare uid uuid:=yoru_social_private.require_user();
begin
 return query select cm.room_id from public.yoru_chat_members cm
 where cm.user_id=uid and exists(select 1 from public.yoru_messages m
 where m.room_id=cm.room_id and m.author_id<>uid
 and (m.created_at,m.id)>(cm.last_read_at,cm.last_read_id));
end; $$;
create or replace function public.yoru_social_mark_read(p_room uuid,p_message uuid)
returns void language plpgsql security definer set search_path='' as $$
declare uid uuid:=yoru_social_private.require_user(); stamp timestamptz;
begin
 if not yoru_social_private.is_member(p_room) then raise exception 'members_only'; end if;
 select created_at into stamp from public.yoru_messages where id=p_message and room_id=p_room;
 if stamp is null then raise exception 'message_not_found'; end if;
 update public.yoru_chat_members set last_read_at=stamp,last_read_id=p_message
 where room_id=p_room and user_id=uid and (last_read_at,last_read_id)<(stamp,p_message);
end; $$;
revoke all on function public.yoru_social_unread(),public.yoru_social_mark_read(uuid,uuid) from public,anon,authenticated;
grant execute on function public.yoru_social_unread(),public.yoru_social_mark_read(uuid,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
