import type { CompanyDataset } from '../ontology/types';
// CEO mode plays fictional businesses. Each archetype is calibrated on the published SEC datasets: the ratios below are
// the quartiles of real filers in that industry group, so a fictional company is realistic without being identifiable.
export const archetypeIds = ['software', 'hardware', 'health', 'consumer', 'retail', 'industrial', 'energy', 'services'] as const;
export type ArchetypeId = typeof archetypeIds[number];
export const archetypeLabels: Record<ArchetypeId, string> = { software: 'Software & internet', hardware: 'Semiconductors & hardware', health: 'Healthcare & pharma', consumer: 'Consumer brands', retail: 'Retail', industrial: 'Industrial manufacturing', energy: 'Energy & utilities', services: 'Business services' };
export const ratioKeys = ['grossMargin', 'operatingMargin', 'capexRatio', 'rdRatio', 'inventoryDays', 'revenueGrowth', 'cashRatio', 'payout', 'taxRate'] as const;
export type RatioKey = typeof ratioKeys[number];
export const ratioLabels: Record<RatioKey, string> = { grossMargin: 'Gross margin', operatingMargin: 'Operating margin', capexRatio: 'CapEx / revenue', rdRatio: 'R&D / revenue', inventoryDays: 'Inventory days', revenueGrowth: 'Revenue growth', cashRatio: 'Cash / revenue', payout: 'Dividends / net income', taxRate: 'Tax / operating profit' };
export interface Quartiles { p25: number; median: number; p75: number; n: number }
export interface Archetype { id: ArchetypeId; label: string; n: number; tickers: string[]; ratios: Partial<Record<RatioKey, Quartiles>> }
export interface ArchetypeFile { built: string; source: string; minimum: number; archetypes: Archetype[] }
/** An archetype needs at least this many filers, and each ratio this many observations, before it is published. */
export const MIN_COMPANIES = 8;

/** Maps an SEC standard industrial classification code to an archetype. Financial filers (60–67) are not playable. */
export function sicToArchetype(sic: string | undefined): ArchetypeId | null {
  const c = Number(sic); if (!Number.isFinite(c) || !sic) return null;
  const within = (lo: number, hi: number) => c >= lo && c <= hi;
  if (within(6000, 6799)) return null;
  if (within(7370, 7379)) return 'software';
  if (within(2830, 2836) || within(3841, 3851) || within(8000, 8099) || within(8730, 8734)) return 'health';
  if (within(3570, 3579) || within(3600, 3699) || within(3820, 3829)) return 'hardware';
  if (within(5200, 5999)) return 'retail';
  if (within(2000, 2399) || within(2840, 2844) || within(3140, 3149) || within(3940, 3949)) return 'consumer';
  if (within(1300, 1399) || within(2900, 2999) || within(4900, 4999)) return 'energy';
  if (within(4800, 4899) || within(7000, 8999)) return 'services';
  return 'industrial';
}

function quartiles(values: number[]): Quartiles | undefined {
  const v = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (v.length < MIN_COMPANIES) return undefined;
  const at = (q: number) => { const i = (v.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i); return v[lo] + (v[hi] - v[lo]) * (i - lo); };
  const round = (n: number) => +n.toFixed(4);
  return { p25: round(at(.25)), median: round(at(.5)), p75: round(at(.75)), n: v.length };
}

/** The ratios one filer contributes, from its latest period (growth uses the prior period). Missing inputs are skipped. */
export function companyRatios(d: CompanyDataset): Partial<Record<RatioKey, number>> {
  const [now, prior] = d.periods; if (!now) return {};
  const v = (k: string, p = now) => p?.facts[k]?.value ?? null;
  const revenue = v('revenue'), out: Partial<Record<RatioKey, number>> = {};
  if (!revenue || revenue <= 0) return out;
  const cogs = v('cogs') ?? (v('grossProfit') != null ? revenue - v('grossProfit')! : null);
  const put = (k: RatioKey, n: number | null, lo: number, hi: number) => { if (n != null && Number.isFinite(n) && n >= lo && n <= hi) out[k] = n; };
  put('grossMargin', cogs == null ? null : (revenue - cogs) / revenue, -.5, 1);
  put('operatingMargin', v('operatingProfit') == null ? null : v('operatingProfit')! / revenue, -1, 1);
  put('capexRatio', v('capex') == null ? null : v('capex')! / revenue, 0, 1);
  put('rdRatio', v('rd') == null ? null : v('rd')! / revenue, 0, 1);
  put('inventoryDays', v('inventory') == null || !cogs ? null : v('inventory')! / cogs * 365, 0, 730);
  const before = v('revenue', prior); put('revenueGrowth', before && before > 0 ? revenue / before - 1 : null, -.5, 2);
  put('cashRatio', v('cash') == null ? null : v('cash')! / revenue, 0, 5);
  put('payout', v('dividends') == null || !v('netIncome') || v('netIncome')! <= 0 ? null : v('dividends')! / v('netIncome')!, 0, 3);
  put('taxRate', v('tax') == null || !v('operatingProfit') || v('operatingProfit')! <= 0 ? null : v('tax')! / v('operatingProfit')!, 0, .6);
  return out;
}

export function buildArchetypes(datasets: CompanyDataset[], built: string): ArchetypeFile {
  const groups = new Map<ArchetypeId, { ticker: string; ratios: Partial<Record<RatioKey, number>> }[]>();
  for (const d of [...datasets].sort((a, b) => a.ticker.localeCompare(b.ticker))) {
    if (d.classification?.sector === 'banking') continue;
    const id = sicToArchetype(d.classification?.sic); if (!id) continue;
    groups.set(id, [...(groups.get(id) ?? []), { ticker: d.ticker, ratios: companyRatios(d) }]);
  }
  const archetypes = archetypeIds.flatMap(id => {
    const members = groups.get(id) ?? []; if (members.length < MIN_COMPANIES) return [];
    const ratios: Archetype['ratios'] = {};
    for (const k of ratioKeys) { const q = quartiles(members.map(m => m.ratios[k]).filter((x): x is number => x != null)); if (q) ratios[k] = q; }
    return [{ id, label: archetypeLabels[id], n: members.length, tickers: members.map(m => m.ticker), ratios }];
  });
  return { built, source: 'Quartiles of the latest annual SEC filings published in public/machines (banks and other financial filers excluded).', minimum: MIN_COMPANIES, archetypes };
}
