import {readFile} from 'node:fs/promises';
import {buildArchetypes} from '../src/ceo/archetypes';
import {fictionalCompany,prepareStart,realCompany} from '../src/ceo/company';
import {cases} from '../src/ceo/cases';
import {play,statusQuo} from '../src/ceo/game';
import {gameScore,referenceDecisions,strategySpace,gradeFor} from '../src/ceo/assess';
import type {CompanyDataset} from '../src/ontology/types';
import type {Game,StartCompany} from '../src/ceo/types';
// Balance check for CEO cases: every path through the cards (with default levers), on the case's own fictional company
// and the real companies. Flags a case whose reference path loses to doing nothing, or where one path dominates.
const index=JSON.parse(await readFile('public/machines/index.json','utf8')) as {companies:{ticker:string}[]};
const load=async(t:string)=>JSON.parse(await readFile(`public/machines/${t}.json`,'utf8')) as CompanyDataset;
const datasets=await Promise.all(index.companies.map(c=>load(c.ticker)));
const archetypes=buildArchetypes(datasets,'');
const verbose=process.argv.includes('--verbose');
for(const c of cases){
 const starts:StartCompany[]=[fictionalCompany(archetypes.archetypes.find(a=>a.id===c.archetype)!,c.seed),...await Promise.all(['MSFT','WMT','JPM'].map(async t=>realCompany(await load(t))))].map(s=>prepareStart(s,c.setup));
 for(const start of starts){
  const n=c.turns.length,base:Game={start,caseDef:c,seed:c.seed,decisions:statusQuo(start,n)};
  const sq=gameScore(base),ref=gameScore({...base,decisions:referenceDecisions(base)});
  const paths=strategySpace(base).paths.map(p=>({ids:p.cards,overall:p.overall})).reverse();
  const pct=(x:number)=>(paths.filter(p=>p.overall<x).length+.5*paths.filter(p=>p.overall===x).length)/paths.length;
  const beat=paths.filter(p=>p.overall>sq.overall).length/paths.length;
  console.log(`${c.id.padEnd(14)} ${start.name.slice(0,22).padEnd(22)} nothing ${String(sq.overall).padStart(3)} ${gradeFor(pct(sq.overall))} · reference ${String(ref.overall).padStart(3)} ${gradeFor(pct(ref.overall))} · best ${paths[0].overall} [${paths[0].ids.map(x=>x??'-').join(', ')}] · worst ${paths.at(-1)!.overall} · ${(beat*100).toFixed(0)}% of ${paths.length} paths beat nothing${ref.overall<=sq.overall?'  ⚠ reference ≤ nothing':''}`);
  if(verbose){console.log('   ',JSON.stringify(sq.scores),JSON.stringify(ref.scores));for(const r of play({...base,decisions:referenceDecisions(base)}))console.log(`    y${r.year} rev ${(r.state.revenue/1e6).toFixed(0)} fcf ${(r.state.freeCashFlow/1e6).toFixed(1)} cash ${(r.state.cash/1e6).toFixed(0)} roic ${(r.state.roic*100).toFixed(1)} morale ${r.people.morale.toFixed(2)} attr ${(r.people.attrition*100).toFixed(0)} cust ${r.state.customers.toFixed(1)} | ${r.headlines.map(h=>h.text).join(' / ')}`);}
 }
}
