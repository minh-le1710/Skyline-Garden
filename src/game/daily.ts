import { dayIndex } from './calendar';
import { commit, fail } from './commit';
import {
  LOGIN_GIFTS,
  QUEST_MATERIAL_CHANCE_PCT,
  QUEST_UNLOCK_LEVEL,
  REROLL_RUBY,
  dailyGold,
  questsPerDay,
} from './config/daily';
import { GOODS } from './config/goods';
import { xpToNext } from './config/levels';
import { PEST_UNLOCK_LEVEL } from './config/pests';
import { PLANTS } from './config/plants';
import { isInt } from './ids';
import { allMachines, producibleGoods } from './machines';
import { unlockedPlants } from './progression';
import { grantReward } from './rewards';
import { withRng, type Rng } from './rng';
import type { ActionResult, BarnItemId, GameEvent, GameState, Quest, QuestKind, Reward } from './types';

const round = (x: number, step: number): number => Math.max(step, Math.round(x / step) * step);

interface QuestTemplate {
  kind: QuestKind;
  difficulty: number;
  requires(s: GameState): boolean;
  make(rng: Rng, s: GameState): { target: BarnItemId | null; goal: number };
}

/** Điều kiện mở nhiệm vụ giao thùng khinh khí cầu (được bật khi có khinh khí cầu). */
export const balloonQuestsEnabled = { value: false };

const TEMPLATES: QuestTemplate[] = [
  {
    kind: 'harvestAny',
    difficulty: 1,
    requires: () => true,
    make: (_rng, s) => ({ target: null, goal: round(15 + 1.5 * s.level, 5) }),
  },
  {
    kind: 'harvestPlant',
    difficulty: 1.2,
    requires: (s) => unlockedPlants(s.level).some((id) => PLANTS[id].growSec <= 7200),
    make: (rng, s) => {
      const id = rng.pick(unlockedPlants(s.level).filter((p) => PLANTS[p].growSec <= 7200));
      const grow = PLANTS[id].growSec;
      return { target: id, goal: grow <= 300 ? 20 : grow <= 1800 ? 10 : 6 };
    },
  },
  {
    kind: 'deliverOrders',
    difficulty: 1.2,
    requires: () => true,
    make: (rng) => ({ target: null, goal: rng.int(3, 5) }),
  },
  {
    kind: 'catchPests',
    difficulty: 1.3,
    requires: (s) => s.level >= PEST_UNLOCK_LEVEL,
    make: (rng) => ({ target: null, goal: rng.int(3, 6) }),
  },
  {
    kind: 'collectGoods',
    difficulty: 1.2,
    requires: (s) => producibleGoods(s).length > 0,
    make: (_rng, s) => ({ target: null, goal: 4 + Math.floor(s.level / 5) }),
  },
  {
    kind: 'makeGood',
    difficulty: 1.4,
    requires: (s) => producibleGoods(s).some((g) => GOODS[g].minutes <= 60),
    make: (rng, s) => ({
      target: rng.pick(producibleGoods(s).filter((g) => GOODS[g].minutes <= 60)),
      goal: rng.int(2, 4),
    }),
  },
  {
    kind: 'sellGold',
    difficulty: 0.8,
    requires: () => true,
    make: (_rng, s) => ({ target: null, goal: round(3 * dailyGold(s.level), 100) }),
  },
  {
    kind: 'fillCrates',
    difficulty: 1.5,
    requires: (s) => balloonQuestsEnabled.value && s.level >= 10,
    make: (rng) => ({ target: null, goal: rng.int(3, 5) }),
  },
  {
    kind: 'forgePot',
    difficulty: 1.5,
    requires: (s) => [...allMachines(s)].some((m) => m.machine.machineId === 'kiln'),
    make: () => ({ target: null, goal: 1 }),
  },
];

function makeQuest(rng: Rng, s: GameState, template: QuestTemplate): Quest {
  const { target, goal } = template.make(rng, s);
  const g = dailyGold(s.level);
  const reward: Reward = {
    gold: round(2 * g * template.difficulty, 10),
    xp: round(xpToNext(s.level) * 0.05 * template.difficulty, 10),
  };
  if (rng.next() * 100 < QUEST_MATERIAL_CHANCE_PCT) reward.items = { cloudclay: 2 };
  return { kind: template.kind, target, goal, progress: 0, claimed: false, reward };
}

/** Chọn `count` nhiệm vụ khác loại nhau trong các mẫu đủ điều kiện. */
function pickQuests(rng: Rng, s: GameState, count: number, exclude: QuestKind[] = []): Quest[] {
  const pool = TEMPLATES.filter((t) => t.requires(s) && !exclude.includes(t.kind));
  const out: Quest[] = [];
  for (let i = 0; i < count && pool.length; i++) {
    const template = rng.pick(pool);
    pool.splice(pool.indexOf(template), 1);
    out.push(makeQuest(rng, s, template));
  }
  return out;
}

// ---------- Hệ thống theo thời gian ----------

const questsMissing = (s: GameState): boolean => s.level >= QUEST_UNLOCK_LEVEL && s.daily.quests.length === 0;

/** Sang ngày mới (hoặc vừa đủ cấp mở nhiệm vụ): làm mới bộ nhiệm vụ. */
export const dailyDue = (s: GameState, now: number): boolean =>
  dayIndex(now) !== s.daily.day || questsMissing(s);

export function runDaily(s: GameState, now: number, events: GameEvent[]): void {
  const today = dayIndex(now);
  if (today !== s.daily.day) {
    s.daily.day = today;
    s.daily.bonusClaimed = false;
    s.daily.freeRerollUsed = false;
    s.daily.quests = [];
    events.push({ type: 'dailyReset', day: today });
  }
  if (questsMissing(s)) {
    s.daily.quests = withRng(s, 'daily', (rng) => pickQuests(rng, s, questsPerDay(s.level)));
  }
}

// ---------- Tiến độ nhiệm vụ (chạy trong applyMeta) ----------

function increment(q: Quest, e: GameEvent): number {
  switch (q.kind) {
    case 'harvestAny':
      return e.type === 'harvested' ? e.qty : 0;
    case 'harvestPlant':
      return e.type === 'harvested' && e.plantId === q.target ? e.qty : 0;
    case 'deliverOrders':
      return e.type === 'orderDelivered' ? 1 : 0;
    case 'catchPests':
      return e.type === 'pestCaught' ? 1 : 0;
    case 'collectGoods':
      return e.type === 'goodsCollected'
        ? Object.values(e.items).reduce<number>((a, b) => a + (b ?? 0), 0)
        : 0;
    case 'makeGood':
      return e.type === 'goodsCollected' && q.target ? (e.items[q.target as keyof typeof e.items] ?? 0) : 0;
    case 'sellGold':
      return e.type === 'sold' ? e.gold : 0;
    case 'fillCrates':
      return e.type === 'crateFilled' ? 1 : 0;
    case 'forgePot':
      return e.type === 'potForged' ? 1 : 0;
  }
}

/** Cộng tiến độ nhiệm vụ theo sự kiện; trả về các sự kiện "hoàn thành" mới. */
export function progressQuests(s: GameState, events: readonly GameEvent[]): GameEvent[] {
  const done: GameEvent[] = [];
  s.daily.quests.forEach((q, index) => {
    if (q.progress >= q.goal) return;
    let inc = 0;
    for (const e of events) inc += increment(q, e);
    if (inc <= 0) return;
    q.progress = Math.min(q.goal, q.progress + inc);
    if (q.progress >= q.goal) done.push({ type: 'questCompleted', index, kind: q.kind });
  });
  return done;
}

// ---------- Action ----------

export const loginClaimable = (s: GameState, now: number): boolean => s.daily.loginDay < dayIndex(now);

export function loginReward(s: GameState): Reward {
  const gift = LOGIN_GIFTS[s.daily.loginCount % LOGIN_GIFTS.length]!;
  const reward: Reward = {};
  if (gift.goldUnits) reward.gold = gift.goldUnits * dailyGold(s.level);
  if (gift.ruby) reward.ruby = gift.ruby;
  if (Object.keys(gift.items).length) reward.items = { ...gift.items };
  return reward;
}

export function claimLogin(state: GameState, now: number): ActionResult {
  if (!loginClaimable(state, now)) return fail('ALREADY_CLAIMED');
  const reward = loginReward(state);
  const position = state.daily.loginCount % LOGIN_GIFTS.length;
  return commit(state, now, (s, events) => {
    s.daily.loginDay = dayIndex(now);
    s.daily.loginCount++;
    events.push({ type: 'loginClaimed', position, reward });
    grantReward(s, reward, now, events);
  });
}

export function claimQuest(state: GameState, index: number, now: number): ActionResult {
  const q = isInt(index) ? state.daily.quests[index] : undefined;
  if (!q) return fail('INVALID');
  if (q.claimed) return fail('ALREADY_CLAIMED');
  if (q.progress < q.goal) return fail('QUEST_NOT_DONE');
  return commit(state, now, (s, events) => {
    s.daily.quests[index]!.claimed = true;
    events.push({ type: 'questClaimed', index, reward: q.reward });
    grantReward(s, q.reward, now, events);
  });
}

export const questBonusReward = (s: GameState): Reward => ({
  ruby: 1,
  items: { dewglass: 1 },
  xp: round(xpToNext(s.level) * 0.05, 10),
});

export function claimQuestBonus(state: GameState, now: number): ActionResult {
  const quests = state.daily.quests;
  if (quests.length === 0 || !quests.every((q) => q.claimed)) return fail('QUEST_NOT_DONE');
  if (state.daily.bonusClaimed) return fail('ALREADY_CLAIMED');
  const reward = questBonusReward(state);
  return commit(state, now, (s, events) => {
    s.daily.bonusClaimed = true;
    events.push({ type: 'questBonusClaimed', reward });
    grantReward(s, reward, now, events);
  });
}

/** Đổi một nhiệm vụ chưa xong: miễn phí một lần mỗi ngày, sau đó tốn ruby. */
export function rerollQuest(state: GameState, index: number, now: number): ActionResult {
  const q = isInt(index) ? state.daily.quests[index] : undefined;
  if (!q) return fail('INVALID');
  if (q.claimed || q.progress >= q.goal) return fail('ALREADY_CLAIMED');
  const cost = state.daily.freeRerollUsed ? REROLL_RUBY : 0;
  if (state.ruby < cost) return fail('NOT_ENOUGH_RUBY');
  return commit(state, now, (s, events) => {
    const exclude = s.daily.quests.map((x) => x.kind);
    const [next] = withRng(s, 'daily', (rng) => pickQuests(rng, s, 1, exclude));
    if (next) s.daily.quests[index] = next;
    s.daily.freeRerollUsed = true;
    s.ruby -= cost;
    events.push({ type: 'questRerolled', index, ruby: cost });
  });
}
