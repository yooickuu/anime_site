import {clearCache} from './cache.js';
// Main account state is the only source; publish copies of the owner's chosen art.
export async function syncProfile(ctx){
 const uid=ctx.user()?.id;if(!uid||ctx.user().is_anonymous)throw Error('login_required');
 const preferences={...ctx.preferences()};
 const current=()=>ctx.user()?.id===uid&&(ctx.active?.()??true);
 const {data:profile,error}=await ctx.client.from('yoru_public_profiles').select('avatar_path,banner_path').eq('user_id',uid).maybeSingle();if(error)throw error;
 for(const [key,column] of [['avatar','avatar_path'],['banner','banner_path']]){
  const path=preferences[key];if(!path||path===profile?.[column])continue;
  if(!current()||!path.startsWith(uid+'/'))throw Error('account_changed');
  const {data:blob,error:downloadError}=await ctx.client.storage.from('avatars').download(path);if(downloadError)throw downloadError;
  if(!current())throw Error('account_changed');
  const {error:uploadError}=await ctx.client.storage.from('social-profile-media').upload(path,blob,{contentType:blob.type,upsert:false});
  if(uploadError&&String(uploadError.statusCode)!=='409'&&uploadError.error!=='Duplicate'&&!/already exists/i.test(uploadError.message||''))throw uploadError;
 }
 if(!current())throw Error('account_changed');
 const {error:syncError}=await ctx.client.rpc('yoru_social_sync_profile');if(syncError)throw syncError;clearCache(ctx.client);
}
