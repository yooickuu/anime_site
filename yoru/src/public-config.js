export function isPublicKey(key){
  if(typeof key!=='string'||!key||key.startsWith('sb_secret_'))return false;
  if(/^sb_publishable_[A-Za-z0-9_-]{12,}$/.test(key))return true;
  try{return JSON.parse(atob(key.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).role==='anon';}catch{return false;}
}
export function validProjectURL(value){
  try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.search&&!u.hash&&(u.pathname==='/'||u.pathname==='');}catch{return false;}
}
export function validPublicConfig(config){return validProjectURL(config?.supabaseUrl)&&isPublicKey(config?.supabaseKey);}
export function authErrorKey(error){
  if(error?.status===429||['over_request_rate_limit','over_email_send_rate_limit','over_sms_send_rate_limit'].includes(error?.code))return 'rateLimit';
  const codes={login_unavailable:'loginUnavailable',invalid_credentials:'authError',email_not_confirmed:'emailUnconfirmed',email_address_not_authorized:'emailDeliveryUnavailable',email_address_invalid:'emailInvalid',signup_disabled:'signupDisabled',sms_send_failed:'smsUnavailable',weak_password:'passwordHint'};
  return codes[error?.code]||null;
}
