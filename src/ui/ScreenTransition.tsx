import { useGame } from './context';

/** Lớp mây che màn hình khi chuyển giữa vườn và mỏ. */
export function ScreenTransition() {
  const game = useGame();
  const phase = game.ui.transition.value;
  if (phase === 'none') return null;
  return <div class={`screen-transition ${phase}`} aria-hidden="true" data-testid="screen-transition" />;
}
