import type {CompanyDataset} from '../ontology/types';
import {validateDataset} from '../translation/construct';
import {classify} from '../translation/classify';
export class CompanyDatasetProvider{
 private cache=new Map<string,CompanyDataset>();
 async getCompany(input:string):Promise<CompanyDataset>{const ticker=input.trim().toUpperCase();classify(ticker);if(this.cache.has(ticker))return structuredClone(this.cache.get(ticker)!);
 const response=await fetch(`${import.meta.env.BASE_URL}machines/${ticker}.json`);if(!response.ok)throw new Error(`${ticker} data is not published yet.`);const data:unknown=await response.json();validateDataset(data);if(data.ticker!==ticker)throw new Error('Published ticker mismatch.');this.cache.set(ticker,data);return structuredClone(data);}
}
export function fingerprint(dataset:CompanyDataset,period:string){const facts=dataset.periods.find(p=>p.period===period)?.facts;let h=2166136261;for(const ch of JSON.stringify(facts)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}return `${dataset.ticker}:${period}:${(h>>>0).toString(16)}`;}
