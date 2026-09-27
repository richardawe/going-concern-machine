import type { CompanyScenario, MachineDefinition } from '../ontology/types';
import { sectors } from '../sectors';
import { suggestedScenario } from './company';
// One canonical lever per verified company. Each lever is the sector module's defining cash decision, so the three
// demonstrations exercise the same universal core through different machinery.
export interface Demonstration { lever: string; delta: number; question: string; why: string; watch: string[]; }
export const demonstrations: Record<string, Demonstration> = {
 MSFT: { lever: 'capexRatio', delta: 7.5, question: 'What if Microsoft spends 7.5 more cents of every revenue dollar on cloud and AI infrastructure?', why: 'Infrastructure is Microsoft’s largest discretionary cash decision: reported CapEx rose from 18.1% of revenue in FY2024 to 22.9% in FY2025.', watch: ['capex', 'freeCashFlow', 'distributions', 'cash', 'investmentLift', 'revenue'] },
 WMT: { lever: 'inventoryDays', delta: 5, question: 'What if Walmart carries five more days of inventory?', why: 'Inventory is the retail machine’s working-capital reservoir: extra stock absorbs cash before it can become sales.', watch: ['inventory', 'inventoryInvestment', 'operatingCashFlow', 'freeCashFlow', 'cash', 'inventoryTurns'] },
 JPM: { lever: 'creditCost', delta: .8, question: 'What if JPMorgan’s credit-loss provisions roughly double?', why: 'Credit is the bank machine’s defining risk: provisions flow through pretax income, tax and retained profit into book equity.', watch: ['provision', 'pretaxIncome', 'tax', 'netIncome', 'retainedProfit', 'equity'] },
};
// Automatically translated companies get the lever that defines their module; its framing is generated, not curated.
export function demonstrationFor(m: MachineDefinition): Demonstration {
 if (demonstrations[m.ticker]) return demonstrations[m.ticker];
 const pct = (a: string, b: string) => { const x = m.nodes.find(n => n.id === a)?.value, y = m.nodes.find(n => n.id === b)?.value; return x != null && y ? `${(x / y * 100).toFixed(1)}%` : 'UNKNOWN'; };
 if (m.classification.sector === 'banking') return { lever: 'creditCost', delta: .5, question: `What if ${m.name}’s credit-loss provisions rise by 0.5% of loans?`, why: `Credit is the bank machine’s defining risk. FY${m.fiscalYear} provisions were ${pct('provision', 'loans')} of period-end loans.`, watch: ['provision', 'pretaxIncome', 'tax', 'netIncome', 'retainedProfit', 'equity'] };
 if (m.classification.sector === 'retail') return { lever: 'inventoryDays', delta: 5, question: `What if ${m.name} carries five more days of inventory?`, why: `Inventory is the retail machine’s working-capital reservoir. FY${m.fiscalYear} inventory was ${pct('inventory', 'cogs')} of annual cost of sales.`, watch: ['inventory', 'inventoryInvestment', 'operatingCashFlow', 'freeCashFlow', 'cash', 'inventoryTurns'] };
 return { lever: 'capexRatio', delta: 5, question: `What if ${m.name} spends 5 more cents of every revenue dollar on capital investment?`, why: `Capital intensity is the universal cash decision. FY${m.fiscalYear} CapEx was ${pct('capex', 'revenue')} of revenue.`, watch: ['capex', 'freeCashFlow', 'distributions', 'cash', 'investmentLift', 'revenue'] };
}
export function demoScenarios(opening: MachineDefinition): { demo: Demonstration; base: CompanyScenario; lever: CompanyScenario } {
 const demo = demonstrationFor(opening);
 const control = sectors[opening.classification.sector].controls.find(c => c.id === demo.lever)!;
 const base = { ...suggestedScenario(opening), adopted: true }, lever = structuredClone(base);
 lever.values[demo.lever] = +Math.max(control.min, Math.min(control.max, base.values[demo.lever] + demo.delta)).toFixed(2);
 return { demo, base, lever };
}
