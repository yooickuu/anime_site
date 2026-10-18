// Like the primary Supabase session, these sessions stay on this device; never store passwords.
export function accountVault(storage,key='yooickuu.accounts.v1'){
 const read=()=>{try{const rows=JSON.parse(storage.getItem(key)||'[]');return Array.isArray(rows)?rows.filter(x=>x?.id&&x.access_token&&x.refresh_token).slice(0,8):[];}catch{return [];}};
 const write=rows=>storage.setItem(key,JSON.stringify(rows));
 return {list:()=>read().map(({id,name,email})=>({id,name,email})),
  remember(session){if(!session?.user?.id||!session.access_token||!session.refresh_token)return;const row={id:session.user.id,name:session.user.user_metadata?.name||session.user.email,email:session.user.email,access_token:session.access_token,refresh_token:session.refresh_token};write([row,...read().filter(x=>x.id!==row.id)].slice(0,8));},
  session:id=>read().find(x=>x.id===id),forget:id=>write(read().filter(x=>x.id!==id))};
}
