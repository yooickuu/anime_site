import {build} from 'esbuild';
import {copyFile,readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createApprovedCatalogue} from '../src/approved-catalog.js';
await copyFile('supabase/setup.sql', 'dist/setup.sql');
await copyFile('supabase/nickname-login.sql','dist/nickname-login.sql');
await copyFile('supabase/functions/login-nickname/index.ts','dist/login-nickname.ts');
await copyFile('supabase/unique-nicknames.sql','dist/unique-nicknames.sql');
await copyFile('supabase/account-deletion.sql', 'dist/account-deletion.sql');
await copyFile('supabase/functions/delete-account/index.ts', 'dist/delete-account.ts');
await build({entryPoints:['src/app.js'],bundle:true,outfile:'dist/app.js',format:'iife',target:['es2022'],minify:true,legalComments:'eof'});
console.log('yooickuu built → dist/');

await build({entryPoints:['supabase/functions/anime-source/index.ts'],bundle:true,outfile:'dist/anime-source.ts',format:'esm',platform:'neutral',target:['es2022']});

// The deployed bundle embeds this manifest. Report rejected records instead of silently hiding them.
const publication=JSON.parse(await readFile('src/published-catalog.json','utf8'));
const visible=createApprovedCatalogue(publication).items.length;
console.log(`Catalogue: ${visible}/${publication.items.length} visible (${publication.items.length-visible} rejected)`);
await copyFile('src/published-catalog.json','dist/published-catalog.json');
const hash=createHash('sha256').update(await readFile('dist/app.js')).digest('hex').slice(0,12);
let html=(await readFile('dist/index.html','utf8')).replace(/app\.js(?:\?v=[^"']*)?/g,`app.js?v=${hash}`);
for(const file of ['style.css','redesign.css','scenes.css']){const version=createHash('sha256').update(await readFile('dist/'+file)).digest('hex').slice(0,12);html=html.replace(new RegExp(file.replace('.', '\\.')+'(?:\\?v=[^\"\']*)?','g'),file+'?v='+version);}
await writeFile('dist/index.html',html);
await writeFile('dist/catalog-build.json',JSON.stringify({total:publication.items.length,visible,bundle:hash,updatedAt:publication.updatedAt},null,2));
// Keep branch-based Pages fresh too; Actions deploys dist directly.
for(const file of ['app.js','index.html','published-catalog.json','catalog-build.json','anime-source.ts','setup.html'])await copyFile(`dist/${file}`,`../${file}`);

// Per-title references let the backend refresh the exact selected track without accepting arbitrary URLs.
await mkdir('dist/data/kodik',{recursive:true});await mkdir('../data/kodik',{recursive:true});
for(const item of publication.items){
 if(!item.episodes.some(e=>e.audio.some(t=>t.providerRef?.provider==='kodik')))continue;
 const data={id:item.id,episodes:[...item.episodes].sort((a,b)=>a.number-b.number).map(e=>({tracks:e.audio.filter(t=>t.providerRef?.provider==='kodik').map(t=>({audioId:t.id,...t.providerRef}))}))};
 const name=item.id;if(!/^(mal|shikimori|lib)-\d+$/.test(name))throw Error('Invalid Kodik title ID');
 await writeFile(`dist/data/kodik/${name}.json`,JSON.stringify(data));await copyFile(`dist/data/kodik/${name}.json`,`../data/kodik/${name}.json`);
}
for(const file of ['style.css','redesign.css','scenes.css'])await copyFile(`dist/${file}`,`../${file}`);
