import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm,utimes} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {readCatalogueText,archiveCatalogue} from '../scripts/lib/catalog-storage.mjs';
test('catalogue archive preserves every byte and reads on a clean checkout or after a pull',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'yomiku-catalog-')),path=join(dir,'catalog.json');
 try{
  const original=JSON.stringify({items:[{id:'mal-1',title:'Японский 日本語',episodes:[{number:1,url:'https://example.test/stream'}]}]});
  await archiveCatalogue(original,path);await rm(path);assert.equal(await readCatalogueText(path),original);
  await writeFile(path,'{"items":[]}');await utimes(path,1,1);assert.equal(await readCatalogueText(path),original);
  await utimes(path+'.gz',1,1);await utimes(path,2,2);assert.equal(await readCatalogueText(path),'{"items":[]}');
  const saved=await readFile(path+'.gz');await assert.rejects(archiveCatalogue('{broken',path));assert.deepEqual(await readFile(path+'.gz'),saved);
 }finally{await rm(dir,{recursive:true,force:true});}
});
