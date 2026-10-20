import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {auditBatch,admissionPolicy} from '../src/catalog-admission.js';
const input=process.argv[2]||'checks/admission/candidates.json';
const batchSize=Math.min(1000,Math.max(1,Number(process.env.BATCH_SIZE)||admissionPolicy.batchSize));
const offset=Math.max(0,Number(process.env.BATCH_OFFSET)||0);
const data=JSON.parse(await readFile(input,'utf8'));
const candidates=Array.isArray(data)?data:data.items;
if(!Array.isArray(candidates))throw Error('Expected candidate array');
const publication=JSON.parse(await readFile('src/published-catalog.json','utf8'));
const now=Date.now(),results=auditBatch(candidates.slice(offset,offset+batchSize),{now,existing:publication.items,playerSubtitlesReady:false});
const summary={checkedAt:new Date(now).toISOString(),policy:admissionPolicy,offset,batchSize,checked:results.length,accepted:results.filter(r=>r.passed).length,results};
await mkdir('checks/admission',{recursive:true});
await writeFile('checks/admission/latest.json',JSON.stringify(summary,null,2));
console.log(JSON.stringify({checked:summary.checked,accepted:summary.accepted,held:summary.checked-summary.accepted}));
// This command is intentionally read-only towards dist: no report is a publication.
