import { signal } from '@preact/signals';
import type { Game } from '../core/Game';
import type { ItemId, PotInstance, Reward } from '../game';
import { t } from '../i18n';
import { GOLD, ITEM_ICON, RUBY, XP } from './icons';
import { machineName, plantName, potName } from './names';

// Phản hồi cho người chơi: thông báo ngắn (toast), biểu tượng bay về HUD, hộp thoại lên cấp.

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'success' | 'error';
}

export interface Flyer {
  id: number;
  icon: string;
  text: string;
  from: { x: number; y: number };
  target: 'gold' | 'xp' | 'ruby' | 'storage';
}

export const toasts = signal<Toast[]>([]);
export const flyers = signal<Flyer[]>([]);
/** Chậu vừa đúc xong (hiện màn mở chậu). */
/** Hàng đợi chậu vừa đúc chờ mở (lấy nhiều mẻ một lúc thì mở lần lượt). */
export const forgeReveal = signal<PotInstance[]>([]);

/** Cấp vừa đạt được (hiện hộp thoại chúc mừng), null nếu không có. */
export const levelUp = signal<{ level: number; gold: number; ruby: number } | null>(null);

let nextId = 1;
const TOAST_MS = 2600;
const MAX_TOASTS = 3;

export function showToast(text: string, kind: Toast['kind'] = 'info', durationMs = TOAST_MS): void {
  const toast = { id: nextId++, text, kind };
  // Không lặp lại cùng một thông báo đang hiện.
  if (toasts.value.some((t) => t.text === text)) return;
  toasts.value = [...toasts.value, toast].slice(-MAX_TOASTS);
  setTimeout(() => (toasts.value = toasts.value.filter((t) => t.id !== toast.id)), durationMs);
}

export function fly(
  icon: string,
  text: string,
  from: { x: number; y: number },
  target: Flyer['target'],
): void {
  flyers.value = [...flyers.value, { id: nextId++, icon, text, from, target }];
}

export const removeFlyer = (id: number): void => {
  flyers.value = flyers.value.filter((f) => f.id !== id);
};

/** Vị trí chạm gần nhất, làm điểm xuất phát cho hiệu ứng bay khi bấm nút trong bảng. */
let lastPointer = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
window.addEventListener('pointerdown', (e) => (lastPointer = { x: e.clientX, y: e.clientY }), {
  capture: true,
});

function flyReward(reward: Reward): void {
  const from = lastPointer;
  if (reward.gold) fly(GOLD, `+${reward.gold}`, from, 'gold');
  if (reward.ruby) fly(RUBY, `+${reward.ruby}`, { x: from.x + 16, y: from.y }, 'ruby');
  if (reward.xp) fly(XP, `+${reward.xp}`, { x: from.x, y: from.y - 20 }, 'xp');
  for (const [id, n] of Object.entries(reward.items ?? {}))
    fly(ITEM_ICON[id as ItemId], `+${n}`, from, 'storage');
}

export function connectFeedback(
  game: Game,
  slotScreenPosition: (floor: number, slot: number) => { x: number; y: number },
): void {
  game.events.on((event) => {
    switch (event.type) {
      case 'actionFailed':
        showToast(t(`error.${event.error}` as const), 'error');
        break;
      case 'saveRecovered':
        // Thông báo quan trọng: để lâu hơn.
        showToast(t('toast.saveRecovered'), 'error', 9000);
        break;
      case 'welcomeBack':
        if (event.readyWhileAway > 0)
          showToast(t('toast.welcomeBack', { n: event.readyWhileAway }), 'success');
        if (event.pestsWaiting > 0) showToast(t('toast.pestsWaiting', { n: event.pestsWaiting }));
        break;
      case 'pestCaught': {
        const from = slotScreenPosition(event.floor, event.slot);
        for (const [id, n] of Object.entries(event.items))
          fly(ITEM_ICON[id as ItemId], `+${n}`, from, 'storage');
        fly(GOLD, `+${event.gold}`, { x: from.x + 20, y: from.y - 10 }, 'gold');
        fly(XP, `+${event.xp}`, { x: from.x, y: from.y - 30 }, 'xp');
        break;
      }
      case 'ordersArrived':
        showToast(t('toast.ordersArrived', { n: event.count }));
        break;
      case 'harvested': {
        const from = slotScreenPosition(event.floor, event.slot);
        fly(ITEM_ICON[event.plantId], `+${event.qty}`, from, 'storage');
        fly(XP, `+${event.xp}`, { x: from.x, y: from.y - 24 }, 'xp');
        if (event.gold > 0) fly(GOLD, `+${event.gold}`, { x: from.x + 20, y: from.y - 12 }, 'gold');
        break;
      }
      case 'sold':
        fly(GOLD, `+${event.gold}`, lastPointer, 'gold');
        break;
      case 'orderDelivered':
        fly(GOLD, `+${event.gold}`, lastPointer, 'gold');
        fly(XP, `+${event.xp}`, { x: lastPointer.x, y: lastPointer.y - 24 }, 'xp');
        showToast(t('toast.delivered', { gold: event.gold, xp: event.xp }), 'success');
        break;
      case 'bought': {
        const name = event.item === 'seed' ? plantName(event.id) : potName(event.id);
        showToast(t('toast.bought', { qty: event.qty, name }), 'success');
        break;
      }
      case 'floorUnlocked':
        showToast(t('toast.floorUnlocked', { n: event.floor + 1 }), 'success');
        break;
      case 'storageUpgraded':
        showToast(t('toast.storageUpgraded', { n: event.capacity }), 'success');
        break;
      case 'needPot':
        showToast(t('toast.needPot'));
        game.ui.shopTab.value = 'pots';
        game.ui.panel.value = 'shop';
        break;
      case 'goodsCollected': {
        const from = slotScreenPosition(event.floor, event.slot);
        for (const [id, n] of Object.entries(event.items))
          fly(ITEM_ICON[id as ItemId], `+${n}`, from, 'storage');
        fly(XP, `+${event.xp}`, { x: from.x, y: from.y - 24 }, 'xp');
        break;
      }
      case 'potForged':
        forgeReveal.value = [...forgeReveal.value, event.pot];
        break;
      case 'potSold':
        fly(GOLD, `+${event.gold}`, lastPointer, 'gold');
        break;
      case 'potSalvaged':
        for (const [id, n] of Object.entries(event.items))
          fly(ITEM_ICON[id as ItemId], `+${n}`, lastPointer, 'storage');
        break;
      case 'balloonArrived':
        showToast(t('toast.balloonArrived', { n: event.crates }), 'success');
        break;
      case 'balloonSent':
        showToast(t('toast.balloonSent'));
        if (event.completed) flyReward(event.reward);
        break;
      case 'crateFilled':
        fly(GOLD, `+${event.gold}`, lastPointer, 'gold');
        fly(XP, `+${event.xp}`, { x: lastPointer.x, y: lastPointer.y - 20 }, 'xp');
        break;
      case 'questCompleted':
        showToast(t('toast.questCompleted'), 'success');
        break;
      case 'loginClaimed':
      case 'questClaimed':
      case 'questBonusClaimed':
        flyReward(event.reward);
        break;
      case 'machineBuilt':
        showToast(t('toast.machineBuilt', { name: machineName(event.machineId) }), 'success');
        break;
      case 'machineUpgraded':
        showToast(
          t('toast.machineUpgraded', { name: machineName(event.machineId), n: event.level }),
          'success',
        );
        break;
      case 'levelUp': {
        // Lên nhiều cấp một lúc thì gộp phần thưởng, hiện cấp cao nhất.
        const prev = levelUp.value;
        levelUp.value = {
          level: event.level,
          gold: (prev?.gold ?? 0) + event.gold,
          ruby: (prev?.ruby ?? 0) + event.ruby,
        };
        break;
      }
    }
  });
}
