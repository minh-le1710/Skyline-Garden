import type { OrderItem, Reward, TutorialStep } from '../types';

/** Bước plantRow: trồng chừng này cây; bước harvest: thu hoạch chừng này lần. */
export const TUTORIAL_PLANT_COUNT = 3;
export const TUTORIAL_HARVEST_COUNT = 3;

/** Thưởng khi đi hết hướng dẫn (bỏ qua thì không có). */
export const TUTORIAL_REWARD: Reward = { gold: 50, ruby: 3, seeds: { sunflower: 5 } };

/** Đơn hàng đầu tiên cố định để bước giao hàng không bao giờ kẹt vì đơn ngẫu nhiên. */
export const FIRST_ORDER: { items: OrderItem[]; gold: number; xp: number } = {
  items: [{ id: 'rose', qty: 4 }],
  gold: 24,
  xp: 3,
};

/** Các bước do giao diện báo xong (bấm nút, mở khay, mở bảng…) qua lệnh advanceTutorial. */
export const UI_STEPS: readonly TutorialStep[] = [
  'welcome',
  'openTray',
  'pickSeed',
  'openOrders',
  'openShop',
];
