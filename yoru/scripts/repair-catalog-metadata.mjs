import {readCatalogueText,archiveCatalogue} from './lib/catalog-storage.mjs';
import {repairDisplayMetadata} from './lib/catalog-display.mjs';
const publication=JSON.parse(await readCatalogueText());
const stats=repairDisplayMetadata(publication);
if(stats.counts||stats.types)await archiveCatalogue(JSON.stringify(publication));
console.log(JSON.stringify(stats));
