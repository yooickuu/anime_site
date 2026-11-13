-- 80 active achievements: existing records and time counters remain untouched.
-- Additive, idempotent rules only; no table, playback or access-policy changes.
begin;
create or replace function public.yoru_activity_sync(p_session uuid default null,p_seconds bigint default 0,p_night bigint default 0)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=yoru_social_private.require_user(); old public.yoru_watch_sessions; met public.yoru_watch_metrics;
 delta bigint:=0; credit bigint:=0; night bigint:=0; d jsonb; eps bigint; titles bigint; fav bigint; candidates text[]:=array[]::text[]; badge text; tier record; metrics jsonb;
begin
 perform pg_advisory_xact_lock(hashtext('activity:'||uid::text));
 insert into public.yoru_watch_metrics(user_id) values(uid) on conflict do nothing;
 select * into met from public.yoru_watch_metrics where user_id=uid for update;
 select coalesce(data,'{}') into d from public.yoru_state where user_id=uid;
 select count(*) into eps from jsonb_each(coalesce(d->'progress','{}')) p where p.value->>'completed'='true' and p.value->>'id'<>'sintel';
 select count(*) into titles from jsonb_each(coalesce(d->'entries','{}')) p where p.value->>'status'='completed';
 select count(*) into fav from jsonb_each(coalesce(d->'entries','{}')) p where p.value->>'favorite'='true';
 for tier in select * from (values ('episode_1',1),('episode_10',10),('episode_50',50),('episode_100',100),('episode_500',500)) t(id,n) loop if eps>=tier.n then candidates:=array_append(candidates,tier.id); end if; end loop;
 for tier in select * from (values ('title_1',1),('title_10',10),('title_50',50),('title_5',5),('title_25',25),('title_100',100)) t(id,n) loop if titles>=tier.n then candidates:=array_append(candidates,tier.id); end if; end loop;
 if fav>=10 then candidates:=array_append(candidates,'favorites'); end if;
 if exists(select 1 from public.yoru_messages where author_id=uid) then candidates:=array_append(candidates,'message'); end if;
 if exists(select 1 from public.yoru_comments where author_id=uid and deleted_at is null) then candidates:=array_append(candidates,'comment'); end if;
 if exists(select 1 from public.yoru_friendships where status='accepted' and uid in (requester,recipient)) then candidates:=array_append(candidates,'friend'); end if;
 if (select count(*) from (select 1 from public.yoru_messages where author_id=uid limit 50) q)>=50 then candidates:=array_append(candidates,'message_50'); end if;
 if (select count(*) from (select 1 from public.yoru_comments where author_id=uid and deleted_at is null limit 10) q)>=10 then candidates:=array_append(candidates,'comment_10'); end if;
 if (select count(*) from (select 1 from public.yoru_friendships where status='accepted' and uid in (requester,recipient) limit 5) q)>=5 then candidates:=array_append(candidates,'friend_5'); end if;

 select jsonb_build_object('episodes',eps,'titles',titles,'favorites',fav,
 'saved',(select count(*) from jsonb_each(coalesce(d->'entries','{}'))),
 'ratings',(select count(*) from jsonb_each(coalesce(d->'entries','{}')) e where e.value->>'rating' ~ '^[0-9]+([.][0-9]+)?$' and (e.value->>'rating')::numeric>0),
 'messages',(select count(*) from (select 1 from public.yoru_messages where author_id=uid limit 500) q),
 'comments',(select count(*) from (select 1 from public.yoru_comments where author_id=uid and deleted_at is null limit 100) q),
 'friends',(select count(*) from (select 1 from public.yoru_friendships where status='accepted' and uid in (requester,recipient) limit 25) q),
 'collections',case when jsonb_typeof(d->'collections')='array' then jsonb_array_length(d->'collections') when jsonb_typeof(d->'collections')='object' then (select count(*) from jsonb_each(d->'collections')) else 0 end + (select count(*) from jsonb_array_elements(coalesce(d->'statuses','[]')) st where coalesce(st->>'key','')='' and nullif(st->>'name','') is not null)) into metrics;
 for tier in select * from (values ('title_3','titles',3),('title_200','titles',200),('title_500','titles',500),('saved_1','saved',1),('saved_10','saved',10),('saved_25','saved',25),('saved_50','saved',50),('saved_100','saved',100),('saved_250','saved',250),('favorite_1','favorites',1),('favorite_25','favorites',25),('favorite_50','favorites',50),('rating_1','ratings',1),('rating_10','ratings',10),('rating_50','ratings',50),('message_10','messages',10),('message_100','messages',100),('message_500','messages',500),('comment_25','comments',25),('comment_100','comments',100),('friend_10','friends',10),('friend_25','friends',25),('collection','collections',1)) t(id,metric,n) loop if coalesce((metrics->>tier.metric)::bigint,0)>=tier.n then candidates:=array_append(candidates,tier.id); end if; end loop;
 if d->'preferences'->>'appearance' in ('graphite','iris','forest','wine','sakura','sand','slate','lagoon','ember','midnight') then candidates:=array_append(candidates,'theme_'||(d->'preferences'->>'appearance')); end if;

 -- Diverse actions, derived from real records (never supplied badge IDs).
 if exists(select 1 from public.yoru_public_profiles where user_id=uid and nullif(btrim(avatar_path),'') is not null) then candidates:=array_append(candidates,'profile_avatar'); end if;
 if exists(select 1 from public.yoru_public_profiles where user_id=uid and nullif(btrim(banner_path),'') is not null) then candidates:=array_append(candidates,'profile_banner'); end if;
 if exists(select 1 from public.yoru_public_profiles where user_id=uid and nullif(btrim(bio),'') is not null) then candidates:=array_append(candidates,'profile_bio'); end if;
 if exists(select 1 from public.yoru_public_profiles where user_id=uid and nullif(btrim(avatar_path),'') is not null and nullif(btrim(banner_path),'') is not null and nullif(btrim(bio),'') is not null) then candidates:=array_append(candidates,'profile_complete'); end if;
 if exists(select 1 from jsonb_each(coalesce(d->'entries','{}')) e where e.value->>'status'='planned') then candidates:=array_append(candidates,'plan_1'); end if;
 if (select count(*) from jsonb_each(coalesce(d->'entries','{}')) e where e.value->>'status'='planned')>=10 then candidates:=array_append(candidates,'plan_10'); end if;
 if exists(select 1 from jsonb_each(coalesce(d->'entries','{}')) e where e.value->>'status'='watching') then candidates:=array_append(candidates,'watching_1'); end if;
 if exists(select 1 from jsonb_each(coalesce(d->'entries','{}')) e where e.value->>'status'='ongoing') then candidates:=array_append(candidates,'ongoing_1'); end if;
 if exists(select 1 from jsonb_array_elements(coalesce(d->'statuses','[]')) st where coalesce(st->>'key','')='' and nullif(st->>'name','') is not null and (select count(*) from jsonb_each(coalesce(d->'entries','{}')) e where e.value->>'status'=st->>'id' or coalesce(e.value->'legacyLists','[]') ? (st->>'id'))>=5) then candidates:=array_append(candidates,'curated_5'); end if;
 if (select count(*) from jsonb_each(coalesce(d->'entries','{}')) e where e.value->>'favorite'='true' and case when e.value->>'rating' ~ '^[0-9]+([.][0-9]+)?$' then (e.value->>'rating')::numeric between 1 and 10 else false end)>=5 then candidates:=array_append(candidates,'rated_favorite_5'); end if;
 if (select count(*) from jsonb_each(coalesce(d->'entries','{}')) e where e.value->>'status'='completed' and case when e.value->>'rating' ~ '^[0-9]+([.][0-9]+)?$' then (e.value->>'rating')::numeric between 1 and 10 else false end)>=10 then candidates:=array_append(candidates,'rated_completed_10'); end if;
 if (select count(distinct case when e.value->>'rating' ~ '^[0-9]+([.][0-9]+)?$' then (e.value->>'rating')::numeric end) from jsonb_each(coalesce(d->'entries','{}')) e where case when e.value->>'rating' ~ '^[0-9]+([.][0-9]+)?$' then (e.value->>'rating')::numeric between 1 and 10 else false end)>=3 then candidates:=array_append(candidates,'rating_range'); end if;
 if (select count(distinct nullif(e.value->>'status','')) from jsonb_each(coalesce(d->'entries','{}')) e)>=3 then candidates:=array_append(candidates,'saved_statuses'); end if;
 if exists(select 1 from public.yoru_comments c join public.yoru_comments parent on parent.id=c.parent_id where c.author_id=uid and parent.author_id<>uid and c.deleted_at is null) then candidates:=array_append(candidates,'reply_comment'); end if;
 if (select count(distinct anime_id) from public.yoru_comments where author_id=uid and deleted_at is null)>=3 then candidates:=array_append(candidates,'comment_titles_3'); end if;
 if (select count(distinct (anime_id,season,episode)) from public.yoru_comments where author_id=uid and deleted_at is null)>=5 then candidates:=array_append(candidates,'comment_episodes_5'); end if;
 if exists(select 1 from public.yoru_comments where author_id=uid and deleted_at is null and char_length(btrim(body))>=300) then candidates:=array_append(candidates,'long_review'); end if;
 if exists(select 1 from public.yoru_messages m join public.yoru_messages parent on parent.id=m.reply_to where m.author_id=uid and parent.author_id<>uid) then candidates:=array_append(candidates,'reply_message'); end if;
 if exists(select 1 from public.yoru_messages where author_id=uid and image_path is not null) then candidates:=array_append(candidates,'photo_message'); end if;
 if exists(select 1 from public.yoru_messages where author_id=uid and anime_id is not null) then candidates:=array_append(candidates,'share_anime'); end if;
 if (select count(distinct anime_id) from public.yoru_messages where author_id=uid)>=5 then candidates:=array_append(candidates,'shared_titles_5'); end if;
 if (select count(distinct room_id) from public.yoru_messages where author_id=uid)>=3 then candidates:=array_append(candidates,'chat_rooms_3'); end if;
 if exists(select 1 from public.yoru_conversations where owner_id=uid and kind='group') then candidates:=array_append(candidates,'group_create'); end if;
 if exists(select 1 from public.yoru_chat_members m join public.yoru_conversations c on c.id=m.room_id where m.user_id=uid and c.owner_id<>uid and c.kind='group') then candidates:=array_append(candidates,'group_join'); end if;
 if exists(select 1 from public.yoru_messages m join public.yoru_conversations c on c.id=m.room_id where m.author_id=uid and c.kind='group') then candidates:=array_append(candidates,'group_message'); end if;
 if exists(select 1 from public.yoru_watch_rooms where host_id=uid) then candidates:=array_append(candidates,'host_room'); end if;
 if exists(select 1 from public.yoru_watch_members m join public.yoru_watch_rooms r on r.id=m.room_id where m.user_id=uid and r.host_id<>uid) then candidates:=array_append(candidates,'join_room'); end if;
 if exists(select 1 from public.yoru_watch_messages where author_id=uid) then candidates:=array_append(candidates,'room_message'); end if;
 foreach badge in array candidates loop if not met.badges ? badge then met.badges:=met.badges||jsonb_build_object(badge,now()); end if; end loop;
 update public.yoru_watch_metrics set badges=met.badges where user_id=uid;
 return jsonb_build_object('badges',met.badges);
end; $$;

revoke all on function public.yoru_activity_sync(uuid,bigint,bigint) from public,anon;
grant execute on function public.yoru_activity_sync(uuid,bigint,bigint) to authenticated;
notify pgrst,'reload schema';
commit;
