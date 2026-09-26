import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {constructMachine,validateDataset} from '../src/translation/construct';
await mkdir('public/machines/definitions',{recursive:true});
for(const ticker of ['MSFT','WMT','JPM']){
 const data:unknown=JSON.parse(await readFile(`public/machines/${ticker}.json`,'utf8'));
 validateDataset(data);
 const definitions=data.periods.map((_,i)=>constructMachine(data,i));
 for(const machine of definitions){
  const ids=new Set(machine.nodes.map(n=>n.id));
  for(const edge of machine.edges)if(!ids.has(edge.from)||!ids.has(edge.to))throw Error(`${ticker}: missing causal node`);
 }
 await writeFile(`public/machines/definitions/${ticker}.json`,JSON.stringify(definitions,null,2)+'\n');
 console.log(`${ticker}: validated ${definitions.length} source-backed machine definitions`);
}
