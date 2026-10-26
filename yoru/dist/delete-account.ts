// Deploy with Supabase Edge Functions. Privileged credentials stay on the server.
import {createClient} from 'npm:@supabase/supabase-js@2.99.2';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
const reply=(status:number,body:object)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
Deno.serve(async request=>{
  if(request.method==='OPTIONS')return new Response(null,{headers:cors});
  if(request.method!=='POST')return reply(405,{error:'method_not_allowed'});
  const token=request.headers.get('Authorization')?.replace(/^Bearer\s+/i,'');
  if(!token)return reply(401,{error:'unauthorized'});
  const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!url||!key)return reply(503,{error:'not_configured'});
  const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error}=await admin.auth.getUser(token);
  if(error||!user)return reply(401,{error:'unauthorized'});
  const body=await request.json().catch(()=>null);
  if(body?.confirm!==true)return reply(400,{error:'confirmation_required'});
  if(body.expectedUserId!==user.id)return reply(409,{error:'account_changed'});
  // Check the SQL migration before deleting any files.
  const ready=await admin.rpc('yooickuu_deletion_ready');
  if(ready.error||ready.data!==true)return reply(503,{error:'not_configured'});
  try {
    // Avatars are stored as uid/uuid.png. Start at offset zero after each removal.
    for(let batch=0;batch<100;batch++) {
      const {data:files,error:listError}=await admin.storage.from('avatars').list(user.id,{limit:100});
      if(listError)throw listError;
      if(!files?.length)break;
      if(files.some(file=>!file.id||file.name.includes('/')))throw Error('unexpected_storage_path');
      const {error:removeError}=await admin.storage.from('avatars').remove(files.map(file=>`${user.id}/${file.name}`));
      if(removeError)throw removeError;
      if(batch===99)throw Error('cleanup_incomplete');
    }
    // Clean social uploads through Storage API; old projects remain compatible.
    for(let batch=0;batch<100;batch++) {
      const {data:files,error:filesError}=await admin.rpc('yoru_social_owned_media',{p_user:user.id});
      if(filesError){if(['PGRST202','42883'].includes(filesError.code))break;throw filesError;}
      if(!files?.length)break;
      for(const bucket of ['social-profile-media','social-chat-media']) {
        const paths=files.filter((f:{bucket_id:string,name:string})=>f.bucket_id===bucket).map((f:{name:string})=>f.name);
        if(paths.some((path:string)=>(bucket==='social-profile-media'?path.split('/')[0]:path.split('/')[1])!==user.id))throw Error('unexpected_storage_path');
        if(paths.length){const {error:removeError}=await admin.storage.from(bucket).remove(paths);if(removeError)throw removeError;}
      }
      if(batch===99)throw Error('cleanup_incomplete');
    }
    // Hard delete; yoru_state and auth sessions cascade. The DB trigger records
    // only a keyed email fingerprint and applies the cooldown atomically.
    const {error:deleteError}=await admin.auth.admin.deleteUser(user.id,false);
    if(deleteError)throw deleteError;
    return reply(200,{deleted:true});
  } catch {
    // Do not log tokens, addresses or request bodies.
    return reply(500,{error:'deletion_failed'});
  }
});
