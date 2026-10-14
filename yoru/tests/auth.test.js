import test from 'node:test';
import assert from 'node:assert/strict';
import {validPublicConfig,isPublicKey,authErrorKey} from '../src/public-config.js';
const jwt=role=>'header.'+Buffer.from(JSON.stringify({role})).toString('base64url')+'.signature';
test('public config rejects secrets and invalid project URLs',()=>{
 assert.equal(isPublicKey(jwt('service_role')),false);
 assert.equal(isPublicKey('sb_secret_example'),false);
 assert.equal(isPublicKey(jwt('anon')),true);
 assert.equal(validPublicConfig({supabaseUrl:'https://project.supabase.co',supabaseKey:'sb_publishable_abcdefghijklmnop'}),true);
 for(const url of ['http://project.supabase.co','https://user:pass@project.supabase.co','javascript:alert(1)','https://project.supabase.co/?token=x'])assert.equal(validPublicConfig({supabaseUrl:url,supabaseKey:jwt('anon')}),false);
 assert.equal(validPublicConfig({supabaseUrl:'',supabaseKey:''}),false);
});
test('auth failures distinguish SMTP setup, confirmation and rate limiting',()=>{
 assert.equal(authErrorKey({code:'email_address_not_authorized'}),'emailDeliveryUnavailable');
 assert.equal(authErrorKey({code:'email_not_confirmed'}),'emailUnconfirmed');
 assert.equal(authErrorKey({status:429}),'rateLimit');
 assert.equal(authErrorKey({code:'invalid_credentials'}),'authError');
});
