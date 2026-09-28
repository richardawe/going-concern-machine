import { debrief, judgement } from './assess';
import type { Game } from './types';
// Scoring replays the game a few thousand times. Running it here keeps the page responsive; the quick debrief is
// posted first and the judgement grade, which replays every strategy across many worlds, follows.
const post = (message: unknown) => (self as unknown as Worker).postMessage(message);
self.onmessage = (e: MessageEvent<Game>) => {
  post({ type: 'debrief', result: debrief(e.data) });
  post({ type: 'judgement', result: judgement(e.data) });
};
