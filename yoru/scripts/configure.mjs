import {createInterface} from 'node:readline/promises';
import {stdin,stdout} from 'node:process';
import {readFile,writeFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {validPublicConfig} from '../src/public-config.js';
const rl=createInterface({input:stdin,output:stdout});
try{
 console.log('Подключение аккаунтов yooickuu. Нужны только публичные Project URL и Publishable/anon key.');
 const supabaseUrl=(await rl.question('Project URL: ')).trim().replace(/\/$/,'');
 const supabaseKey=(await rl.question('Publishable key: ')).trim();
 if(!validPublicConfig({supabaseUrl,supabaseKey}))throw Error('Некорректный URL или ключ. Секретные ключи не принимаются.');
 const response=await fetch(supabaseUrl+'/auth/v1/settings',{headers:{apikey:supabaseKey},signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error('Сервис не принял конфигурацию (HTTP '+response.status+'). Файл не изменён.');
 const settings=await response.json();
 const context={window:{}};
 runInNewContext(await readFile('dist/config.js','utf8'),context,{timeout:100});
 const config={...context.window.YORU_CONFIG,supabaseUrl,supabaseKey};
 await writeFile('dist/config.js','// Public configuration only. Never add service_role, sb_secret, SMTP or video-provider secrets.\nwindow.YORU_CONFIG = '+JSON.stringify(config,null,2)+';\n');
 console.log('Подключение проверено, dist/config.js сохранён. Email-вход: '+(settings.external?.email?'включён':'отключён')+'.');
 console.log('Далее выполни supabase/setup.sql в SQL Editor и добавь адрес сайта в Authentication → URL Configuration. Подробности: SETUP.md.');
}catch(error){console.error(error.message);process.exitCode=1;}finally{rl.close();}
