import type { Company, Statement } from '../model/types';
export interface FinancialDataProvider {
  getCompany(ticker: string): Promise<Company>;
  getHistoricalFinancials(ticker: string): Promise<Statement[]>;
}
export class StaticFinancialDataProvider implements FinancialDataProvider {
  private cache = new Map<string, Company>();
  constructor(private base = `${import.meta.env.BASE_URL}data/`) {}
  async getCompany(input: string): Promise<Company> {
    const ticker = input.trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(ticker)) throw new Error('Enter a valid ticker, such as AAPL or MSFT.');
    if (this.cache.has(ticker)) return structuredClone(this.cache.get(ticker)!);
    const response = await fetch(`${this.base}${encodeURIComponent(ticker)}.json`);
    if (!response.ok) throw new Error(`${ticker} is not in the published dataset. Try AAPL or MSFT, or use manual mode.`);
    const company: Company = await response.json();
    if (company.ticker !== ticker || !company.statements?.length) throw new Error('The published company file is invalid.');
    this.cache.set(ticker, company); return structuredClone(company);
  }
  async getHistoricalFinancials(ticker: string) { return (await this.getCompany(ticker)).statements; }
}
