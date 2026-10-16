// Restore progress only when the CI cache is newer than the checked-in snapshot.
import {readFile,copyFile,mkdir,cp} from 'node:fs/promises';
const index='dist/data/animego-index.json',cache='checks/animego-cache/index.json';
await mkdir('checks/animego-cache',{recursive:true});
if(process.argv[2]==='save'){await copyFile(index,cache);await cp('dist/data/animego-episodes','checks/animego-cache/episodes',{recursive:true});}else{
 try{const [saved,current]=await Promise.all([readFile(cache,'utf8').then(JSON.parse),readFile(index,'utf8').then(JSON.parse)]);
 if(Array.isArray(saved.items)&&saved.items.length>0&&Date.parse(saved.updatedAt)>Date.parse(current.updatedAt)){await cp('checks/animego-cache/episodes','dist/data/animego-episodes',{recursive:true});await copyFile(cache,index);console.log('Restored newer source progress');}
 }catch{console.log('Using repository source index');}
}
