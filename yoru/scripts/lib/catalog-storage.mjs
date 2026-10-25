import {readFile,writeFile,rename,stat} from 'node:fs/promises';
import {gzip,gunzip} from 'node:zlib';
import {promisify} from 'node:util';
const zip=promisify(gzip),unzip=promisify(gunzip);
async function info(path){try{return await stat(path);}catch(e){if(e.code==='ENOENT')return null;throw e;}}
// The archive is versioned; local JSON remains editable by the existing importers.
// A newer pulled archive takes precedence over an old, ignored working copy.
export async function readCatalogueText(path='src/published-catalog.json'){
 const [plain,packed]=await Promise.all([info(path),info(path+'.gz')]);
 if(packed&&(!plain||packed.mtimeMs>=plain.mtimeMs))return (await unzip(await readFile(path+'.gz'))).toString('utf8');
 return readFile(path,'utf8');
}
export async function archiveCatalogue(text,path='src/published-catalog.json'){
 JSON.parse(text); // Never replace a good archive with malformed JSON.
 await writeFile(path+'.gz.tmp',await zip(text,{level:6}));
 await rename(path+'.gz.tmp',path+'.gz');
 // Keep legacy inspection tools and the generated public JSON usable locally.
 await writeFile(path,text);
}
