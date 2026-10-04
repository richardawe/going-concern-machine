import { clamp, ratio } from '../model/config';
import type { EventKind, Game, YearRecord } from '../ceo/types';

// The live company scene draws nothing that the game did not compute. `sceneFrame` turns one played year into the
// handful of numbers the 3D scene animates towards; every field names the game value it comes from.

export type Health = 'thriving' | 'steady' | 'struggling' | 'stalled';
export type Weather = 'clear' | 'boom' | 'rain' | 'storm' | 'haze';

export interface SceneFrame {
  year: number;
  /** Tower height in floors: revenue relative to Year 0 (6 floors at Year 0). */ floors: number;
  /** Share of windows lit: team productivity. */ lit: number;
  /** Flywheel speed in radians per second: business momentum (−100 to +100); near zero when decaying hard. */ spin: number;
  /** Flywheel wobble 0–1: negative momentum, or an emergency loan this year. */ wobble: number;
  /** Cash tank level 0–1: cash relative to Year 0 cash (half full at Year 0). */ cashLevel: number;
  /** Cash flow through the tank pipe, −1 to +1: free cash flow as a share of revenue. */ cashFlow: number;
  /** Debt weights hanging off the tower: debt per 10% of Year 0 revenue. */ debtWeights: number;
  /** An emergency loan was drawn this year: the alarm beacon flashes. */ alarm: boolean;
  /** Staff figures on the plaza: headcount relative to Year 0 (24 figures at Year 0). */ staff: number;
  /** Staff walking pace 0–1: morale. */ morale: number;
  /** Share of figures heading for the exit: attrition, plus layoffs this year. */ leaving: number;
  /** Customer arrivals per second: customer activity relative to Year 0. */ arrivals: number;
  /** Share of arriving customers who turn away: churn rate. */ churn: number;
  /** Cranes on site: investments and delayed decisions still in the pipeline (max 3). */ cranes: number;
  weather: Weather;
  health: Health;
}

const weatherFor = (kinds: EventKind[]): Weather =>
  kinds.includes('recession') || kinds.includes('creditSqueeze') ? 'storm'
    : kinds.includes('rateRise') || kinds.includes('customerLoss') || kinds.includes('competitorPriceCut') ? 'rain'
      : kinds.includes('costInflation') || kinds.includes('talentWar') ? 'haze'
        : kinds.includes('demandBoom') ? 'boom' : 'clear';

/** How the company is doing this year, for the scene's mood and the status label. Visual only: it changes no rules. */
export function healthOf(r: YearRecord, start: YearRecord): Health {
  const s = r.state, m = s.businessMomentum;
  if (r.emergency > 0 || s.cash <= 0 || (m < -40 && s.freeCashFlow < 0)) return 'stalled';
  if (m < -10 || s.freeCashFlow < 0 || s.cash < start.state.cash * .25) return 'struggling';
  if (m > 15 && s.freeCashFlow > 0 && s.revenue > start.state.revenue) return 'thriving';
  return 'steady';
}

export function sceneFrame(game: Game, records: YearRecord[], year: number): SceneFrame {
  const r = records[year], start = records[0], s = r.state, s0 = start.state;
  const m = s.businessMomentum;
  const kinds = game.caseDef.events.filter(e => e.year === year).map(e => e.kind);
  const layoffShare = ratio(r.people.layoffs, (records[year - 1] ?? r).people.headcount);
  return {
    year,
    floors: clamp(6 * ratio(s.revenue, s0.revenue), 1, 20),
    lit: clamp(.55 * r.people.productivity, .08, 1),
    spin: 2.6 * Math.pow(clamp((m + 100) / 200, 0, 1), 1.6),
    wobble: clamp(Math.max(0, -m) / 60 + (r.emergency > 0 ? .5 : 0), 0, 1),
    cashLevel: clamp(.5 * ratio(s.cash, Math.max(s0.cash, s0.revenue * .05)), 0, 1),
    cashFlow: clamp(ratio(s.freeCashFlow, s.revenue) * 5, -1, 1),
    debtWeights: clamp(Math.round(ratio(s.debt, s0.revenue * .1)), 0, 12),
    alarm: r.emergency > 0,
    staff: clamp(Math.round(24 * ratio(r.people.headcount, start.people.headcount)), 3, 60),
    morale: clamp(r.people.morale, 0, 1),
    leaving: clamp(r.people.attrition + layoffShare, 0, .8),
    arrivals: clamp(1.6 * ratio(s.customers, s0.customers), .1, 5),
    churn: clamp(s.churnRate, 0, .8),
    cranes: Math.min(3, r.pending.length),
    weather: weatherFor(kinds),
    health: healthOf(r, start),
  };
}

export const healthLabels: Record<Health, string> = { thriving: 'THRIVING', steady: 'STEADY', struggling: 'STRUGGLING', stalled: 'STALLED' };
