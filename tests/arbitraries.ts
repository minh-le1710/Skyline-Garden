import fc from 'fast-check';
import { ACHIEVEMENT_IDS, FORGE_IDS, GOOD_IDS, MACHINE_IDS, PLANT_IDS, type Command } from '../src/game';

// Bộ sinh lệnh ngẫu nhiên cho property test. Cố ý gồm cả chỉ số ngoài phạm vi để thử nhánh lỗi.
const floor = fc.integer({ min: 0, max: 9 });
const slot = fc.integer({ min: 0, max: 7 });
const plantId = fc.constantFrom(...PLANT_IDS);
const potId = fc.constantFrom('clay' as const, 'ceramic' as const, 'porcelain' as const, 'jade' as const);
const uid = fc.integer({ min: 1, max: 30 });
const itemId = fc.constantFrom(...PLANT_IDS);
const qty = fc.integer({ min: 1, max: 6 });
const index = fc.integer({ min: 0, max: 7 });

export const commandArb: fc.Arbitrary<Command> = fc.oneof(
  { weight: 2, arbitrary: fc.constant({ type: 'tick' as const }) },
  { weight: 3, arbitrary: fc.record({ type: fc.constant('buySeed' as const), plantId, qty }) },
  { weight: 1, arbitrary: fc.record({ type: fc.constant('buyPot' as const), potId, qty: fc.constant(1) }) },
  { weight: 1, arbitrary: fc.record({ type: fc.constant('placePot' as const), floor, slot, uid }) },
  { weight: 5, arbitrary: fc.record({ type: fc.constant('plant' as const), floor, slot, plantId }) },
  { weight: 5, arbitrary: fc.record({ type: fc.constant('harvest' as const), floor, slot }) },
  { weight: 2, arbitrary: fc.record({ type: fc.constant('catchPest' as const), floor, slot }) },
  { weight: 3, arbitrary: fc.record({ type: fc.constant('sweep' as const), floor, slot }) },
  { weight: 1, arbitrary: fc.record({ type: fc.constant('speedUp' as const), floor, slot }) },
  { weight: 2, arbitrary: fc.record({ type: fc.constant('sellItem' as const), id: itemId, qty }) },
  { weight: 1, arbitrary: fc.constant({ type: 'upgradeStorage' as const }) },
  { weight: 1, arbitrary: fc.constant({ type: 'unlockFloor' as const }) },
  { weight: 2, arbitrary: fc.record({ type: fc.constant('deliverOrder' as const), index }) },
  { weight: 1, arbitrary: fc.record({ type: fc.constant('discardOrder' as const), index }) },
  {
    weight: 1,
    arbitrary: fc.record({
      type: fc.constant('buildMachine' as const),
      machineId: fc.constantFrom(...MACHINE_IDS),
      floor,
      slot,
    }),
  },
  {
    weight: 2,
    arbitrary: fc.record({
      type: fc.constant('startJob' as const),
      floor,
      slot,
      recipe: fc.constantFrom(...GOOD_IDS, ...FORGE_IDS),
    }),
  },
  { weight: 2, arbitrary: fc.record({ type: fc.constant('collectMachine' as const), floor, slot }) },
  { weight: 1, arbitrary: fc.record({ type: fc.constant('speedUpMachine' as const), floor, slot }) },
  { weight: 1, arbitrary: fc.record({ type: fc.constant('cancelJob' as const), floor, slot, index }) },
  { weight: 1, arbitrary: fc.record({ type: fc.constant('upgradeMachine' as const), floor, slot }) },
  {
    weight: 1,
    arbitrary: fc.record({
      type: fc.constant('swapSlots' as const),
      floor,
      slot,
      toFloor: floor,
      toSlot: slot,
    }),
  },
  { weight: 1, arbitrary: fc.constant({ type: 'claimLogin' as const }) },
  { weight: 1, arbitrary: fc.record({ type: fc.constant('claimQuest' as const), index }) },
  { weight: 1, arbitrary: fc.record({ type: fc.constant('rerollQuest' as const), index }) },
  { weight: 1, arbitrary: fc.constant({ type: 'claimQuestBonus' as const }) },
  { weight: 1, arbitrary: fc.record({ type: fc.constant('fillCrate' as const), index }) },
  { weight: 1, arbitrary: fc.constant({ type: 'sendBalloon' as const }) },
  {
    weight: 1,
    arbitrary: fc.record({
      type: fc.constant('claimAchievement' as const),
      id: fc.constantFrom(...ACHIEVEMENT_IDS),
    }),
  },
);

/** Chuỗi (khoảng thời gian trôi qua, lệnh). Khoảng thời gian từ 0 tới 2 giờ để cây kịp chín. */
export const scriptArb = fc.array(fc.tuple(fc.integer({ min: 0, max: 7_200_000 }), commandArb), {
  minLength: 1,
  maxLength: 60,
});

export const NUM_RUNS = Number(process.env.FC_NUM_RUNS ?? 200);
