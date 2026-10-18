import type { FigureSpec } from '../ui/IsoFigure';
import { rotaryConveyor } from './conveyor';
import { bucketElevator } from './elevator';
import { marginGearbox } from './gearbox';
import { paybackPress } from './press';
import { splitterValve } from './splitter';
import { pressureVessel } from './vessel';

// One figure per module, each worked by a single lever whose value a concept sets when it opens.
export const figures = {
  'margin-gearbox': marginGearbox, 'pressure-vessel': pressureVessel, 'rotary-conveyor': rotaryConveyor,
  'bucket-elevator': bucketElevator, 'payback-press': paybackPress, 'splitter-valve': splitterValve,
} satisfies Record<string, FigureSpec<any>>;
export type FigureId = keyof typeof figures;
