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
export function demoScenarios(opening: MachineDefinition): { demo: Demonstration; base: CompanyScenario; lever: CompanyScenario } {
 const demo = demonstrations[opening.ticker]; if (!demo) throw new Error(`${opening.ticker} has no canonical demonstration.`);
 const control = sectors[opening.classification.sector].controls.find(c => c.id === demo.lever)!;
 const base = { ...suggestedScenario(opening), adopted: true }, lever = structuredClone(base);
 lever.values[demo.lever] = +Math.max(control.min, Math.min(control.max, base.values[demo.lever] + demo.delta)).toFixed(2);
 return { demo, base, lever };
}
