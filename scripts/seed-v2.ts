import { readFile, writeFile, mkdir } from 'node:fs/promises';
import type { CompanyDataset, CompanyPeriod, Datum } from '../src/ontology/types';
await mkdir('public/machines',{recursive:true});
const retrieved='2026-09-26';
const wmt='https://stock.walmart.com/sec-filings/all-sec-filings/content/0000104169-25-000021/wmt-20250131.htm';
const jpm='https://www.jpmorganchase.com/content/dam/jpmc/jpmorgan-chase-and-co/investor-relations/documents/annualreport-2024.pdf';
const observed=(value:number,period:string,url:string,source:string,ratio=false):Datum=>({value:ratio?value:value*1e6,unit:ratio?'ratio':'USD',period,url,source,status:'OBSERVED'});
const periods=(rows:[number,string,Record<string,number>][],url:string,source:string):CompanyPeriod[]=>rows.map(([fiscalYear,period,values])=>({period,fiscalYear,facts:Object.fromEntries(Object.entries(values).map(([key,value])=>[key,observed(value,period,url,source,['cet1','lcr'].includes(key))]))}));
const walmart:CompanyDataset={schemaVersion:2,ticker:'WMT',name:'Walmart Inc.',retrieved,provider:'Walmart FY2025 Form 10-K · consolidated statements',periods:periods([
 [2025,'2025-01-31',{revenue:680985,cogs:511753,operatingProfit:29348,opex:139884,operatingCashFlow:36443,capex:23783,cash:9037,inventory:56435,inventoryInvestment:2755,ppe:119993,equity:97421}],
 [2024,'2024-01-31',{revenue:648125,cogs:490142,operatingProfit:27012,opex:130971,operatingCashFlow:35726,capex:20606,cash:9867,inventory:54892,inventoryInvestment:-2017,ppe:110810,equity:90349}],
],wmt,'Walmart FY2025 10-K, statements pp. 53–57; USD millions converted to USD')};
const bank:CompanyDataset={schemaVersion:2,ticker:'JPM',name:'JPMorgan Chase & Co.',retrieved,provider:'JPMorgan Chase FY2024 annual report · reported GAAP basis',periods:periods([
 [2024,'2024-12-31',{revenue:177556,nii:92583,fees:84973,opex:91797,provision:10678,tax:16610,netIncome:58471,deposits:2406032,loans:1347988,equity:344758,cet1:.157,lcr:1.13,cet1Capital:275513,rwa:1757460}],
 [2023,'2023-12-31',{revenue:158104,nii:89267,fees:68837,opex:87172,provision:9320,tax:12060,netIncome:49552,deposits:2400688,loans:1323706,equity:327878,cet1:.15,lcr:1.13,cet1Capital:250585,rwa:1671995}],
],jpm,'JPMorgan Chase 2024 annual report, Form 10-K pp. 50, 60, 99; reported GAAP; CET1 standardized incl. CECL transition; LCR Q4 average')};
const old=JSON.parse(await readFile('public/data/MSFT.json','utf8'));
const microsoft:CompanyDataset={schemaVersion:2,ticker:'MSFT',name:'Microsoft Corporation',retrieved,provider:'Microsoft FY2025 annual earnings statements',periods:old.statements.map((s:{period:string;fiscalYear:number;facts:Record<string,Datum>},i:number)=>({period:s.period,fiscalYear:s.fiscalYear,facts:{...Object.fromEntries(Object.entries(s.facts).filter(([,f])=>f.value!=null).map(([k,f])=>[k,{...f,unit:'USD'}])),cloudRevenue:observed([106265,87464][i],s.period,'https://www.microsoft.com/en-us/Investor/earnings/FY-2025-Q4/segment-revenues','Intelligent Cloud segment, recast comparable prior year'),ppe:observed([204966,135591][i],s.period,'https://www.microsoft.com/en-us/Investor/earnings/FY-2025-Q4/balance-sheets','Net property and equipment')}}))};
for(const c of [microsoft,walmart,bank])await writeFile(`public/machines/${c.ticker}.json`,JSON.stringify(c,null,2)+'\n');
await writeFile('public/machines/index.json',JSON.stringify({schemaVersion:2,coverage:'Curated annual snapshots, not live or latest-period coverage',companies:[microsoft,walmart,bank].map(c=>({ticker:c.ticker,name:c.name,periods:c.periods.map(p=>p.period),retrieved:c.retrieved}))},null,2)+'\n');
