/**
 * Nâng cấp save cũ. MIGRATIONS[n] đưa save từ version n lên n + 1.
 *
 * Quy tắc:
 * - Mỗi migration tự chứa: chỉ dùng hằng số viết sẵn (literal), KHÔNG import config đang dùng,
 *   vì cân bằng lại game sau này không được làm thay đổi kết quả nâng cấp save cũ.
 * - Chỉ phụ thuộc các trường gameplay, không đọc `lastSeenAt` (trường này khác nhau giữa client và server).
 * - Trước khi tăng SAVE_VERSION: đóng băng fixture của version hiện tại (xem tests/freeze-fixtures.test.ts).
 */
export type RawSave = Record<string, unknown>;
type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

// ---------- v1 → v2: kho đồ hợp nhất, chậu thành từng chiếc, RNG nhiều luồng, bảng XP mới ----------

const V1_POT_STATS: Record<string, Record<string, number>> = {
  clay: {},
  ceramic: { xpPct: 20 },
  porcelain: { timePct: 15 },
};
const V2_RNG_STREAMS = ['orders', 'crops', 'loot', 'forge', 'daily', 'balloon', 'mine', 'pet', 'npc'];
/** Ngưỡng XP của bảng v1: 5·L·(L−1). */
const V1_XP = (level: number): number => 5 * (level - 1) * level;
/** Bảng XP v2 (đóng băng, giống config/levels.ts lúc tạo migration). */
const V2_XP = [
  0, 20, 60, 150, 310, 580, 990, 1580, 2400, 3490, 4920, 6760, 9080, 11960, 15510, 19820, 25020, 31250, 38650,
  47390, 57650, 69640, 83590, 99760, 118420, 139880, 164480, 192600, 224660, 261110, 302460, 349270, 402140,
  461740, 528800, 604120, 688590, 783170, 888920, 1006990, 1138650, 1285270, 1448360, 1629570, 1830690,
  2053680, 2300670, 2573980, 2876150, 3209940,
];

/** Bản sao đóng băng của rng.deriveSeed lúc v2. */
function deriveSeedV2(master: number, name: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  let t = (((master ^ h) >>> 0) + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return (t ^ (t >>> 14)) >>> 0;
}

/** Sức chứa kho v2 theo số lần nâng cấp: +25 cho 6 lần đầu, +50 cho 8 lần sau, rồi +100. */
const V2_CAPACITY = (upgrades: number): number => {
  let cap = 50;
  for (let i = 0; i < upgrades; i++) cap += i < 6 ? 25 : i < 14 ? 50 : 100;
  return cap;
};

function v1to2(raw: Raw): Raw {
  let uid = 1;
  const instance = (potId: string) => ({
    uid: uid++,
    potId,
    rarity: 'common',
    stats: { ...(V1_POT_STATS[potId] ?? {}) },
    origin: 'legacy',
  });
  const floors = (raw.floors as Raw[]).map((f) => ({
    slots: (f.slots as (Raw | null)[]).map((p) =>
      p
        ? {
            kind: 'pot',
            ...instance(p.potId),
            plant: p.plant ? { ...p.plant, yield: 2, pest: null } : null,
          }
        : null,
    ),
  }));
  const potBag: Raw[] = [];
  for (const [potId, n] of Object.entries((raw.potStock ?? {}) as Record<string, number>)) {
    for (let i = 0; i < n; i++) potBag.push(instance(potId));
  }
  const orders = (raw.orders as Raw[]).map((o) => ({
    ...o,
    order: o.order
      ? { ...o.order, items: (o.order.items as Raw[]).map(({ plantId, qty }) => ({ id: plantId, qty })) }
      : null,
  }));
  const seed = (raw.rngSeed as number) >>> 0;
  const rng = Object.fromEntries(
    V2_RNG_STREAMS.map((n) => [n, n === 'orders' ? seed : deriveSeedV2(seed, n)]),
  );
  // Giữ nguyên cấp và tỉ lệ tiến độ trong cấp khi đổi sang bảng XP mới.
  const level = Math.min(49, Math.max(1, raw.level as number));
  const frac = Math.min(
    1,
    Math.max(0, ((raw.xp as number) - V1_XP(level)) / (V1_XP(level + 1) - V1_XP(level))),
  );
  const xp = V2_XP[level - 1]! + Math.floor(frac * (V2_XP[level]! - V2_XP[level - 1]!));
  // v1 không giới hạn số lần nâng kho; bảng v2 có 20 mức và mức cao chứa nhiều hơn.
  const storageUpgrades = Math.min(20, raw.storageUpgrades as number);
  const { potStock: _p, rngSeed: _r, crops, ...rest } = raw;
  return {
    ...rest,
    xp,
    level,
    storageUpgrades,
    storageCapacity: V2_CAPACITY(storageUpgrades),
    floors,
    items: { ...(crops as Raw) },
    potBag,
    nextUid: uid,
    orders,
    rng,
    stats: {},
  };
}

// ---------- v2 → v3: quà đăng nhập và nhiệm vụ ngày ----------

function v2to3(raw: Raw): Raw {
  return {
    ...raw,
    daily: { day: -1, quests: [], bonusClaimed: false, freeRerollUsed: false, loginDay: -1, loginCount: 0 },
  };
}

// ---------- v3 → v4: khinh khí cầu ----------

function v3to4(raw: Raw): Raw {
  // Chuyến đầu tới ở lần tick kế tiếp (nếu đủ cấp); không dựa vào lastSeenAt.
  return { ...raw, balloon: { phase: 'away', returnsAt: 0, trips: 0 } };
}

// ---------- v4 → v5: thành tựu ----------

function v4to5(raw: Raw): Raw {
  // Thống kê trọn đời đã có từ v2; thành tựu đạt rồi sẽ hiện là "chờ nhận".
  return { ...raw, achievements: {} };
}

// ---------- v5 → v6: hướng dẫn chơi ----------

function v5to6(raw: Raw): Raw {
  // Người đã chơi (có XP hoặc lên cấp) không phải đi lại từ đầu.
  const played = (raw.xp as number) > 0 || (raw.level as number) > 1;
  return { ...raw, tutorial: { step: played ? 'done' : 'welcome', progress: 0 } };
}

export const MIGRATIONS: Record<number, (raw: RawSave) => RawSave> = {
  1: v1to2,
  2: v2to3,
  3: v3to4,
  4: v4to5,
  5: v5to6,
};

/** Nâng `raw` lên `target`. Trả về null nếu thiếu migration. */
export function migrate(raw: RawSave, from: number, target: number): RawSave | null {
  let data = raw;
  for (let v = from; v < target; v++) {
    const step = MIGRATIONS[v];
    if (!step) return null;
    data = { ...step(structuredClone(data)), version: v + 1 };
  }
  return data;
}
