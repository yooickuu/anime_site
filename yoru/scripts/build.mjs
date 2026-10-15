import {build} from 'esbuild';
import {copyFile} from 'node:fs/promises';
await copyFile('supabase/setup.sql', 'dist/setup.sql');
await copyFile('supabase/unique-nicknames.sql','dist/unique-nicknames.sql');
await copyFile('supabase/account-deletion.sql', 'dist/account-deletion.sql');
await copyFile('supabase/functions/delete-account/index.ts', 'dist/delete-account.ts');
await build({entryPoints:['src/app.js'],bundle:true,outfile:'dist/app.js',format:'iife',target:['es2022'],minify:true,legalComments:'eof'});
console.log('yooickuu built → dist/');
