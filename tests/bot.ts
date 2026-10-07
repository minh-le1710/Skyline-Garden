import {
  ITEMS,
  MACHINE_LIST,
  PLANTS,
  SHOP_POTS,
  asPot,
  canFulfill,
  count,
  createNewGame,
  hasItems,
  nextFloorUnlock,
  nextStorageUpgrade,
  ownsMachine,
  queueCapacity,
  recipeDef,
  recipesFor,
  step,
  storageUsed,
  unlockedPlants,
  type BarnItemId,
  type Command,
  type GameState,
  type PlantId,
} from '../src/game';

const HOUR = 3_600_000;
/** Thời gian chơi chủ động mỗi lượt. */
const ACTIVE_MS = 5 * 60_000;
/** Giờ trong ngày người chơi mở game (5 lượt). */
export const SESSION_HOURS = [8, 11, 14, 18, 21];

export interface BotDay {
  day: number;
  level: number;
  gold: number;
  floors: number;
  machines: number;
}

/**
 * Bot chơi tham lam, tất định: dùng để kiểm tra nhịp lên cấp và kinh tế không vỡ.
 * Mọi thao tác đi qua `step` như người chơi thật.
 */
export class Bot {
  state: GameState;
  now: number;
  private failures = 0;

  constructor(seed: number, start: number) {
    this.now = start;
    this.state = createNewGame(start, seed);
  }

  private run(cmd: Command): boolean {
    const r = step(this.state, cmd, this.now);
    if (r.ok) this.state = r.state;
    else this.failures++;
    return r.ok;
  }

  /** Món đang cần cho đơn hàng và khinh khí cầu (không bán). */
  private needed(): Map<BarnItemId, number> {
    const need = new Map<BarnItemId, number>();
    const add = (id: BarnItemId, qty: number) => need.set(id, (need.get(id) ?? 0) + qty);
    for (const o of this.state.orders) for (const it of o.order?.items ?? []) add(it.id, it.qty);
    const b = this.state.balloon;
    if (b.phase === 'docked') for (const c of b.crates) if (!c.filled) add(c.id, c.qty);
    return need;
  }

  private slots(): { floor: number; slot: number }[] {
    return this.state.floors.flatMap((f, floor) => f.slots.map((_, slot) => ({ floor, slot })));
  }

  /** Một lượt chơi; `gapMs` là thời gian tới lượt sau (để chọn cây vừa kịp chín). */
  session(gapMs: number): void {
    this.run({ type: 'tick' });
    this.run({ type: 'claimLogin' });
    this.state.daily.quests.forEach((q, i) => {
      if (!q.claimed && q.progress >= q.goal) this.run({ type: 'claimQuest', index: i });
    });
    this.run({ type: 'claimQuestBonus' });

    for (let pass = 0; pass < 2; pass++) {
      for (const { floor, slot } of this.slots()) this.run({ type: 'sweep', floor, slot });
      this.deliver();
      this.sellSurplus();
    }
    this.invest();
    this.runMachines();
    // Chơi chủ động khoảng 5 phút: trồng cây ngắn ngày, chờ chín rồi thu hoạch, lặp lại.
    const start = this.now;
    const end = start + ACTIVE_MS;
    for (let round = 0; round < 20; round++) {
      const quick = this.bestPlant(end - this.now);
      if (PLANTS[quick].growSec * 1000 > end - this.now) break;
      this.plantAll(end - this.now);
      this.now += PLANTS[quick].growSec * 1000;
      this.run({ type: 'tick' });
      for (const { floor, slot } of this.slots()) this.run({ type: 'sweep', floor, slot });
      this.deliver();
      this.sellSurplus();
    }
    this.invest();
    // Người chơi không mở game đúng giờ tuyệt đối: chấp nhận cây chín trễ tối đa 15 phút.
    this.plantAll(gapMs - (this.now - start) + 15 * 60_000);
    this.runMachines();
  }

  private deliver(): void {
    this.state.orders.forEach((o, index) => {
      if (o.order && canFulfill(this.state, o.order)) this.run({ type: 'deliverOrder', index });
    });
    const b = this.state.balloon;
    if (b.phase === 'docked') {
      b.crates.forEach((c, index) => {
        if (!c.filled && count(this.state.items, c.id) >= c.qty) this.run({ type: 'fillCrate', index });
      });
      const after = this.state.balloon;
      if (after.phase === 'docked' && after.crates.every((c) => c.filled)) this.run({ type: 'sendBalloon' });
    }
    // Đơn dùng món chưa làm được thì bỏ để có đơn mới.
    this.state.orders.forEach((o, index) => {
      if (!o.order) return;
      const impossible = o.order.items.some(
        (it) => ITEMS[it.id].kind === 'good' && !ownsMachine(this.state, recipeDef(it.id as never)!.machine),
      );
      if (impossible) this.run({ type: 'discardOrder', index });
    });
  }

  private sellSurplus(): void {
    const need = this.needed();
    const limit = Math.floor(this.state.storageCapacity * 0.6);
    if (storageUsed(this.state) <= limit) return;
    const items = Object.entries(this.state.items) as [BarnItemId, number][];
    for (const [id, n] of items.sort((a, b) => ITEMS[a[0]].sellPrice - ITEMS[b[0]].sellPrice)) {
      if (ITEMS[id].kind !== 'crop' && ITEMS[id].kind !== 'good') continue;
      const extra = n - (need.get(id) ?? 0);
      if (extra > 0) this.run({ type: 'sellItem', id, qty: extra });
      if (storageUsed(this.state) <= limit) break;
    }
  }

  private invest(): void {
    const s = () => this.state;
    // Mở tầng khi đủ tiền, giữ lại vốn mua hạt.
    const floor = nextFloorUnlock(s());
    if (floor && s().level >= floor.level && s().gold >= floor.gold + 300) this.run({ type: 'unlockFloor' });
    // Lấp ô trống bằng chậu đất (chừa một ô mỗi tầng từ tầng 3 cho máy).
    const empties = this.slots().filter(({ floor, slot }) => s().floors[floor]!.slots[slot] === null);
    const machineSlots = new Set(
      empties.filter((e) => e.floor >= 2 && e.slot === 5).map((e) => `${e.floor}:${e.slot}`),
    );
    for (const e of empties) {
      if (machineSlots.has(`${e.floor}:${e.slot}`)) continue;
      if (s().gold < SHOP_POTS.clay!.price + 200) break;
      if (this.run({ type: 'buyPot', potId: 'clay', qty: 1 })) {
        this.run({ type: 'placePot', floor: e.floor, slot: e.slot, uid: s().potBag.at(-1)!.uid });
      }
    }
    // Mua máy khi mở khóa, đặt vào ô dành sẵn hoặc ô trống bất kỳ.
    for (const m of MACHINE_LIST) {
      if (s().level < m.unlockLevel || ownsMachine(s(), m.id) || s().gold < m.price + 500) continue;
      const free = this.slots().find(({ floor, slot }) => s().floors[floor]!.slots[slot] === null);
      if (free) this.run({ type: 'buildMachine', machineId: m.id, floor: free.floor, slot: free.slot });
    }
    // Nâng kho khi gần đầy.
    const up = nextStorageUpgrade(s());
    if (
      up &&
      storageUsed(s()) > s().storageCapacity * 0.7 &&
      s().gold >= up.gold + 300 &&
      hasItems(s(), up.materials)
    ) {
      this.run({ type: 'upgradeStorage' });
    }
  }

  /** Cây cho XP nhiều nhất mỗi giờ trong số cây chín kịp trước lượt sau. */
  private bestPlant(gapMs: number): PlantId {
    const options = unlockedPlants(this.state.level).filter((id) => PLANTS[id].growSec * 1000 <= gapMs);
    const pool = options.length ? options : (['rose'] as PlantId[]);
    return pool.reduce((best, id) => (PLANTS[id].xp > PLANTS[best].xp ? id : best));
  }

  private plantAll(gapMs: number): void {
    const plantId = this.bestPlant(gapMs);
    const emptyPots = this.slots().filter(({ floor, slot }) => {
      const pot = asPot(this.state.floors[floor]!.slots[slot]);
      return pot && !pot.plant;
    });
    const need = emptyPots.length - count(this.state.seeds, plantId);
    if (need > 0) {
      const affordable = Math.min(need, Math.floor(this.state.gold / PLANTS[plantId].seedPrice));
      if (affordable > 0) this.run({ type: 'buySeed', plantId, qty: affordable });
    }
    for (const { floor, slot } of emptyPots) {
      if (!this.run({ type: 'plant', floor, slot, plantId })) {
        // Hết hạt loại tốt nhất: trồng hoa hồng nếu còn tiền.
        if (this.state.gold >= PLANTS.rose.seedPrice) this.run({ type: 'buySeed', plantId: 'rose', qty: 1 });
        this.run({ type: 'plant', floor, slot, plantId: 'rose' });
      }
    }
  }

  private runMachines(): void {
    for (const { floor, slot } of this.slots()) {
      const m = this.state.floors[floor]!.slots[slot];
      if (m?.kind !== 'machine') continue;
      const recipes = recipesFor(m.machineId)
        .map((r) => recipeDef(r)!)
        .filter((r) => r.unlockLevel <= this.state.level && r.output === 'good');
      for (let guard = 0; guard < 6; guard++) {
        const current = this.state.floors[floor]!.slots[slot];
        if (current?.kind !== 'machine' || current.queue.length >= queueCapacity(current)) break;
        const recipe = recipes.find((r) => hasItems(this.state, r.inputs));
        if (!recipe || !this.run({ type: 'startJob', floor, slot, recipe: recipe.id })) break;
      }
    }
  }

  /** Chơi `days` ngày, mỗi ngày 5 lượt. */
  play(days: number, onDay?: (d: BotDay) => void): void {
    const dayStart = this.now;
    for (let day = 1; day <= days; day++) {
      for (let i = 0; i < SESSION_HOURS.length; i++) {
        const hour = SESSION_HOURS[i]!;
        const nextHour = i + 1 < SESSION_HOURS.length ? SESSION_HOURS[i + 1]! : 24 + SESSION_HOURS[0]!;
        this.now = dayStart + (day - 1) * 24 * HOUR + hour * HOUR;
        this.session((nextHour - hour) * HOUR);
      }
      onDay?.({
        day,
        level: this.state.level,
        gold: this.state.gold,
        floors: this.state.floors.length,
        machines: MACHINE_LIST.filter((m) => ownsMachine(this.state, m.id)).length,
      });
    }
  }
}
