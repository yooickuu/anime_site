-- Read-only display metadata for saved legacy IDs; no private state is modified.
begin;
create or replace function public.yoru_social_public_lists(p_user uuid,p_list text default 'all',p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare d jsonb; items jsonb; total bigint; labels jsonb;
begin
 if not exists(select 1 from public.yoru_public_profiles where user_id=p_user and (lists_public or user_id=auth.uid())) then return jsonb_build_object('visible',false); end if;
 select data into d from public.yoru_state where user_id=p_user;
 select coalesce(jsonb_agg(jsonb_build_object('id',s->>'id','key',s->>'key','name',left(s->>'name',80))),'[]') into labels
 from jsonb_array_elements(coalesce(d->'statuses','[]')) s;
 with ids as (
 select key anime_id from jsonb_each(coalesce(d->'entries','{}'))
 where p_list='all' or (p_list='favorites' and value->>'favorite'='true') or value->>'status'=p_list or coalesce(value->'legacyLists','[]') ? p_list
 union select jsonb_array_elements_text(coalesce(c->'items','[]')) from jsonb_array_elements(coalesce(d->'collections','[]')) c where c->>'id'=p_list
 ), valid as (select anime_id from ids where anime_id ~ '^(mal|shikimori|anilist|lib|vost|kitsu|go)-[0-9]+$')
 select (select count(*) from valid),coalesce((select jsonb_agg(jsonb_build_object('anime_id',anime_id,'card',jsonb_build_object(
 'title',left(d->'entries'->anime_id->'anime'->>'title',300),
 'originalTitle',left(coalesce(d->'entries'->anime_id->'anime'->>'originalTitle',d->'entries'->anime_id->'anime'->'translations'->'en'->>0),300),
 'image',left(coalesce(d->'entries'->anime_id->'anime'->>'image',d->'entries'->anime_id->'anime'->>'posterFallback'),2000),
 'year',left(d->'entries'->anime_id->'anime'->>'year',4),
 'type',left(d->'entries'->anime_id->'anime'->>'type',40),
 'malId',left(coalesce(d->'entries'->anime_id->'anime'->>'malId',d->'entries'->anime_id->'anime'->'ids'->>'mal'),12)
 ))) from (select anime_id from valid order by anime_id offset greatest(0,least(coalesce(p_offset,0),100000)) limit 40) p),'[]') into total,items;
 return jsonb_build_object('visible',true,'statuses',labels,'total',total,'items',items);
end; $$;

notify pgrst,'reload schema';
commit;
