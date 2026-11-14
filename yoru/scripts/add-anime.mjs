import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
process.chdir(fileURLToPath(new URL('..',import.meta.url)));
const count=Number(process.argv[2]||100);
const both=process.argv.includes('--both'),anilibria=process.argv.includes('--anilibria');
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
 if(gitText('rev-list','--count','HEAD..origin/main')!=='0'){
  try{run('git',['pull','--rebase','origin','main']);}
  catch(e){if(existsSync(gitText('rev-parse','--git-path','rebase-merge'))||existsSync(gitText('rev-parse','--git-path','rebase-apply')))run('git',['rebase','--abort']);throw Error('Не удалось автоматически объединить ветку main с GitHub. Проверьте git status.');}
 }
 const flags=process.argv.slice(2).filter(a=>a.startsWith('--')&&!['--both','--anilibria','--with-sources'].includes(a));
 const orderChosen=flags.some(a=>['--updated','--popular','--ranked','--aired','--new'].includes(a));
 const jobs=[];
 if(!anilibria||both)jobs.push(['Kodik','scripts/seed-catalog.mjs',...(orderChosen?flags:[both?'--updated':'--popular',...flags]),...(both&&!process.argv.includes('--with-sources')?['--new-only']:[])]);
 if(anilibria||both)jobs.push(['AniLibria','scripts/seed-anilibria.mjs',...flags.filter(a=>a.startsWith('--max-checks=')),...(process.argv.includes('--with-sources')?[]:['--new-only'])]);
 const failures=[];
 for(const [provider,script,...args] of jobs){
  console.log(`\n=== ${provider}: до ${count} подходящих релизов ===`);
  try{run(process.execPath,[script,String(count),...args]);}catch(error){failures.push(provider);console.error(error.message);}
 }
 // A failed provider must not discard the validated checkpoint of the other one.
 run('npm',['run','build']);
 const files=['dist/social','../social','dist/providers','../providers','src/catalog-bootstrap.json','dist/data/catalog','../data/catalog','src/runtime-catalog.json','dist/data/media','../data/media','src/published-catalog.json.gz','src/kodik-progress.json',...((anilibria||both)?['src/anilibria-progress.json']:[]),'dist/app.js','dist/index.html','dist/catalog-build.json','dist/data/kodik','../app.js','../index.html','../catalog-build.json','../data/kodik'];
 run('git',['add','--',...files.filter(existsSync)]);
 if(gitText('diff','--cached','--name-only')){
  run('git',['commit','-m',`Import validated ${both?'Kodik + AniLibria':anilibria?'AniLibria':'Kodik'} batch (target ${count})`]);
  try{run('git',['pull','--rebase','origin','main']);}catch(error){
   if(existsSync(gitText('rev-parse','--git-path','rebase-merge'))||existsSync(gitText('rev-parse','--git-path','rebase-apply')))run('git',['rebase','--abort']);
   throw Error('Партия сохранена в локальном коммите. GitHub обновился одновременно; автоматическое объединение не удалось, push не выполнен.');
  }
  console.log('Проверенная партия сохранена в коммите.');
 }
 if(gitText('rev-list','--count','origin/main..HEAD')!=='0'){run('git',['push','origin','main']);console.log('Отправлено в GitHub. Pages опубликует сайт после завершения Actions.');}
 else console.log('Новых изменений для публикации нет. Смотри итог каждого источника выше.');
 if(failures.length){console.error('Не завершены источники: '+failures.join(', ')+'. Их прогресс сохранён; повтори ту же команду.');process.exitCode=1;}
}catch(error){console.error(error.message);process.exitCode=1;}
