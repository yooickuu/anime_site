-- Stage 4: 66 badge definitions, retained legacy awards, no watch-time credit.
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
 for tier in select * from (values ('episode_1',1),('episode_10',10),('episode_50',50),('episode_100',100),('episode_500',500),('episode_250',250),('episode_1000',1000),('episode_2000',2000)) t(id,n) loop if eps>=tier.n then candidates:=array_append(candidates,tier.id); end if; end loop;
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
 'collections',case when jsonb_typeof(d->'collections')='array' then jsonb_array_length(d->'collections') when jsonb_typeof(d->'collections')='object' then (select count(*) from jsonb_each(d->'collections')) else 0 end) into metrics;
 for tier in select * from (values ('episode_25','episodes',25),('episode_750','episodes',750),('episode_5000','episodes',5000),('title_3','titles',3),('title_200','titles',200),('title_500','titles',500),('saved_1','saved',1),('saved_10','saved',10),('saved_25','saved',25),('saved_50','saved',50),('saved_100','saved',100),('saved_250','saved',250),('favorite_1','favorites',1),('favorite_25','favorites',25),('favorite_50','favorites',50),('rating_1','ratings',1),('rating_10','ratings',10),('rating_50','ratings',50),('message_10','messages',10),('message_100','messages',100),('message_500','messages',500),('comment_25','comments',25),('comment_100','comments',100),('friend_10','friends',10),('friend_25','friends',25),('collection','collections',1)) t(id,metric,n) loop if coalesce((metrics->>tier.metric)::bigint,0)>=tier.n then candidates:=array_append(candidates,tier.id); end if; end loop;
 if d->'preferences'->>'appearance' in ('graphite','iris','forest','wine','sakura','sand','slate','lagoon','ember','midnight') then candidates:=array_append(candidates,'theme_'||(d->'preferences'->>'appearance')); end if;
 foreach badge in array candidates loop if not met.badges ? badge then met.badges:=met.badges||jsonb_build_object(badge,now()); end if; end loop;
 update public.yoru_watch_metrics set badges=met.badges where user_id=uid;
 return jsonb_build_object('badges',met.badges);
end; $$;

-- A one-off actual-playing event, not a duration counter. Offset is JS minutes west of UTC.
create or replace function public.yoru_badge_night(p_offset integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=yoru_social_private.require_user(); hour integer; earned jsonb;
begin
 if p_offset is null or p_offset < -840 or p_offset > 840 then raise exception 'invalid_offset'; end if;
 hour:=extract(hour from (now() at time zone 'UTC')-make_interval(mins=>p_offset));
 if hour>=5 then return '{}'::jsonb; end if;
 perform pg_advisory_xact_lock(hashtext('activity:'||uid::text));
 insert into public.yoru_watch_metrics(user_id) values(uid) on conflict do nothing;
 update public.yoru_watch_metrics set badges=badges||jsonb_build_object('night',now()) where user_id=uid and not badges ? 'night';
 select badges into earned from public.yoru_watch_metrics where user_id=uid;
 return jsonb_build_object('badges',earned);
end; $$;
revoke all on function public.yoru_badge_night(integer) from public,anon,authenticated;
grant execute on function public.yoru_badge_night(integer) to authenticated;
notify pgrst,'reload schema';
commit;
