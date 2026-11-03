import {result} from './common.js';
import {cacheFor,cacheKey,clearCache} from './cache.js';
export const PUBLIC_FIELDS='user_id,nickname,bio,avatar_path,banner_path,history_public,stats,updated_at';
const AUTHOR='user_id,nickname,avatar_path';
export function api(ctx,life){
 const c=ctx.client,read=q=>result(q.abortSignal(life.signal));
 const rpc=async(name,args)=>{const value=await result(c.rpc('yoru_social_'+name,args));if(['friend','room','manage_room','remove_chat'].includes(name))clearCache(c);return value;};
 // Recursive embeds are ambiguous in PostgREST. Resolve quotes in one RLS-filtered batch.
 async function withReplies(value,room){const single=!Array.isArray(value),rows=single?(value?[value]:[]):value;if(!rows.length)return value;
  const lookup=new Map(rows.map(m=>[m.id,m])),missing=[...new Set(rows.map(m=>m.reply_to).filter(id=>id&&!lookup.has(id)))];
  if(missing.length){const parents=await read(c.from('yoru_messages').select('id,body,author_id').eq('room_id',room).in('id',missing).limit(40));for(const p of parents)lookup.set(p.id,p);}
  const result=rows.map(m=>{const p=lookup.get(m.reply_to);return {...m,reply:p?{id:p.id,body:p.body,author_id:p.author_id}:null};});return single?result[0]:result;
 }
 const methods={
  profile:id=>read(c.from('yoru_public_profiles').select(PUBLIC_FIELDS).eq('user_id',id).maybeSingle()),
  people:q=>read(c.from('yoru_public_profiles').select(AUTHOR).ilike('nickname_key','%'+q.normalize('NFKC').trim().toLowerCase().replace(/[\\%_]/g,'')+'%').order('nickname_key').limit(20)),
  history:id=>read(c.rpc('yoru_social_history',{p_user:id})),
  comments:({anime,season,episode},parent=null,cursor=null)=>{let q=c.from('yoru_comments').select(`id,author_id,parent_id,body,created_at,edited_at,deleted_at,author:yoru_public_profiles!yoru_comments_author_id_fkey(${AUTHOR})`).eq('anime_id',anime).eq('season',season).eq('episode',episode);q=q.is('deleted_at',null);q=parent?q.eq('parent_id',parent):q.is('parent_id',null);if(cursor)q=q.or(`created_at.gt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.gt.${cursor.id})`);return read(q.order('created_at').order('id').limit(10));},
  commentRecord:id=>read(c.from('yoru_comments').select(`id,author_id,parent_id,body,created_at,edited_at,deleted_at,author:yoru_public_profiles!yoru_comments_author_id_fkey(${AUTHOR})`).eq('id',id).is('deleted_at',null).maybeSingle()),
  comment:(key,body,parent)=>rpc('comment',{p_anime:key.anime,p_season:key.season,p_episode:key.episode,p_body:body,p_parent:parent}),
  edit:(id,body)=>rpc('edit_comment',{p_id:id,p_body:body}),
  unread:()=>read(c.rpc('yoru_social_unread')),
  markRead:(room,message)=>rpc('mark_read',{p_room:room,p_message:message}),
  friends:()=>read(c.from('yoru_friendships').select(`id,requester,recipient,status,from:yoru_public_profiles!yoru_friendships_requester_fkey(${AUTHOR}),to:yoru_public_profiles!yoru_friendships_recipient_fkey(${AUTHOR})`).order('created_at',{ascending:false}).limit(200)),
  friend:(user,action)=>rpc('friend',{p_user:user,p_action:action}),
  rooms:async()=>{const rooms=await read(c.from('yoru_chat_members').select('room_id,room:yoru_conversations(id,kind,title,owner_id,created_at)').eq('user_id',ctx.user().id).order('joined_at',{ascending:false}).limit(50));if(!rooms.length)return rooms;const members=await read(c.from('yoru_chat_members').select(`room_id,user_id,profile:yoru_public_profiles!yoru_chat_members_user_id_fkey(${AUTHOR})`).in('room_id',rooms.map(x=>x.room_id)).limit(1000));return rooms.map(r=>({...r,peers:members.filter(m=>m.room_id===r.room_id&&m.user_id!==ctx.user()?.id).map(m=>m.profile).filter(Boolean),label:members.filter(m=>m.room_id===r.room_id&&m.user_id!==ctx.user()?.id).map(m=>m.profile?.nickname).join(', ')}));},
  roomInfo:id=>read(c.from('yoru_conversations').select('id,kind,title,owner_id').eq('id',id).maybeSingle()),
  members:room=>read(c.from('yoru_chat_members').select(`user_id,last_read_at,last_read_id,last_seen_at,profile:yoru_public_profiles!yoru_chat_members_user_id_fkey(${AUTHOR})`).eq('room_id',room).limit(20)),
  room:(users,title='')=>rpc('room',{p_users:users,p_title:title}),
  removeChat:room=>rpc('remove_chat',{p_room:room}),
  manage:(room,action,user=null,title=null)=>rpc('manage_room',{p_room:room,p_action:action,p_user:user,p_title:title}),
  messages:(room,before=null)=>{let q=c.from('yoru_messages').select(`id,room_id,author_id,body,image_path,anime_id,created_at,reply_to,author:yoru_public_profiles!yoru_messages_author_id_fkey(${AUTHOR})`).eq('room_id',room);if(before)q=q.or(`created_at.lt.${before.created_at},and(created_at.eq.${before.created_at},id.lt.${before.id})`);return read(q.order('created_at',{ascending:false}).order('id',{ascending:false}).limit(40)).then(rows=>withReplies(rows,room));},
  messageRecord:(room,id)=>read(c.from('yoru_messages').select(`id,room_id,author_id,body,image_path,anime_id,created_at,reply_to,author:yoru_public_profiles!yoru_messages_author_id_fkey(${AUTHOR})`).eq('room_id',room).eq('id',id).maybeSingle()).then(row=>withReplies(row,room)),
  message:(room,body,image,anime,id,reply=null)=>rpc('message_v2',{p_room:room,p_body:body,p_image:image,p_anime:anime,p_id:id,p_reply:reply}),
 };
 const cache=cacheFor(c);
 methods.cachedProfile=(id,paint)=>cache.swr(cacheKey(ctx,'profile:'+id),()=>methods.profile(id),paint,life.live);
 methods.cachedChats=paint=>cache.swr(cacheKey(ctx,'chats'),async()=>{const [rooms,friendships]=await Promise.all([methods.rooms(),methods.friends()]);return {rooms,friendships};},paint,life.live);
 return methods;
}
