import type {CompanyDataset,SectorId} from '../ontology/types';
import {validateDataset} from '../translation/construct';
export interface PublishedCompany {ticker:string;name:string;periods:string[];retrieved:string;verified:boolean;sector:SectorId}
export class CompanyDatasetProvider{
 private cache=new Map<string,CompanyDataset>();private list:Promise<PublishedCompany[]>|null=null;
 /** Every company with a published machine: the ticker box offers exactly these. */
 index():Promise<PublishedCompany[]>{this.list??=fetch(`${import.meta.env.BASE_URL}machines/index.json`).then(r=>{if(!r.ok)throw new Error('The list of published companies could not be loaded.');return r.json()}).then(d=>d.companies);return this.list}
 async getCompany(input:string):Promise<CompanyDataset>{const ticker=input.trim().toUpperCase();if(!/^[A-Z][A-Z0-9.-]{0,9}$/.test(ticker))throw new Error('Enter a ticker symbol, such as AAPL.');if(this.cache.has(ticker))return structuredClone(this.cache.get(ticker)!);
 const published=await this.index();if(!published.some(c=>c.ticker===ticker))throw new Error(`${ticker} is not published yet. Published: ${published.map(c=>c.ticker).join(', ')}.`);
 const response=await fetch(`${import.meta.env.BASE_URL}machines/${ticker}.json`);if(!response.ok)throw new Error(`${ticker} data could not be loaded.`);const data:unknown=await response.json();validateDataset(data);if(data.ticker!==ticker)throw new Error('Published ticker mismatch.');this.cache.set(ticker,data);return structuredClone(data);}
}
export function fingerprint(dataset:CompanyDataset,period:string){const facts=dataset.periods.find(p=>p.period===period)?.facts;let h=2166136261;for(const ch of JSON.stringify(facts)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}return `${dataset.ticker}:${period}:${(h>>>0).toString(16)}`;}
