import fc from 'fast-check';
import { PLANT_IDS, POT_IDS, type Command } from '../src/game';

// Bộ sinh lệnh ngẫu nhiên cho property test. Cố ý gồm cả chỉ số ngoài phạm vi để thử nhánh lỗi.
const floor = fc.integer({ min: 0, max: 9 });
const slot = fc.integer({ min: 0, max: 7 });
const plantId = fc.constantFrom(...PLANT_IDS);
const potId = fc.constantFrom(...POT_IDS);
const qty = fc.integer({ min: 1, max: 6 });
const index = fc.integer({ min: 0, max: 7 });

export const commandArb: fc.Arbitrary<Command> = fc.oneof(
  { weight: 2, arbitrary: fc.constant({ type: 'tick' as const }) },
  { weight: 3, arbitrary: fc.record({ type: fc.constant('buySeed' as const), plantId, qty }) },
  { weight: 1, arbitrary: fc.record({ type: fc.constant('buyPot' as const), potId, qty: fc.constant(1) }) },
  { weight: 1, arbitrary: fc.record({ type: fc.constant('placePot' as const), floor, slot, potId }) },
  { weight: 5, arbitrary: fc.record({ type: fc.constant('plant' as const), floor, slot, plantId }) },
  { weight: 5, arbitrary: fc.record({ type: fc.constant('harvest' as const), floor, slot }) },
  { weight: 1, arbitrary: fc.record({ type: fc.constant('speedUp' as const), floor, slot }) },
  { weight: 2, arbitrary: fc.record({ type: fc.constant('sellCrop' as const), plantId, qty }) },
  { weight: 1, arbitrary: fc.constant({ type: 'upgradeStorage' as const }) },
  { weight: 1, arbitrary: fc.constant({ type: 'unlockFloor' as const }) },
  { weight: 2, arbitrary: fc.record({ type: fc.constant('deliverOrder' as const), index }) },
  { weight: 1, arbitrary: fc.record({ type: fc.constant('discardOrder' as const), index }) },
);

/** Chuỗi (khoảng thời gian trôi qua, lệnh). Khoảng thời gian từ 0 tới 2 giờ để cây kịp chín. */
export const scriptArb = fc.array(fc.tuple(fc.integer({ min: 0, max: 7_200_000 }), commandArb), {
  minLength: 1,
  maxLength: 60,
});

export const NUM_RUNS = Number(process.env.FC_NUM_RUNS ?? 200);
