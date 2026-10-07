import { useEffect, useState } from 'preact/hooks';
import {
  TUTORIAL_HARVEST_COUNT,
  TUTORIAL_PLANT_COUNT,
  formatDuration,
  remainingMs,
  type TutorialStep,
} from '../../game';
import { t } from '../../i18n';
import { useGame } from '../context';
import { activeModal } from '../modals';
import { PuffAvatar } from '../PuffAvatar';
import { targetFor, type TutorialTarget } from './targets';
import { unionRect, useProjector, type ScreenRect } from './projector';

const PAD = 6;
const sameRect = (a: ScreenRect | null, b: ScreenRect | null) =>
  a === b || (!!a && !!b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h);

/** Lời nhắn của bước hiện tại. */
function message(
  step: TutorialStep,
  progress: number,
  targetKind: TutorialTarget['kind'],
  waitMs: number,
): string {
  switch (step) {
    case 'plantRow':
      return targetKind === 'slots'
        ? t('tutorial.plantRow', { n: progress, goal: TUTORIAL_PLANT_COUNT })
        : t('tutorial.pickSeed');
    case 'waitGrow':
      return t('tutorial.waitGrow', { time: formatDuration(waitMs) });
    case 'harvest':
      return targetKind === 'dom'
        ? t('tutorial.harvestTool')
        : t('tutorial.harvest', { n: progress, goal: TUTORIAL_HARVEST_COUNT });
    case 'welcome':
      return t('tutorial.welcome');
    case 'done':
      return '';
    default:
      return t(`tutorial.${step}` as const);
  }
}

/**
 * Lớp hướng dẫn: làm tối màn hình trừ đúng chỗ cần chạm (bốn tấm chắn quanh một "lỗ", vì bóng đổ
 * không chặn được cú chạm), kèm bong bóng lời nhắn của Bông và nút bỏ qua luôn hiện.
 */
export function TutorialOverlay() {
  const game = useGame();
  const projector = useProjector();
  const state = game.state.value;
  const now = game.now.value;
  const { step, progress } = state.tutorial;
  const hidden = step === 'done' || activeModal.value !== null || game.blocked.value !== null;
  const target = hidden ? null : targetFor(step, game, now);
  const [rect, setRect] = useState<ScreenRect | null>(null);

  // Đo lại vị trí mục tiêu mỗi khung hình (camera trượt, bảng mở ra, bàn phím ảo…).
  useEffect(() => {
    if (!target || target.kind === 'modal' || (target.kind === 'none' && !target.slots?.length)) {
      setRect(null);
      return;
    }
    let frame = 0;
    let last: ScreenRect | null = null;
    const measure = () => {
      let next: ScreenRect | null;
      if (target.kind === 'dom') {
        const el = document.querySelector(`[data-testid="${target.testId}"]`);
        const r = el?.getBoundingClientRect();
        next = r && r.width > 0 ? { x: r.left, y: r.top, w: r.width, h: r.height } : null;
      } else {
        const floor = target.kind === 'slots' ? target.floor : 0;
        next = unionRect((target.slots ?? []).map((slot) => projector.slotRect(floor, slot)));
      }
      if (next)
        next = { x: Math.round(next.x), y: Math.round(next.y), w: Math.round(next.w), h: Math.round(next.h) };
      if (!sameRect(next, last)) {
        last = next;
        setRect(next);
      }
      frame = requestAnimationFrame(measure);
    };
    measure();
    return () => cancelAnimationFrame(frame);
  }, [JSON.stringify(target)]);

  if (hidden || !target) return null;

  const skip = () => game.exec({ type: 'skipTutorial' }, { quiet: ['WRONG_STEP'] });
  const skipButton = (
    <button class="tutorial-skip" onClick={skip} data-testid="tutorial-skip">
      {t('tutorial.skip')}
    </button>
  );

  if (target.kind === 'modal') {
    return (
      <div class="tutorial-layer modal" data-testid="tutorial">
        <div class="tutorial-dim full" />
        <section
          class="tutorial-card"
          role="dialog"
          aria-modal="true"
          aria-label={t('tutorial.welcome.title')}
        >
          <PuffAvatar size={84} />
          <h2>{t('tutorial.welcome.title')}</h2>
          <p>{t('tutorial.welcome')}</p>
          <button
            class="btn primary big"
            onClick={() => game.exec({ type: 'advanceTutorial', from: 'welcome' }, { quiet: ['WRONG_STEP'] })}
            data-testid="tutorial-next"
          >
            {t('tutorial.next')}
          </button>
          {skipButton}
        </section>
      </div>
    );
  }

  const waitMs = Math.max(
    0,
    ...state.floors[0]!.slots.map((c) => (c?.kind === 'pot' && c.plant ? remainingMs(c.plant, now) : 0)),
  );
  const text = message(step, progress, target.kind, waitMs);
  const blocking = target.kind !== 'none' && rect !== null;
  const hole = rect && { x: rect.x - PAD, y: rect.y - PAD, w: rect.w + PAD * 2, h: rect.h + PAD * 2 };
  // Bong bóng nằm phía trên lỗ nếu lỗ ở nửa dưới màn hình, ngược lại nằm dưới.
  const below = !hole || hole.y + hole.h / 2 < window.innerHeight / 2;
  // Đang mở bảng (mục tiêu nằm trong bảng): đặt bong bóng ngay dưới HUD để không che nội dung bảng.
  const inPanel = game.ui.panel.value !== null;
  const bubbleStyle = inPanel
    ? { top: 'calc(var(--hud-bottom, 100px) + 8px)' }
    : hole
      ? below
        ? { top: `${Math.min(hole.y + hole.h + 12, window.innerHeight - 160)}px` }
        : { bottom: `${Math.min(window.innerHeight - hole.y + 12, window.innerHeight - 160)}px` }
      : { top: '35%' };

  return (
    <div class="tutorial-layer" data-testid="tutorial" data-step={step}>
      {blocking && hole && (
        <>
          <div
            class="tutorial-dim"
            style={{ left: 0, top: 0, right: 0, height: `${Math.max(0, hole.y)}px` }}
          />
          <div class="tutorial-dim" style={{ left: 0, top: `${hole.y + hole.h}px`, right: 0, bottom: 0 }} />
          <div
            class="tutorial-dim"
            style={{ left: 0, top: `${hole.y}px`, width: `${Math.max(0, hole.x)}px`, height: `${hole.h}px` }}
          />
          <div
            class="tutorial-dim"
            style={{ left: `${hole.x + hole.w}px`, top: `${hole.y}px`, right: 0, height: `${hole.h}px` }}
          />
          <div
            class="tutorial-ring"
            style={{ left: `${hole.x}px`, top: `${hole.y}px`, width: `${hole.w}px`, height: `${hole.h}px` }}
          />
        </>
      )}
      <div class="tutorial-bubble" style={bubbleStyle} role="status" aria-live="polite">
        <PuffAvatar size={44} mood={step === 'waitGrow' ? 'sleepy' : 'happy'} />
        <p>{text}</p>
        {skipButton}
      </div>
    </div>
  );
}
