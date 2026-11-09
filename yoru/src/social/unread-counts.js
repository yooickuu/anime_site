// Exact counts through existing RLS, without downloading message bodies or changing schema.
export async function unreadCounts(ctx,life,roomIds){
 const client=ctx.client,uid=ctx.user()?.id;if(!uid||!roomIds.length)return new Map();
 const result=await client.rpc('yoru_social_unread').abortSignal(life.signal);if(result.error)throw result.error;
 const wanted=new Set(roomIds),ids=[...new Set((result.data||[]).map(r=>r.room_id))].filter(id=>wanted.has(id));if(!ids.length)return new Map();
 const members=await client.from('yoru_chat_members').select('room_id,last_read_at,last_read_id').eq('user_id',uid).in('room_id',ids).abortSignal(life.signal);if(members.error)throw members.error;
 const counts=new Map();let index=0;
 await Promise.all(Array.from({length:Math.min(4,ids.length)},async()=>{while(life.live()&&index<ids.length){const id=ids[index++],cursor=(members.data||[]).find(r=>r.room_id===id);if(!cursor)continue;
 let query=client.from('yoru_messages').select('id',{count:'exact',head:true}).eq('room_id',id).neq('author_id',uid);
 if(cursor.last_read_at&&cursor.last_read_at!=='-infinity')query=query.or(`created_at.gt.${cursor.last_read_at},and(created_at.eq.${cursor.last_read_at},id.gt.${cursor.last_read_id||'00000000-0000-0000-0000-000000000000'})`);
 const response=await query.abortSignal(life.signal);if(response.error)throw response.error;if(response.count>0)counts.set(id,response.count);
 }}));return counts;
}
export function paintUnread(root,counts,lang){for(const badge of root.querySelectorAll('[data-room-unread]')){const n=counts.get(badge.dataset.roomUnread)||0;badge.hidden=!n;badge.textContent=n?String(n):'';badge.setAttribute('aria-label',({ru:`Непрочитанных сообщений: ${n}`,en:`Unread messages: ${n}`,ja:`未読メッセージ: ${n}`})[lang]||`Unread: ${n}`);}}
