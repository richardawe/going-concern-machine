import { debrief, judgement } from './assess';
import type { Decision, Game } from './types';
// Scoring replays the game a few thousand times. Running it here keeps the page responsive; the quick debrief is
// posted first, then the judgement grade, then the challenger's judgement when this game answers a challenge.
const post = (message: unknown) => (self as unknown as Worker).postMessage(message);
self.onmessage = (e: MessageEvent<{ game: Game; challenger?: Decision[] }>) => {
  const { game, challenger } = e.data;
  post({ type: 'debrief', result: debrief(game) });
  post({ type: 'judgement', result: judgement(game) });
  if (challenger) post({ type: 'challenger', result: judgement({ ...game, decisions: challenger }) });
};
