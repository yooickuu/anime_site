-- Permanently remove a comment and its replies using the existing cascade FK.
begin;
create or replace function public.yoru_social_edit_comment(p_id uuid,p_body text default null)
returns void language plpgsql security definer set search_path='' as $$
declare uid uuid:=yoru_social_private.require_user();
begin
 if p_body is null then
  delete from public.yoru_comments where id=p_id and author_id=uid;
 else
  if char_length(btrim(p_body)) not between 1 and 2000 then raise exception 'invalid_comment'; end if;
  update public.yoru_comments set body=btrim(p_body),edited_at=now()
  where id=p_id and author_id=uid and deleted_at is null;
 end if;
 if not found then raise exception 'comment_not_owned'; end if;
end; $$;
revoke all on function public.yoru_social_edit_comment(uuid,text) from public,anon,authenticated;
grant execute on function public.yoru_social_edit_comment(uuid,text) to authenticated;
-- Remove previously deleted placeholders and all replies beneath them as well.
delete from public.yoru_comments where deleted_at is not null;
create or replace function public.yoru_social_remove_chat(p_room uuid)
returns void language plpgsql security definer set search_path='' as $$
declare uid uuid:=yoru_social_private.require_user(); kind text;
begin
 if not yoru_social_private.is_member(p_room) then raise exception 'members_only'; end if;
 select c.kind into kind from public.yoru_conversations c where c.id=p_room;
 if kind='group' then perform public.yoru_social_manage_room(p_room,'leave');
 else delete from public.yoru_chat_members where room_id=p_room and user_id=uid; end if;
end; $$;
revoke all on function public.yoru_social_remove_chat(uuid) from public,anon,authenticated;
grant execute on function public.yoru_social_remove_chat(uuid) to authenticated;
-- A new message from a friend brings a removed DM back, like a new conversation.
create or replace function yoru_social_private.restore_dm_member()
returns trigger language plpgsql security definer set search_path='' as $$
declare pair text; peer uuid;
begin
 select dm_key into pair from public.yoru_conversations where id=new.room_id and kind='dm';
 if pair is null then return new; end if;
 peer:=case when split_part(pair,':',1)::uuid=new.author_id then split_part(pair,':',2)::uuid else split_part(pair,':',1)::uuid end;
 if yoru_social_private.is_friend(new.author_id,peer) then
  insert into public.yoru_chat_members(room_id,user_id,last_read_at,last_read_id)
  values(new.room_id,peer,new.created_at-interval '1 microsecond','00000000-0000-0000-0000-000000000000') on conflict do nothing;
 end if;
 return new;
end; $$;
revoke all on function yoru_social_private.restore_dm_member() from public,anon,authenticated;
drop trigger if exists social_restore_dm_member on public.yoru_messages;
create trigger social_restore_dm_member after insert on public.yoru_messages for each row execute function yoru_social_private.restore_dm_member();
notify pgrst,'reload schema';
commit;
