import { commit, fail } from './commit';
import {
  AWAY_COMPLETED_MS,
  AWAY_INCOMPLETE_MS,
  BALLOON_BONUS,
  BALLOON_UNLOCK_LEVEL,
  CRATE_GOLD_MULTIPLIER,
  CRATE_GOODS_SHARE,
  CRATE_XP_MULTIPLIER,
  DOCK_MS,
  crateCount,
} from './config/balloon';
import { GOODS } from './config/goods';
import { ITEMS } from './config/items';
import { PLANTS } from './config/plants';
import { isInt } from './ids';
import { producibleGoods } from './machines';
import { addXp, unlockedPlants } from './progression';
import { grantReward } from './rewards';
import { withRng, type Rng } from './rng';
import { addCount, count } from './state';
import type { ActionResult, BarnItemId, Crate, GameEvent, GameState, Reward } from './types';

const round10 = (x: number): number => Math.max(10, Math.round(x / 10) * 10);

function crateQty(rng: Rng, id: BarnItemId): number {
  if (ITEMS[id].kind === 'good') {
    const minutes = GOODS[id as keyof typeof GOODS].minutes;
    return minutes <= 30 ? 3 : minutes <= 90 ? 2 : 1;
  }
  const grow = PLANTS[id as keyof typeof PLANTS].growSec;
  return grow <= 3600 ? rng.int(6, 10) : grow <= 14_400 ? rng.int(4, 6) : rng.int(2, 4);
}

/** Tạo các thùng hàng cho một chuyến (luồng `balloon`). */
export function generateCrates(rng: Rng, s: GameState): Crate[] {
  const allGoods: BarnItemId[] = producibleGoods(s);
  const allCrops: BarnItemId[] = unlockedPlants(s.level).filter((id) => PLANTS[id].growSec >= 900);
  // Ưu tiên món khác nhau; hết món mới cho lặp lại.
  let goods = [...allGoods];
  let crops = [...allCrops];
  const crates: Crate[] = [];
  for (let i = 0; i < crateCount(s.level); i++) {
    if (!goods.length) goods = [...allGoods];
    if (!crops.length) crops = [...allCrops];
    const wantGood = rng.next() < CRATE_GOODS_SHARE;
    const list = (wantGood && goods.length) || !crops.length ? goods : crops;
    if (!list.length) break;
    const id = rng.pick(list);
    list.splice(list.indexOf(id), 1);
    const qty = crateQty(rng, id);
    crates.push({
      id,
      qty,
      gold: round10(ITEMS[id].sellPrice * qty * CRATE_GOLD_MULTIPLIER),
      xp: Math.ceil(ITEMS[id].xpValue * qty * CRATE_XP_MULTIPLIER),
      filled: false,
    });
  }
  return crates;
}

// ---------- Hệ thống theo thời gian ----------

export const balloonDue = (s: GameState, now: number): boolean =>
  s.balloon.phase === 'docked'
    ? now >= s.balloon.leavesAt
    : s.level >= BALLOON_UNLOCK_LEVEL && now >= s.balloon.returnsAt;

/** Tối đa một lần rời đi và một lần đến mỗi lần chạy, nên vắng mặt lâu cũng không lặp. */
export function runBalloon(s: GameState, now: number, events: GameEvent[]): void {
  if (s.balloon.phase === 'docked' && now >= s.balloon.leavesAt) {
    const filled = s.balloon.crates.filter((c) => c.filled).length;
    s.balloon = { phase: 'away', returnsAt: s.balloon.leavesAt + AWAY_INCOMPLETE_MS, trips: s.balloon.trips };
    events.push({ type: 'balloonDeparted', filled });
  }
  if (s.balloon.phase === 'away' && s.level >= BALLOON_UNLOCK_LEVEL && now >= s.balloon.returnsAt) {
    const crates = withRng(s, 'balloon', (rng) => generateCrates(rng, s));
    if (!crates.length) return;
    // Đậu "từ bây giờ" (không tính lùi), để người chơi luôn có đủ thời gian.
    s.balloon = {
      phase: 'docked',
      arrivedAt: now,
      leavesAt: now + DOCK_MS,
      crates,
      trips: s.balloon.trips + 1,
    };
    events.push({ type: 'balloonArrived', crates: crates.length });
  }
}

// ---------- Action ----------

export function fillCrate(state: GameState, index: number, now: number): ActionResult {
  if (state.balloon.phase !== 'docked') return fail('BALLOON_AWAY');
  const crate = isInt(index) ? state.balloon.crates[index] : undefined;
  if (!crate) return fail('INVALID');
  if (crate.filled) return fail('CRATE_FILLED');
  if (count(state.items, crate.id) < crate.qty) return fail('NOT_ENOUGH_ITEMS');
  return commit(state, now, (s, events) => {
    const target = (s.balloon as Extract<GameState['balloon'], { phase: 'docked' }>).crates[index]!;
    target.filled = true;
    addCount(s.items, crate.id, -crate.qty);
    s.gold += crate.gold;
    events.push({ type: 'crateFilled', index, id: crate.id, qty: crate.qty, gold: crate.gold, xp: crate.xp });
    addXp(s, crate.xp, now, events);
  });
}

/** Thưởng xếp đủ mọi thùng (chưa gồm vật liệu hiếm ngẫu nhiên). */
export function balloonBonusPreview(crates: Crate[]): Reward {
  const totalGold = crates.reduce((sum, c) => sum + c.gold, 0);
  return {
    gold: Math.round((totalGold * BALLOON_BONUS.goldPct) / 100),
    ruby: BALLOON_BONUS.ruby,
    items: { dewglass: BALLOON_BONUS.dewglass },
  };
}

/** Cho khinh khí cầu bay đi. Nếu đã xếp đủ thì nhận thưởng lớn và chuyến sau tới sớm hơn. */
export function sendBalloon(state: GameState, now: number): ActionResult {
  if (state.balloon.phase !== 'docked') return fail('BALLOON_AWAY');
  const { crates, trips } = state.balloon;
  const completed = crates.every((c) => c.filled);
  return commit(state, now, (s, events) => {
    let reward: Reward = {};
    if (completed) {
      reward = balloonBonusPreview(crates);
      const extra = withRng(s, 'loot', (rng) => ({
        sunstone: rng.next() * 100 < BALLOON_BONUS.sunstonePct ? 1 : 0,
        stardust: rng.next() * 100 < BALLOON_BONUS.stardustPct ? 1 : 0,
      }));
      if (extra.sunstone) reward.items = { ...reward.items, sunstone: 1 };
      if (extra.stardust) reward.items = { ...reward.items, stardust: 1 };
    }
    s.balloon = {
      phase: 'away',
      returnsAt: now + (completed ? AWAY_COMPLETED_MS : AWAY_INCOMPLETE_MS),
      trips,
    };
    events.push({ type: 'balloonSent', completed, reward });
    if (completed) grantReward(s, reward, now, events);
  });
}
