import { describe, expect, it } from 'vitest';
import {
  DAY_MS,
  ENERGY_MAX,
  ENERGY_REGEN_MS,
  MINE_COLS,
  MINE_ROWS,
  MINE_UNLOCK_LEVEL,
  Rng,
  TILE_HP,
  checkInvariants,
  digTile,
  eatSnack,
  generateMine,
  isReachable,
  mineEnergy,
  openMine,
  refillEnergy,
  tileIndex,
  upgradePickaxe,
  useBomb,
  xpForLevel,
  type GameState,
  type MineTile,
} from '../src/game';
import { T0, errorOf, newGame, ok } from './helpers';

function mineGame(level = MINE_UNLOCK_LEVEL): GameState {
  const s = newGame();
  s.level = level;
  s.xp = xpForLevel(level);
  return ok(openMine(s, T0));
}

/** Ván có mỏ với lưới tự đặt (mọi ô là đất mềm, không đồ rơi trừ khi chỉ định). */
function softMine(): GameState {
  const s = mineGame();
  s.mine!.tiles = s.mine!.tiles.map((): MineTile => ({ kind: 'soil', hp: 1, loot: null }));
  return s;
}

describe('mỏ: tạo lưới', () => {
  it('đủ ô, đúng một rương ở hàng cuối, độ bền theo loại, tất định theo seed', () => {
    const tiles = generateMine(new Rng(7));
    expect(tiles).toHaveLength(MINE_COLS * MINE_ROWS);
    const chests = tiles.flatMap((t, i) => (t.kind === 'chest' ? [i] : []));
    expect(chests).toHaveLength(1);
    expect(Math.floor(chests[0]! / MINE_COLS)).toBe(MINE_ROWS - 1);
    for (const t of tiles) expect(t.hp).toBe(TILE_HP[t.kind]);
    expect(generateMine(new Rng(7))).toEqual(tiles);
    // Hàng nông không có đá vỏ chai.
    expect(tiles.slice(0, 3 * MINE_COLS).every((t) => t.kind === 'soil' || t.kind === 'stone')).toBe(true);
  });

  it('dùng RNG một số lần cố định bất kể kết quả', () => {
    const a = new Rng(1);
    const b = new Rng(99);
    generateMine(a);
    generateMine(b);
    const steps = (start: number, end: number) => {
      const r = new Rng(start);
      let n = 0;
      while (r.seed !== end && n < 10_000) {
        r.next();
        n++;
      }
      return n;
    };
    expect(steps(1, a.seed)).toBe(steps(99, b.seed));
  });
});

describe('mỏ: vào mỏ và làm mới theo ngày', () => {
  it('chưa đủ cấp thì không vào được', () => {
    const s = newGame();
    expect(errorOf(openMine(s, T0))).toBe('LEVEL_TOO_LOW');
  });

  it('lần đầu tạo mỏ, đầy năng lượng; vào lại trong ngày không đổi gì', () => {
    const s = mineGame();
    expect(s.mine!.energy).toBe(ENERGY_MAX);
    const again = openMine(s, T0 + 1000);
    expect(again.ok && again.state).toBe(s);
  });

  it('sang ngày mới: lưới mới, năng lượng nạp lại, giữ bậc cuốc', () => {
    let s = mineGame();
    s.mine!.pickaxe = 1;
    s.mine!.energy = 3;
    s.mine!.energyAt = T0;
    expect(errorOf(digTile(s, 0, 0, T0 + DAY_MS))).toBe('MINE_EXPIRED');
    const r = openMine(s, T0 + DAY_MS);
    expect(r.ok && r.events).toContainEqual(expect.objectContaining({ type: 'mineOpened', fresh: true }));
    s = ok(r);
    expect(s.mine!.pickaxe).toBe(1);
    expect(s.mine!.energy).toBe(ENERGY_MAX);
    expect(s.mine!.tiles.every((t) => t.hp > 0)).toBe(true);
  });
});

describe('mỏ: đào', () => {
  it('chỉ đào được hàng mặt đất hoặc ô kề ô đã vỡ', () => {
    const s = softMine();
    expect(isReachable(s.mine!.tiles, 2, 0)).toBe(true);
    expect(isReachable(s.mine!.tiles, 2, 1)).toBe(false);
    expect(errorOf(digTile(s, 2, 1, T0))).toBe('TILE_UNREACHABLE');
    const after = ok(digTile(s, 2, 0, T0));
    expect(isReachable(after.mine!.tiles, 2, 1)).toBe(true);
    expect(errorOf(digTile(after, 2, 0, T0))).toBe('TILE_BROKEN');
    expect(errorOf(digTile(after, 6, 0, T0))).toBe('INVALID');
  });

  it('mỗi nhát tốn 1 năng lượng, đá cứng cần nhiều nhát, vỡ thì nhận đồ và XP', () => {
    let s = softMine();
    s.mine!.tiles[tileIndex(0, 0)] = { kind: 'stone', hp: 2, loot: { gold: 40 } };
    const gold = s.gold;
    s = ok(digTile(s, 0, 0, T0));
    expect(s.mine!.tiles[0]!.hp).toBe(1);
    expect(s.mine!.energy).toBe(ENERGY_MAX - 1);
    const r = digTile(s, 0, 0, T0);
    expect(r.ok && r.events).toContainEqual({
      type: 'mineBroken',
      x: 0,
      y: 0,
      kind: 'stone',
      loot: { gold: 40 },
      xp: 2,
    });
    s = ok(r);
    expect(s.gold).toBe(gold + 40);
    expect(s.xp).toBe(xpForLevel(MINE_UNLOCK_LEVEL) + 2);
    expect(s.stats.tilesBroken).toBe(1);
    expect(checkInvariants(s)).toEqual([]);
  });

  it('cuốc tốt hơn đào mạnh hơn', () => {
    const s = softMine();
    s.mine!.pickaxe = 2;
    s.mine!.tiles[0] = { kind: 'granite', hp: 3, loot: null };
    expect(ok(digTile(s, 0, 0, T0)).mine!.tiles[0]!.hp).toBe(0);
  });

  it('hết năng lượng thì dừng; hồi 1 điểm mỗi 5 phút, giữ phần hồi dở', () => {
    let s = softMine();
    s.mine!.energy = 1;
    s.mine!.energyAt = T0;
    s = ok(digTile(s, 0, 0, T0));
    expect(errorOf(digTile(s, 1, 0, T0 + 1000))).toBe('NO_ENERGY');
    expect(mineEnergy(s.mine!, T0 + ENERGY_REGEN_MS - 1).energy).toBe(0);
    expect(mineEnergy(s.mine!, T0 + ENERGY_REGEN_MS).energy).toBe(1);
    // Đào ở phút thứ 7: còn 3 phút nữa là có điểm kế tiếp.
    s = ok(digTile(s, 1, 0, T0 + 7 * 60_000));
    expect(mineEnergy(s.mine!, T0 + 7 * 60_000).nextAt).toBe(T0 + 2 * ENERGY_REGEN_MS);
    expect(mineEnergy(s.mine!, T0 + 10 * 60_000).energy).toBe(1);
  });

  it('phá rương đáy mỏ được tính là một lần dọn mỏ', () => {
    const s = softMine();
    for (let y = 0; y < MINE_ROWS; y++) s.mine!.tiles[tileIndex(0, y)]!.hp = y === MINE_ROWS - 1 ? 1 : 0;
    s.mine!.tiles[tileIndex(0, MINE_ROWS - 1)] = { kind: 'chest', hp: 1, loot: { gold: 300, ruby: 2 } };
    const r = digTile(s, 0, MINE_ROWS - 1, T0);
    expect(r.ok && r.events.some((e) => e.type === 'mineChest')).toBe(true);
    expect(ok(r).stats.mineClears).toBe(1);
  });
});

describe('mỏ: bom, nạp năng lượng, ăn nhẹ, nâng cuốc', () => {
  it('bom phá vùng 3×3, không tốn năng lượng, cần có bom', () => {
    let s = softMine();
    expect(errorOf(useBomb(s, 1, 0, T0))).toBe('NO_BOMB');
    s.items.cloudBomb = 1;
    s = ok(useBomb(s, 1, 0, T0));
    const broken = s.mine!.tiles.flatMap((t, i) => (t.hp === 0 ? [i] : []));
    expect(broken).toEqual([0, 1, 2, 6, 7, 8]);
    expect(s.mine!.energy).toBe(ENERGY_MAX);
    expect(s.items.cloudBomb).toBeUndefined();
  });

  it('giá nạp năng lượng tăng dần trong ngày', () => {
    let s = mineGame();
    s.ruby = 100;
    const costs: number[] = [];
    for (let i = 0; i < 4; i++) {
      const before = s.ruby;
      s = ok(refillEnergy(s, T0));
      costs.push(before - s.ruby);
    }
    expect(costs).toEqual([5, 10, 20, 20]);
    expect(s.mine!.energy).toBe(ENERGY_MAX + 4 * 30);
    expect(s.stats.rubySpent).toBe(55);
  });

  it('ăn hàng chế biến hồi năng lượng, hàng không ăn được thì từ chối', () => {
    let s = mineGame();
    s.mine!.energy = 10;
    s.mine!.energyAt = T0;
    s.items = { strawberry_jam: 1, rose_water: 1 };
    expect(errorOf(eatSnack(s, 'rose_water', T0))).toBe('NOT_A_SNACK');
    s = ok(eatSnack(s, 'strawberry_jam', T0));
    expect(s.mine!.energy).toBe(14);
    expect(errorOf(eatSnack(s, 'strawberry_jam', T0))).toBe('NOT_ENOUGH_ITEMS');
  });

  it('nâng cuốc cần cấp, vàng và vật liệu', () => {
    let s = mineGame();
    expect(errorOf(upgradePickaxe(s, T0))).toBe('LEVEL_TOO_LOW');
    s.level = 12;
    s.gold = 2500;
    expect(errorOf(upgradePickaxe(s, T0))).toBe('NOT_ENOUGH_ITEMS');
    s.items.dewglass = 15;
    s = ok(upgradePickaxe(s, T0));
    expect(s.mine!.pickaxe).toBe(1);
    expect(s.gold).toBe(0);
    s.level = 50;
    s.gold = 1e6;
    s.items = { dewglass: 50, sunstone: 50 };
    s = ok(upgradePickaxe(s, T0));
    expect(errorOf(upgradePickaxe(s, T0))).toBe('MAX_TIER');
  });
});

describe('mỏ: cân bằng', () => {
  it('dọn sạch một lưới cho lượng vàng và vật liệu hợp lý', () => {
    let gold = 0;
    let materials = 0;
    let hits = 0;
    const runs = 200;
    for (let seed = 1; seed <= runs; seed++) {
      for (const t of generateMine(new Rng(seed))) {
        gold += t.loot?.gold ?? 0;
        materials += Object.values(t.loot?.items ?? {}).reduce((a, b) => a + (b ?? 0), 0);
        hits += t.hp;
      }
    }
    // Trung bình mỗi lưới: ~150 nhát cuốc gỗ, vàng cỡ một ngày làm vườn tầm trung, vật liệu đủ dùng cho lò.
    expect(hits / runs).toBeGreaterThan(110);
    expect(hits / runs).toBeLessThan(180);
    expect(gold / runs).toBeGreaterThan(800);
    expect(gold / runs).toBeLessThan(2500);
    expect(materials / runs).toBeGreaterThan(15);
    expect(materials / runs).toBeLessThan(45);
  });
});
