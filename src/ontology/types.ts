export type SectorId = 'software-cloud' | 'retail' | 'banking';
export type Status = 'OBSERVED' | 'CALCULATED' | 'ESTIMATED' | 'USER ASSUMPTION' | 'UNKNOWN';
export type Unit = 'USD' | 'ratio' | 'count' | 'multiple' | 'index';
export interface Datum { value: number | null; unit: Unit; status: Status; source: string; url?: string; period: string; calculation?: string; inputs?: string[]; reason?: string; }
export interface CompanyPeriod { period: string; fiscalYear: number; facts: Record<string, Datum>; }
export interface CompanyDataset { schemaVersion: 2; ticker: string; name: string; retrieved: string; provider: string; periods: CompanyPeriod[]; }
export interface Classification { sector: SectorId; label: string; rationale: string; evidence: string; coverage: string; }
export interface MachineNode extends Datum { id: string; label: string; meaning: string; role: 'core' | 'sector'; }
export interface CausalEdge { id: string; from: string; to: string; relation: string; formula: string; lag: number; kind: 'accounting' | 'hypothesis' | 'concept'; }
export interface MachineDefinition { ticker: string; name: string; period: string; fiscalYear: number; classification: Classification; nodes: MachineNode[]; edges: CausalEdge[]; gauges: string[]; stages: string[]; moduleNodes: string[]; limitations: string[]; year: number; momentum: { value: number | null; parts: {label:string;contribution:number;formula:string}[]; reason?:string }; }
export interface Control { id: string; label: string; min: number; max: number; step: number; defaultValue: number; unit: '%' | 'pp' | 'years' | 'days'; explanation: string; }
export interface SectorModule { id: SectorId; label: string; gauges: string[]; stages: string[]; moduleNodes: string[]; controls: Control[]; edges: CausalEdge[]; limitations: string[]; }
export interface CompanyScenario { adopted: boolean; values: Record<string, number>; shocks: {id:string;year:number;kind:'demand'|'cost'|'credit'}[]; }
export const unknown = (unit:Unit,period:string,reason='Not available in the published source dataset.'):Datum=>({value:null,unit,status:'UNKNOWN',source:'No observation supplied',period,reason});
