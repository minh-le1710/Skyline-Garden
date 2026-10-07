import { signal } from '@preact/signals';
import type { Game } from '../core/Game';
import type { PlantId, PotId } from '../game';
import { t } from '../i18n';
import { GOLD, PLANT_ICON, XP } from './icons';
import { plantName, potName } from './names';

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
/** Cấp vừa đạt được (hiện hộp thoại chúc mừng), null nếu không có. */
export const levelUp = signal<{ level: number; gold: number; ruby: number } | null>(null);

let nextId = 1;
const TOAST_MS = 2600;
const MAX_TOASTS = 3;

export function showToast(text: string, kind: Toast['kind'] = 'info'): void {
  const toast = { id: nextId++, text, kind };
  // Không lặp lại cùng một thông báo đang hiện.
  if (toasts.value.some((t) => t.text === text)) return;
  toasts.value = [...toasts.value, toast].slice(-MAX_TOASTS);
  setTimeout(() => (toasts.value = toasts.value.filter((t) => t.id !== toast.id)), TOAST_MS);
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
        showToast(t('toast.saveRecovered'), 'error');
        break;
      case 'welcomeBack':
        showToast(t('toast.welcomeBack', { n: event.readyWhileAway }), 'success');
        break;
      case 'ordersArrived':
        showToast(t('toast.ordersArrived', { n: event.count }));
        break;
      case 'harvested': {
        const from = slotScreenPosition(event.floor, event.slot);
        fly(PLANT_ICON[event.plantId], `+${event.qty}`, from, 'storage');
        fly(XP, `+${event.xp}`, { x: from.x, y: from.y - 24 }, 'xp');
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
        const name = event.item === 'seed' ? plantName(event.id as PlantId) : potName(event.id as PotId);
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
