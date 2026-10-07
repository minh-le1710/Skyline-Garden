// Nối game với âm thanh: sự kiện → hiệu ứng, tiếng bấm nút, tiếng mở/đóng bảng, chuông máy xong việc,
// rung phản hồi và cài đặt âm lượng. Không tạo AudioContext ở đây (chờ thao tác đầu tiên của người chơi).
import { effect } from '@preact/signals-core';
import type { AppEvent, Game } from '../core/Game';
import { allMachines, machineStatus, type GameState } from '../game';
import { haptic } from '../platform/haptics';
import { AudioEngine } from './AudioEngine';
import type { ThemeId } from './music/themes';
import type { SfxId } from './sfx';

type EventOf<K extends AppEvent['type']> = Extract<AppEvent, { type: K }>;

/** Mỗi loại sự kiện phát một hiệu ứng, hoặc một hàm chọn danh sách hiệu ứng theo nội dung sự kiện. */
export type SfxForEvent = {
  [K in AppEvent['type']]?: SfxId | ((event: EventOf<K>) => SfxId[]);
};

/**
 * Hiệu ứng cho từng sự kiện. Các công thức của hầm mỏ và thú cưng (dig, rockBreak, gem, boom, munch, petCoo)
 * sẽ được gắn khi các tính năng đó có sự kiện.
 */
export const SFX_FOR_EVENT: SfxForEvent = {
  planted: 'plant',
  harvested: 'harvest',
  pestCaught: 'bugCatch',
  potPlaced: 'potPlace',
  slotsSwapped: 'potPlace',
  potStored: 'select',
  speedUp: 'magic',
  machineSpeedUp: 'magic',
  questRerolled: 'magic',
  potForged: 'magic',
  potSalvaged: 'magic',
  bought: 'coinSpend',
  storageUpgraded: 'coinSpend',
  machineUpgraded: 'coinSpend',
  machineBuilt: () => ['potPlace', 'coinSpend'],
  jobStarted: 'potPlace',
  jobCanceled: 'whoosh',
  goodsCollected: 'harvest',
  sold: 'coin',
  potSold: 'coin',
  orderDelivered: 'coin',
  crateFilled: 'coin',
  loginClaimed: 'coin',
  questClaimed: 'coin',
  questBonusClaimed: 'coin',
  achievementClaimed: 'coin',
  achievementUnlocked: 'fanfare',
  questCompleted: 'chime',
  orderDiscarded: 'whoosh',
  balloonArrived: 'chime',
  balloonSent: (e) => (e.completed ? ['coin'] : ['whoosh']),
  levelUp: 'levelUp',
  floorUnlocked: 'unlock',
  ordersArrived: 'owlHoot',
  welcomeBack: 'chime',
  actionFailed: 'error',
};

export function sfxForEvent(event: AppEvent): SfxId[] {
  const entry = SFX_FOR_EVENT[event.type] as SfxId | ((e: AppEvent) => SfxId[]) | undefined;
  if (entry === undefined) return [];
  return typeof entry === 'string' ? [entry] : entry(event);
}

/** Tổng số mẻ đã xong mà chưa lấy, trên mọi máy. */
export function readyJobCount(state: GameState, now: number): number {
  let ready = 0;
  for (const { machine } of allMachines(state)) ready += machineStatus(machine, now).readyCount;
  return ready;
}

/** Kiểm tra máy xong việc tối đa mỗi giây một lần. */
const MACHINE_CHECK_MS = 1000;

export interface AudioHandle {
  readonly engine: AudioEngine;
  /** Đổi nhạc nền theo màn hình (vườn / hầm mỏ). */
  setTheme(theme: ThemeId): void;
  dispose(): void;
}

export function connectAudio(game: Game): AudioHandle {
  const engine = new AudioEngine();
  engine.install();
  const disposers: (() => void)[] = [];

  disposers.push(
    effect(() => {
      const s = game.settings.value.value;
      engine.setLevels({ sfx: s.sfx, music: s.music, muted: s.muted, reverb: s.quality !== 'low' });
    }),
  );

  // Máy xong việc không phải sự kiện của game (chỉ là thời gian trôi): so số mẻ chờ lấy theo thời gian.
  let readyBefore = -1;
  let checkedAt = -Infinity;
  disposers.push(
    effect(() => {
      const now = game.now.value;
      if (Math.abs(now - checkedAt) < MACHINE_CHECK_MS) return;
      checkedAt = now;
      const ready = readyJobCount(game.state.peek(), now);
      if (readyBefore >= 0 && ready > readyBefore) engine.play('machineDone');
      readyBefore = ready;
    }),
  );

  disposers.push(
    game.events.on((event) => {
      for (const id of sfxForEvent(event)) engine.play(id);
      // State bị thay toàn bộ: lấy lại mốc số mẻ chờ lấy, không kêu chuông.
      if (event.type === 'stateReplaced') readyBefore = -1;
      if (game.settings.value.peek().haptics) {
        if (event.type === 'planted') haptic('light');
        else if (event.type === 'harvested') haptic('medium');
      }
    }),
  );

  // Mở/đóng bảng: tiếng gió. Chọn công cụ hay hạt giống: tiếng "ting".
  let panel = game.ui.panel.peek();
  disposers.push(
    effect(() => {
      const next = game.ui.panel.value;
      if (next === panel) return;
      panel = next;
      engine.play('whoosh');
    }),
  );
  let tool = game.ui.tool.peek();
  disposers.push(
    effect(() => {
      const next = game.ui.tool.value;
      if (next === tool) return;
      tool = next;
      if (next) engine.play('select');
    }),
  );

  // Mọi <button> kêu "tách", trừ nút có data-sfx="none".
  const onClick = (e: MouseEvent) => {
    const button = e.target instanceof Element ? e.target.closest('button') : null;
    if (button && button.dataset.sfx !== 'none') engine.play('click');
  };
  document.addEventListener('click', onClick, { capture: true });
  disposers.push(() => document.removeEventListener('click', onClick, { capture: true }));

  return {
    engine,
    setTheme: (theme) => engine.setTheme(theme),
    dispose: () => disposers.forEach((fn) => fn()),
  };
}
