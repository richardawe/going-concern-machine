import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {buildArchetypes} from '../src/ceo/archetypes';
import type {CompanyDataset} from '../src/ontology/types';
// CEO mode calibrates its fictional companies on these quartiles. Rebuilt from the published datasets on every build.
const index=JSON.parse(await readFile('public/machines/index.json','utf8')) as {companies:{ticker:string;retrieved:string}[]};
const datasets:CompanyDataset[]=await Promise.all(index.companies.map(async c=>JSON.parse(await readFile(`public/machines/${c.ticker}.json`,'utf8'))));
const built=index.companies.map(c=>c.retrieved).sort().at(-1)??'';
const file=buildArchetypes(datasets,built);
await mkdir('public/ceo',{recursive:true});
await writeFile('public/ceo/archetypes.json',JSON.stringify(file,null,1)+'\n');
for(const a of file.archetypes)console.log(`${a.id.padEnd(11)} n=${String(a.n).padStart(3)}  ${Object.entries(a.ratios).map(([k,q])=>`${k} ${q.median}`).join(' · ')}`);
