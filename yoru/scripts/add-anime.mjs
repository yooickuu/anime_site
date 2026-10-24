import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
process.chdir(fileURLToPath(new URL('..',import.meta.url)));
const count=Number(process.argv[2]||100);
if(!Number.isSafeInteger(count)||count<1){console.error('Укажи положительное количество: npm run add-anime -- 100');process.exit(1);}
function run(command,args,options={}){
 const r=spawnSync(command,args,{stdio:'inherit',...options});
 if(r.error||r.status!==0)throw Error(`Не завершена команда ${command} ${args.join(' ')}. Изменения сохранены локально; принудительная отправка не выполняется.`);
 return r;
}
function gitText(...args){return run('git',args,{stdio:'pipe',encoding:'utf8'}).stdout.trim();}
try{
 if(gitText('diff','--name-only','--diff-filter=U'))throw Error('Сначала нужно закончить конфликт Git. Импорт не запущен.');
 if(gitText('diff','--cached','--name-only'))throw Error('В Git уже подготовлены чужие изменения. Сначала заверши свой коммит.');
 const branch=gitText('branch','--show-current');
 if(branch!=='main')throw Error('Открой ветку main перед публикацией.');
 run('git',['fetch','origin']);
 if(gitText('rev-list','--count','HEAD..origin/main')!=='0')run('git',['merge','--ff-only','origin/main']);
 run(process.execPath,['scripts/seed-catalog.mjs',String(count),...(process.argv.includes('--popular')?['--popular']:[])]);
 run('npm',['run','build']);
 const files=['src/runtime-catalog.json','dist/data/media','../data/media','src/published-catalog.json','src/kodik-progress.json','dist/app.js','dist/index.html','dist/catalog-build.json','dist/published-catalog.json','dist/data/kodik','../app.js','../index.html','../catalog-build.json','../published-catalog.json','../data/kodik'];
 run('git',['add','--',...files.filter(existsSync)]);
 if(gitText('diff','--cached','--name-only'))run('git',['commit','-m',`Import validated Kodik batch (target ${count})`]);
 run('git',['push','origin','main']);
 console.log('Отправлено в GitHub. Pages опубликует сайт после завершения Actions.');
}catch(error){console.error(error.message);process.exitCode=1;}
