import directory from './data/uk-universities.json' with { type: 'json' };

// The UK universities the platform console can provision from: search by name or a common short name ("LSE",
// "Bayes"), and the form fills in the name, a suggested subdomain and the email domains to confirm.

export interface DirectoryEntry { id: string; name: string; aliases: string[]; domains: string[]; nation: string; slug: string }
export const universities: DirectoryEntry[] = directory.universities;
export const byDirectoryId = (id: string) => universities.find(u => u.id === id);

const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’'`]/g, '').replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim();
const STOP = new Set(['university', 'of', 'the', 'college', 'london', 'school', 'and']);

export function searchDirectory(query: string, limit = 8): DirectoryEntry[] {
  const q = fold(query);
  if (!q) return [];
  const words = q.split(' ');
  const scored = universities.map(u => {
    const names = [u.name, ...u.aliases].map(fold), domains = u.domains;
    let score = 0;
    for (const n of names) {
      if (n === q) score = Math.max(score, 100);
      else if (n.startsWith(q)) score = Math.max(score, 80);
      else if (n.split(' ').some(w => w.startsWith(q))) score = Math.max(score, 60);
      else if (words.every(w => n.includes(w))) score = Math.max(score, 40 + (words.filter(w => !STOP.has(w)).length ? 5 : 0));
    }
    const raw = query.trim().toLowerCase().replace(/^.*@/, '');
    if (domains.some(d => d === raw || (raw.length >= 3 && d.startsWith(raw)))) score = Math.max(score, 90);
    return { u, score };
  }).filter(x => x.score > 0);
  return scored.sort((a, b) => b.score - a.score || a.u.name.localeCompare(b.u.name)).slice(0, limit).map(x => x.u);
}
