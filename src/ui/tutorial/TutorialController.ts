import { effect } from '@preact/signals-core';
import type { Game } from '../../core/Game';
import type { TutorialStep } from '../../game';
import type { Projector } from './projector';

/**
 * Theo dõi giao diện cho các bước do UI báo xong (mở khay, chọn hạt, mở bảng) và dọn đường khi sang bước mới
 * (đóng bảng cũ, đưa camera về tầng 0). Mọi thay đổi state vẫn đi qua lệnh.
 */
export function connectTutorial(game: Game, projector: Projector): () => void {
  const advance = (from: TutorialStep) =>
    game.exec({ type: 'advanceTutorial', from }, { quiet: ['WRONG_STEP'] });

  const stopUi = effect(() => {
    const step = game.state.value.tutorial.step;
    const ui = game.ui;
    if (step === 'openTray' && ui.trayOpen.value) advance('openTray');
    else if (step === 'pickSeed' && ui.tool.value?.kind === 'seed') advance('pickSeed');
    else if (step === 'openOrders' && ui.panel.value === 'orders') advance('openOrders');
    else if (step === 'openShop' && ui.panel.value === 'shop') advance('openShop');
  });

  // Vào bước mới: chuẩn bị giao diện cho bước đó.
  const stopEnter = game.events.on((event) => {
    if (event.type !== 'tutorialStep') return;
    const ui = game.ui;
    switch (event.step) {
      case 'plantRow':
      case 'harvest':
        projector.focusFloor(0);
        break;
      case 'openShop':
        // Vừa giao đơn trong bảng đơn hàng: đóng lại để thấy nút Cửa hàng.
        if (ui.panel.value === 'orders') ui.panel.value = null;
        ui.tool.value = null;
        break;
      case 'buySeeds':
        ui.shopTab.value = 'seeds';
        break;
      case 'openOrders':
        ui.tool.value = null;
        break;
    }
  });
  return () => {
    stopUi();
    stopEnter();
  };
}
