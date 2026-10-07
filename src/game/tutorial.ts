import { TUTORIAL_HARVEST_COUNT, TUTORIAL_PLANT_COUNT, TUTORIAL_REWARD, UI_STEPS } from './config/tutorial';
import { commit, fail } from './commit';
import { grantReward } from './rewards';
import { isReady } from './state';
import {
  TUTORIAL_STEPS,
  type ActionResult,
  type GameEvent,
  type GameState,
  type TutorialStep,
} from './types';

export const tutorialActive = (s: GameState): boolean => s.tutorial.step !== 'done';

const nextStep = (step: TutorialStep): TutorialStep =>
  TUTORIAL_STEPS[Math.min(TUTORIAL_STEPS.indexOf(step) + 1, TUTORIAL_STEPS.length - 1)]!;

/** Chuyển sang một bước; tới bước cuối thì trao thưởng. */
function enterStep(draft: GameState, step: TutorialStep, now: number, events: GameEvent[]): void {
  draft.tutorial = { step, progress: 0 };
  events.push({ type: 'tutorialStep', step });
  if (step === 'done') {
    grantReward(draft, TUTORIAL_REWARD, now, events);
    events.push({ type: 'tutorialDone', skipped: false, reward: TUTORIAL_REWARD });
  }
}

/** Đã có cây chín (bước chờ cây lớn xong). */
function anyReady(s: GameState, now: number): boolean {
  return s.floors.some((f) =>
    f.slots.some((c) => c?.kind === 'pot' && c.plant !== null && isReady(c.plant, now)),
  );
}

/**
 * Bước của applyMeta: các bước theo sự kiện (trồng, thu hoạch, giao đơn, mua hạt) tiến lên theo sự kiện
 * của lệnh vừa chạy. Đếm sự kiện trước rồi mới thêm sự kiện mới, để không tự kích hoạt lại.
 */
export function tutorialOnEvents(draft: GameState, events: GameEvent[], now: number): void {
  const t = draft.tutorial;
  if (t.step === 'done') return;
  const count = (type: GameEvent['type']) => events.filter((e) => e.type === type).length;
  switch (t.step) {
    case 'plantRow': {
      const progress = t.progress + count('planted');
      if (progress >= TUTORIAL_PLANT_COUNT) enterStep(draft, 'waitGrow', now, events);
      else t.progress = progress;
      break;
    }
    case 'waitGrow':
    case 'harvest': {
      // Dùng ruby cho chín ngay rồi thu hoạch luôn: bỏ qua bước chờ.
      const harvested = count('harvested');
      if (harvested === 0) break;
      const progress = (t.step === 'harvest' ? t.progress : 0) + harvested;
      if (progress >= TUTORIAL_HARVEST_COUNT) enterStep(draft, 'openOrders', now, events);
      else draft.tutorial = { step: 'harvest', progress };
      break;
    }
    case 'deliver':
      if (count('orderDelivered') > 0) enterStep(draft, 'openShop', now, events);
      break;
    case 'buySeeds':
      if (events.some((e) => e.type === 'bought' && e.item === 'seed')) enterStep(draft, 'done', now, events);
      break;
  }
}

/** Hệ thống tick: đang chờ cây lớn mà đã có cây chín thì sang bước thu hoạch. */
export const tutorialWaitGrowDue = (s: GameState, now: number): boolean =>
  s.tutorial.step === 'waitGrow' && anyReady(s, now);

export function runTutorialWaitGrow(draft: GameState, now: number, events: GameEvent[]): void {
  enterStep(draft, 'harvest', now, events);
}

/** Giao diện báo xong một bước UI. Chỉ đúng khi đang ở bước `from` (gọi lặp lại vô hại: WRONG_STEP). */
export function advanceTutorial(state: GameState, from: TutorialStep, now: number): ActionResult {
  if (state.tutorial.step !== from || !UI_STEPS.includes(from)) return fail('WRONG_STEP');
  return commit(state, now, (draft, events) => enterStep(draft, nextStep(from), now, events));
}

/** Bỏ qua hướng dẫn (không nhận thưởng). */
export function skipTutorial(state: GameState, now: number): ActionResult {
  if (state.tutorial.step === 'done') return fail('WRONG_STEP');
  return commit(state, now, (draft, events) => {
    draft.tutorial = { step: 'done', progress: 0 };
    events.push({ type: 'tutorialDone', skipped: true, reward: null });
  });
}
