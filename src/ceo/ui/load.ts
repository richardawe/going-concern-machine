import { useEffect, useState } from 'react';
import { CompanyDatasetProvider } from '../../data/company-datasets';
import type { ArchetypeFile } from '../archetypes';
import type { CompanyChoice } from '../challenge';
import { fictionalCompany, realCompany } from '../company';
import type { StartCompany } from '../types';

const provider = new CompanyDatasetProvider();
/** The industry archetypes built from the SEC datasets at deploy time. */
export function useArchetypes(): [ArchetypeFile | null, string] {
  const [archetypes, setArchetypes] = useState<ArchetypeFile | null>(null), [error, setError] = useState('');
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}ceo/archetypes.json`).then(r => { if (!r.ok) throw new Error('The industry archetypes could not be loaded.'); return r.json(); }).then(setArchetypes).catch(e => setError(e.message));
  }, []);
  return [archetypes, error];
}
export async function startFor(choice: CompanyChoice, archetypes: ArchetypeFile): Promise<StartCompany> {
  if (choice.kind === 'real') return realCompany(await provider.getCompany(choice.ticker));
  const a = archetypes.archetypes.find(x => x.id === choice.archetype);
  if (!a) throw new Error('That industry archetype is not available.');
  return fictionalCompany(a, choice.seed);
}
