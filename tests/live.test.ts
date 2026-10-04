import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildArchetypes } from '../src/ceo/archetypes';
import { fictionalCompany, prepareStart } from '../src/ceo/company';
import { cases } from '../src/ceo/cases';
import { defaultLevers, play, statusQuo } from '../src/ceo/game';
import { sandboxCase } from '../src/ceo/sandbox';
import { healthOf, sceneFrame } from '../src/live/frame';
import type { CaseDef, Decision, Game } from '../src/ceo/types';
import type { CompanyDataset } from '../src/ontology/types';

const index = JSON.parse(readFileSync('public/machines/index.json', 'utf8')) as { companies: { ticker: string }[] };
const archetypes = buildArchetypes(index.companies.map(c => JSON.parse(readFileSync(`public/machines/${c.ticker}.json`, 'utf8')) as CompanyDataset), 'test');
const gameFor = (c: CaseDef, decisions?: (start: Game['start']) => Decision[]): Game => {
  const start = prepareStart(fictionalCompany(archetypes.archetypes.find(a => a.id === c.archetype)!, c.seed), c.setup);
  return { start, caseDef: c, seed: c.seed, decisions: decisions ? decisions(start) : statusQuo(start, c.turns.length) };
};

test('every scene frame is finite and inside its drawable range for every case', () => {
  for (const c of cases) {
    const game = gameFor(c), records = play(game);
    records.forEach((_, y) => {
      const f = sceneFrame(game, records, y);
      for (const [k, v] of Object.entries(f)) if (typeof v === 'number') assert.ok(Number.isFinite(v), `${c.id} y${y} ${k}`);
      assert.ok(f.floors >= 1 && f.floors <= 20 && f.cashLevel >= 0 && f.cashLevel <= 1 && f.staff >= 3 && f.staff <= 60 && f.cranes <= 3);
    });
  }
});

test('the scene follows the game: Year 0 is the reference, and bigger revenue means a taller tower', () => {
  const game = gameFor(cases[0]), records = play(game), f0 = sceneFrame(game, records, 0);
  assert.equal(f0.floors, 6); assert.equal(f0.staff, 24); assert.ok(f0.cashLevel > 0 && f0.cashLevel <= .5, 'half full at most: a very thin cash pile reads as low');
  const grown = structuredClone(records); grown[1].state.revenue = records[0].state.revenue * 1.5;
  assert.ok(sceneFrame(game, grown, 1).floors > sceneFrame(game, records, 1).floors || records[1].state.revenue >= grown[1].state.revenue);
  const sandbox = sandboxCase({ archetype: 'industrial', events: [{ kind: 'recession', year: 2 }, { kind: 'rateRise', year: 3 }] }), g = gameFor(sandbox), r = play(g);
  assert.equal(sceneFrame(g, r, 2).weather, 'storm'); assert.equal(sceneFrame(g, r, 3).weather, 'rain'); assert.equal(sceneFrame(g, r, 1).weather, 'clear');
});

test('a company can be driven to success or to failure', () => {
  // Reckless: a storm of shocks, borrow every year, cut prices, cut staff and pay, stop reinvesting.
  const storm = sandboxCase({ archetype: 'retail', events: [{ kind: 'recession', year: 1 }, { kind: 'creditSqueeze', year: 2 }, { kind: 'rateRise', year: 2 }, { kind: 'costInflation', year: 3 }, { kind: 'customerLoss', year: 4 }] });
  const reckless = gameFor(storm, s => Array.from({ length: 5 }, (_, i) => ({ card: ['priceCut', 'layoffs', 'debt', 'priceCut', 'layoffs'][i], levers: { ...defaultLevers(s), pay: -10, reinvestment: 0, dividends: 100 } })));
  const bad = play(reckless), worst = sceneFrame(reckless, bad, 5);
  assert.ok(['stalled', 'struggling'].includes(worst.health), `reckless ends ${worst.health}`);
  // Patient: calm years, invest in brand and R&D, pay a little above market.
  const calm = sandboxCase({ archetype: 'software', events: [{ kind: 'demandBoom', year: 2 }] });
  const patient = gameFor(calm, s => Array.from({ length: 5 }, (_, i) => ({ card: ['rd', 'brand', null, 'automate', null][i], levers: { ...defaultLevers(s), pay: 3, reinvestment: 80, dividends: 0 } })));
  const good = play(patient), best = sceneFrame(patient, good, 5);
  assert.ok(['thriving', 'steady'].includes(best.health), `patient ends ${best.health}`);
  assert.ok(healthOf(good[5], good[0]) !== 'stalled');
  console.log(`reckless: ${bad.map((r, y) => sceneFrame(reckless, bad, y).health).join(' → ')}`);
  console.log(`patient:  ${good.map((r, y) => sceneFrame(patient, good, y).health).join(' → ')}`);
});
