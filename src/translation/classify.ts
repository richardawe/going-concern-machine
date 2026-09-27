import type { Classification, CompanyDataset, SectorId } from '../ontology/types';
export const companyRegistry: Record<string,Classification> = {
 MSFT:{sector:'software-cloud',label:'Software + cloud infrastructure',rationale:'Microsoft reports productivity software, cloud infrastructure and personal computing activities. It is a mixed software/cloud company, not a pure subscription SaaS business.',evidence:'https://www.microsoft.com/en-us/Investor/earnings/FY-2025-Q4/segment-revenues',coverage:'Curated classification; segment data and subscriber economics are only used where verified.',verified:true},
 WMT:{sector:'retail',label:'Omnichannel retail + memberships',rationale:'Walmart sells merchandise through Walmart U.S., Walmart International and Sam’s Club. Inventory, cost of sales and physical investment drive its retail economics.',evidence:'https://stock.walmart.com/sec-filings/all-sec-filings/content/0000104169-25-000021/wmt-20250131.htm',coverage:'Consolidated retail model; advertising, memberships and international operations are not modeled separately.',verified:true},
 JPM:{sector:'banking',label:'Diversified banking + financial services',rationale:'JPMorgan Chase combines deposit-taking and lending with investment banking, markets and asset management. Credit provisions and regulatory capital are core constraints.',evidence:'https://jpmorganchaseco.gcs-web.com/node/851861/html',coverage:'Consolidated bank sensitivity model; trading risk and regulatory capital calculations are not fully simulated.',verified:true},
};
// Automatic classification from the SEC Standard Industrial Classification code. Only banks and retailers have their
// own modules; everything else runs on the universal core, and says so.
export function sectorFromSic(sic:number):SectorId{if((sic>=6020&&sic<=6036)||sic===6712)return 'banking';if(sic>=5200&&sic<=5999)return 'retail';return 'general';}
const labels:Record<SectorId,string>={'software-cloud':'Software + cloud','retail':'Retail + inventory','banking':'Banking + credit','general':'General company'};
export function automaticClassification(sic:string,industry:string,cik:string):Classification{
 const sector=sectorFromSic(Number(sic));
 return {sector,label:`${labels[sector]} · ${industry}`,verified:false,sic,
  rationale:`Classified automatically from SEC industry code ${sic} (${industry}). ${sector==='general'?'No sector module covers this industry yet, so the machine runs on the universal economic core only.':`Mapped to the ${labels[sector].toLowerCase()} module.`} Not reviewed by a person.`,
  evidence:`https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}`,
  coverage:'Automatic translation from SEC XBRL annual facts; fields that are not tagged consistently stay UNKNOWN.'};
}
export function classify(ticker:string,dataset?:Pick<CompanyDataset,'classification'>):Classification {const result=companyRegistry[ticker.toUpperCase()]??dataset?.classification;if(!result)throw new Error(`${ticker} is not published yet. Try MSFT, WMT, JPM or AAPL.`);return {...result};}
