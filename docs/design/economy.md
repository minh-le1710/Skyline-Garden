# Skyline Garden: Milestone 2 design (economy and production depth)

## 0. Key decisions

| Topic             | Decision                                                                                                                                                                                                                                                                                 | Why                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Where machines go | **A machine takes one existing pot slot** (1×1 footprint). Floors stay at 6 slots, with no separate machine row.                                                                                                                                                                         | `SceneManager.resize()` sizes the camera to `GARDEN_WIDTH = 6*1.75+0.9`. A 7th slot would shrink every pot by about 15% on a phone and push the edge slot under the screen edge. A separate workshop deck would add a second scroll target. Using slots keeps `Picker`, `slotHitBox`, the selection ring, drag tools and `SlotView` as they are. Giving up a pot slot for a machine is also a real choice for the player. |
| Slot shape        | `Floor.slots: (SlotContent \| null)[]`, where `SlotContent = Pot \| Machine`, told apart by a `kind` field.                                                                                                                                                                              | The type system catches every caller that assumes a slot is a pot.                                                                                                                                                                                                                                                                                                                                                        |
| Pots              | Each pot becomes an **instance** (`uid`, `potId` shape, `rarity`, `stats`, `origin`). `potStock` counts are replaced by a `potBag: PotInstance[]` list (max 40).                                                                                                                         | Needed for random stat rolls, forging and later trading.                                                                                                                                                                                                                                                                                                                                                                  |
| Items             | `ItemId = PlantId \| GoodId` counts toward storage. `MaterialId` lives in its own uncapped `materials` chest. Seeds and pots do not count toward storage.                                                                                                                                | Processing turns 3–5 crops into 1 good, which frees storage space. That makes machines worth using.                                                                                                                                                                                                                                                                                                                       |
| Kiln (pot forge)  | The forge is **a machine** (`kiln`). It reuses the machine queue, timers, speed-up, upgrades, UI and 3D code. Its recipes take materials plus gold and produce a pot.                                                                                                                    | One system instead of two.                                                                                                                                                                                                                                                                                                                                                                                                |
| Pests             | A pest is rolled **when the crop is planted** (the `crops` RNG stream) and stored as `PlantedCrop.pest = {id, at, leaveAt}`. It shows only while `at ≤ now < leaveAt`. Tapping it catches it and gives a reward. If nobody catches it before `leaveAt`, the harvest loses 1 (minimum 1). | Fully decided by timestamps, so offline time works with no tick.                                                                                                                                                                                                                                                                                                                                                          |
| Randomness        | `rngSeed` is replaced by named streams `rng: Record<RngStream, number>`. ESLint bans `Math.random` and `Date.now` inside `src/game`.                                                                                                                                                     | Adding a new randomness consumer no longer changes the results of existing seeded tests. This is also required for server replay in M4.                                                                                                                                                                                                                                                                                   |
| Quests and stats  | `commit()` gets a hook, `applyProgress(draft, events)`. Quest progress and lifetime stats are updated from the events each action emits.                                                                                                                                                 | Actions stay simple, and M3 achievements and M4 leaderboards get the same data for free.                                                                                                                                                                                                                                                                                                                                  |
| Daily reset       | `localDay(now, tz)` with `tz = Date#getTimezoneOffset()` stored in state and changed through a pure `setTimezone` action (limited to once per 24h).                                                                                                                                      | Keeps the logic pure and checkable on the server. Blocks claiming rewards twice by changing the timezone.                                                                                                                                                                                                                                                                                                                 |
| Save versions     | 4 bumps, **v2–v5**, one per state-shape change: v2 data model, v3 XP rescale, v4 daily, v5 balloon. Every migration uses frozen constants and has a JSON fixture test.                                                                                                                   | Each migration is small and easy to verify.                                                                                                                                                                                                                                                                                                                                                                               |
| Balance           | A new XP curve, `xpToNext(L) = max(20, round10(8·L²·1.06^L))`, plus a deterministic **balance bot** test that plays 28 simulated days.                                                                                                                                                   | Target: level 30 in about 3 weeks with 5 sessions a day.                                                                                                                                                                                                                                                                                                                                                                  |

---

## 1. Foundations (M2.1, SAVE v2)

### 1.1 Types (`src/game/types.ts`)

```ts
export const PLANT_IDS = [
  ...M1,
  'mint',
  'tea',
  'cotton',
  'lotus',
  'cocoa',
  'dragonfruit',
  'vanilla',
  'starfruit',
] as const;
export const GOOD_IDS = [
  'rose_water',
  'mint_oil',
  'lavender_oil',
  'lotus_essence',
  'strawberry_jam',
  'apple_jam',
  'dragonfruit_jam',
  'roasted_seeds',
  'green_tea',
  'mint_tea',
  'lotus_tea',
  'yarn',
  'cloth',
  'scented_sachet',
  'apple_juice',
  'smoothie',
  'coconut_milk',
  'starfruit_juice',
  'chocolate',
  'banana_bread',
  'vanilla_cake',
  'bouquet',
  'spa_basket',
  'grand_hamper',
] as const;
export const MATERIAL_IDS = ['cloudclay', 'dewglass', 'sunstone', 'stardust'] as const;
export const MACHINE_IDS = [
  'still',
  'kettle',
  'kiln',
  'roaster',
  'loom',
  'press',
  'oven',
  'atelier',
] as const;
export const FORGE_IDS = ['forge_basic', 'forge_glazed', 'forge_sunfired', 'forge_starlit'] as const;
export const PEST_IDS = ['caterpillar', 'snail', 'beetle', 'starmoth'] as const;
export const POT_IDS = ['clay', 'ceramic', 'porcelain', 'stoneware', 'jade', 'crystal', 'celestial'] as const; // shape ids
export const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'] as const;
export const RNG_STREAMS = ['orders', 'crops', 'loot', 'forge', 'daily', 'balloon'] as const;

export type ItemId = PlantId | GoodId; // takes storage space
export type StockId = ItemId | MaterialId; // anything a recipe or reward can reference
export type RecipeId = GoodId | ForgeId;
export interface Stack<K extends string = StockId> {
  id: K;
  qty: number;
}

export interface PotStats {
  xpPct?: number;
  timePct?: number;
  goldPct?: number;
  yieldPct?: number;
}
export interface PotInstance {
  uid: number;
  potId: PotId;
  rarity: Rarity;
  stats: PotStats;
  origin: 'shop' | 'forge' | 'reward' | 'legacy';
}
export interface Pot extends PotInstance {
  kind: 'pot';
  plant: PlantedCrop | null;
} // flattened: pot.potId and pot.plant keep working
export interface MachineJob {
  recipe: RecipeId;
  startAt: number;
  doneAt: number;
}
export interface Machine {
  kind: 'machine';
  machineId: MachineId;
  level: number;
  queue: MachineJob[];
}
export type SlotContent = Pot | Machine;
export interface Floor {
  slots: (SlotContent | null)[];
}

export interface PestInfo {
  id: PestId;
  at: number;
  leaveAt: number;
} // deleted when caught
export interface PlantedCrop {
  plantId: PlantId;
  plantedAt: number;
  growMs: number;
  yield: number; // v2: saved at planting, includes the extra-yield roll
  pest?: PestInfo;
} // optional, so no migration is needed
export type OrderItem = Stack<ItemId>; // v2: {plantId,qty} -> {id,qty}

export interface LifetimeStats {
  harvests;
  cropsHarvested;
  goodsMade;
  potsForged;
  pestsCaught;
  pestsEscaped;
  ordersDelivered;
  cratesFilled;
  balloonsCompleted;
  questsCompleted;
  loginDays;
  goldEarned;
  rubySpent: number;
}
export interface Reward {
  gold?: number;
  ruby?: number;
  xp?: number;
  items?: Stack<ItemId>[];
  materials?: Counts<MaterialId>;
}
```

**Final `GameState` (v5).** Fields marked with a version are new in that version.

```ts
interface GameState {
  version;
  createdAt;
  lastSeenAt;
  gold;
  ruby;
  xp;
  level;
  floors: Floor[];
  seeds: Counts<PlantId>;
  crops: Counts<PlantId>;
  goods: Counts<GoodId>; // v2
  materials: Counts<MaterialId>; // v2
  potBag: PotInstance[]; // v2 (replaces potStock)
  nextUid: number; // v2
  storageCapacity;
  storageUpgrades;
  orders: OrderSlot[];
  nextOrderId;
  rng: Record<RngStream, number>; // v2 (replaces rngSeed)
  stats: LifetimeStats; // v2
  daily: DailyState; // v4 (includes tz)
  balloon: BalloonState; // v5
}
```

### 1.2 New pure modules under `src/game/`

- `items.ts`
  - `ID_KIND` map, built from configs; a test checks that all ids are unique across plants, goods and materials.
  - `stockOf(s, id)`, `addStock(s, id, d)`.
  - `storageUsed = Σcrops + Σgoods`.
  - `itemValue(id)` (shop sell price) and `itemXpValue(id)`.
- `pots.ts`
  - `potStackKey(inst)` gives `potId|rarity|xp,time,gold,yield|origin==='shop'`, used to group identical pots in the tray.
  - `effectiveStats(pot)` applies caps.
  - `rollPot(rng, tier)`, `newPotInstance(s, …)` (consumes `nextUid`), `findInBag(s, uid)`.
- `machines.ts`
  - `queueCapacity(m)`, `machineSpeedPct(m)`.
  - `machineStatus(m, now)` returns `{running?, readyCount, pendingCount}`.
  - `ownsMachine(s, id)`, `allMachines(s)`.
- `pests.ts`: `rollPest(rng, plantDef, growMs, plantedAt, level)`, `activePest(crop, now)`, `isNibbled(crop, now)`, `rollPestDrop(rng, pestId)`.
- `rewards.ts`: `grantReward(draft, reward, now, events)`. Items may push storage above capacity; nothing is ever lost.
- `progress.ts`: `applyProgress(draft, events)` updates `stats` and `daily.quests`, and emits `questCompleted`.
- `balloon.ts`, `daily.ts`, `migrations.ts` (moved out of `save.ts`).
- `rng.ts` gets `deriveSeed(master, name)` (FNV-1a of the name mixed through mulberry; pinned by a test) and `withRng(s, stream, fn)`.
- `actions.ts` becomes a folder `actions/`: `commit.ts`, `garden.ts`, `pots.ts`, `machines.ts`, `pests.ts`, `orders.ts`, `balloon.ts`, `daily.ts`, `tick.ts`, `index.ts`. `src/game/index.ts` re-exports, so import paths stay the same.
- Recommended now, to coordinate with the M4 design: a serializable `Command` union plus `applyCommand(state, cmd, now)` in `commands.ts`, with `Game.run(cmd)`. M2 touches every UI call site anyway, and the M4 server needs replayable action logs.

`commit()` becomes:

```ts
function commit(state, mutate): ActionResult {
  const draft = structuredClone(state);
  const events: GameEvent[] = [];
  mutate(draft, events);
  applyProgress(draft, events); // quests + stats; may append questCompleted
  return { ok: true, state: draft, events };
}
```

ESLint: in the `src/game/**` block, add `no-restricted-properties` for `Math.random` and `Date.now`. Move the random default seed in `createNewGame(now, seed)` out of `state.ts` into `core/Game.ts`.

### 1.3 Storage rules

- Crops and goods count toward capacity.
- Materials go to an uncapped chest; they drop slowly.
- `potBag` holds at most `POT_BAG_MAX = 40`. Seeds are uncapped.
- `harvest` and `collectMachine` check `used + qty ≤ cap`.
  - A machine collects only the finished jobs that fit; the rest wait inside the machine, which acts as a buffer.
  - Rewards and job-cancel refunds may overflow capacity.
- Storage upgrade cost becomes `{gold: round10(250·1.45^n), materials}`:
  - `cloudclay: 2+n` when n≥3
  - `dewglass: n−4` when n≥6
  - `sunstone: n−9` when n≥10
- Capacity steps: +25 for n<6, +50 for n<14, then +100.

### 1.4 Migration v1→v2 (`migrations.ts`, frozen constants, no config imports)

```ts
const V1_POT_STATS = { clay: {}, ceramic: { xpPct: 20 }, porcelain: { timePct: 15 } };
function v1to2(raw) {
  let uid = 1;
  const inst = (potId) => ({
    uid: uid++,
    potId,
    rarity: 'common',
    origin: 'legacy',
    stats: { ...V1_POT_STATS[potId] },
  });
  const floors = raw.floors.map((f) => ({
    slots: f.slots.map(
      (p) => p && { kind: 'pot', ...inst(p.potId), plant: p.plant && { ...p.plant, yield: 2 } },
    ),
  }));
  const potBag = Object.entries(raw.potStock ?? {}).flatMap(([id, n]) =>
    Array.from({ length: n }, () => inst(id)),
  );
  const orders = raw.orders.map((o) => ({
    ...o,
    order: o.order && { ...o.order, items: o.order.items.map(({ plantId, qty }) => ({ id: plantId, qty })) },
  }));
  const rng = Object.fromEntries(
    RNG_STREAMS_V2.map((n) => [n, n === 'orders' ? raw.rngSeed : deriveSeed(raw.rngSeed, n)]),
  );
  const { potStock, rngSeed, ...rest } = raw;
  return {
    ...rest,
    floors,
    potBag,
    nextUid: uid,
    orders,
    rng,
    goods: {},
    materials: {},
    stats: ZERO_STATS_V2,
  };
}
```

- Legacy ceramic pots keep +20% XP and legacy porcelain pots keep −15% time. Crops that are still growing keep their saved `growMs`.
- `looksValid` is updated. Slots must be null or `kind ∈ {pot, machine}`. `potBag` must be an array. `goods` and `materials` must be records. `rng` must have every stream as a number. `nextUid` must be a number.
- **Fixture rule:** before each version bump, commit `tests/fixtures/save-v{N-1}.json`, generated by the code _before_ the bump through an `UPDATE_FIXTURES=1` test helper. Capture v1 now, before touching any types. It should include ceramic and porcelain pots, `potStock`, a crop halfway through growing, and orders.

---

## 2. Economy rebalance (M2.2, SAVE v3)

### 2.1 XP curve (`config/levels.ts`)

`xpToNext(L) = max(20, round10(8·L²·1.06^L))`. `xpForLevel` reads a precomputed cumulative `XP_TABLE`.

| Level            | 2   | 5   | 10    | 15     | 20     | 25      | 30      | 40      | 50   |
| ---------------- | --- | --- | ----- | ------ | ------ | ------- | ------- | ------- | ---- |
| Total XP         | 20  | 310 | 3,490 | 15,510 | 47,390 | 118,420 | 261,110 | 1.0M    | 3.2M |
| XP to next level | 40  | 270 | 1,430 | 4,310  | 10,260 | 21,460  | 41,350  | 131,660 | —    |

Rough estimate (5 sessions a day, pots filled, ×1.6 for orders, machines, quests and balloon): day 1 → L8, day 3 → L14, day 7 → L20, day 14 → L26, day 21 → L29, day 24 → L30.

- Level-up reward: `gold = round10(30·L^1.5)`, ruby 1, or 3 when L%5==0.
- **v2→v3 migration:** keep the player's level and their fraction of progress inside it.
  ```ts
  const V1 = L => 5*(L-1)*L; const V3 = frozen copy of the new table;
  frac = clamp01((xp − V1(level)) / (V1(level+1) − V1(level)));
  xp = V3[level] + floor(frac · (V3[level+1] − V3[level]))
  ```
  A guard test asserts that the live `XP_TABLE` equals the frozen V3 table, so any future curve change forces a new migration.

### 2.2 Plants (16). New plants marked ★, changed existing plants marked Δ.

Pest chance by grow time: under 5m 0%; 5–30m 10%; 30m–2h 15%; 2h and longer 18%.

| id           | VI name     | Icon | Unlock L | Grow | Seed | Sell | Yield | XP  | Model idea for new plants                                                                                                                                    |
| ------------ | ----------- | ---- | -------- | ---- | ---- | ---- | ----- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| rose         | Hoa hồng    | 🌹   | 1        | 30s  | 5    | 4    | 2     | 1   | —                                                                                                                                                            |
| sunflower    | Hướng dương | 🌻   | 1        | 2m   | 10   | 8    | 2     | 2   | —                                                                                                                                                            |
| strawberry Δ | Dâu tây     | 🍓   | 2        | 5m   | 20   | 15   | 2     | 3   | —                                                                                                                                                            |
| ★mint        | Bạc hà      | 🌿   | 3        | 10m  | 30   | 22   | 2     | 5   | 3 short stems with paired crinkled `leaf()` in bright 0x5fd38a; bloom is tiny lilac ball clusters on the tips                                                |
| lavender Δ   | Oải hương   | 🪻   | 4        | 15m  | 40   | 30   | 2     | 6   | —                                                                                                                                                            |
| ★tea         | Chè         | 🍃   | 5        | 30m  | 60   | 45   | 2     | 9   | Dense bush of 7 dark icosahedron balls; bloom is light-green tip cones plus 3 small white flowers                                                            |
| lily Δ       | Hoa ly      | 🌷   | 6        | 45m  | 80   | 60   | 2     | 12  | —                                                                                                                                                            |
| apple Δ      | Táo         | 🍎   | 7        | 1h   | 100  | 75   | 2     | 15  | —                                                                                                                                                            |
| ★cotton      | Bông        | ☁️   | 9        | 1h30 | 130  | 95   | 2     | 20  | Woody Y-branch stem; bloom is white fluffy bolls (Icosahedron detail 1, scaled) in brown calyx cups, a nod to the cloud theme                                |
| banana Δ     | Chuối       | 🍌   | 10       | 2h   | 160  | 120  | 2     | 25  | —                                                                                                                                                            |
| ★lotus       | Sen         | 🪷   | 12       | 3h   | 220  | 165  | 2     | 34  | Blue water disc on the soil, 2–3 thin notched pads (Cylinder with thetaLength 5.6); bloom is 2 rings of upturned pink petals plus a yellow seed-pod cylinder |
| coconut Δ    | Dừa         | 🥥   | 14       | 4h   | 280  | 210  | 2     | 42  | —                                                                                                                                                            |
| ★cocoa       | Ca cao      | 🫘   | 16       | 6h   | 380  | 285  | 2     | 58  | Short trunk with broad drooping leaves; bloom is 3 ridged pods (sphere scaled 0.6/1.3/0.6, orange to maroon) hanging from the trunk                          |
| ★dragonfruit | Thanh long  | 🌵   | 19       | 8h   | 480  | 360  | 2     | 72  | 3 arching arms made of triangular prisms (Cylinder with 3 radial segments); bloom is magenta ovals with green tip cones                                      |
| ★vanilla     | Vani        | 🌼   | 22       | 10h  | 580  | 440  | 2     | 86  | Brown stake with leaves spiralling up it on a helix; bloom is pale-yellow 3-petal orchids plus long hanging green capsule pods                               |
| ★starfruit   | Khế         | 🌟   | 25       | 12h  | 700  | 530  | 2     | 100 | Round-canopy tree; fruit is `ExtrudeGeometry` from a 5-point star `Shape` in 0xf6d743 (a nod to the "ăn khế trả vàng" folk tale)                             |

Migrated players may hold seeds for plants that now unlock later. `plant()` does not check level, so they can still plant them. Accepted.

### 2.3 Floors and shop pots

- `FLOOR_UNLOCKS` for floors 2–7: L3/400, L6/2,000, L10/7,500, L14/18,000, L18/40,000, L23/80,000. Unlocked floors stay unlocked. The E2E test's expected gold changes from −300 to −400.
- `SHOP_POTS`:

| Pot       | Rarity   | Stats     | Price | Unlock |
| --------- | -------- | --------- | ----- | ------ |
| clay      | common   | none      | 40    | L1     |
| ceramic   | uncommon | xpPct 10  | 600   | L4     |
| porcelain | uncommon | timePct 8 | 1,500 | L8     |

Legacy pots keep their old stats.

### 2.4 Unlock timeline (something new almost every level)

| Level | Unlocks                                                             |
| ----- | ------------------------------------------------------------------- |
| L1    | Owl orders, daily login gift                                        |
| L3    | Mint, floor 3, daily quests                                         |
| L4    | Lavender, Still, ceramic pot                                        |
| L5    | Tea, **pests**                                                      |
| L6    | Lily, Kettle, floor 4                                               |
| L7    | Apple, **Kiln** (basic forge)                                       |
| L8    | Roaster, porcelain pot                                              |
| L9    | Cotton                                                              |
| L10   | Banana, **balloon**, floor 5, glazed forge, machine upgrade level 3 |
| L11   | Loom                                                                |
| L12   | Lotus                                                               |
| L13   | Press                                                               |
| L14   | Coconut, floor 6                                                    |
| L15   | Sunfired forge, 4th daily quest                                     |
| L16   | Cocoa, Oven                                                         |
| L17   | Machine upgrade level 4                                             |
| L18   | Floor 7                                                             |
| L19   | Dragonfruit                                                         |
| L20   | Starlit forge                                                       |
| L21   | Atelier                                                             |
| L22   | Vanilla, balloon gets 9 crates                                      |
| L23   | Floor 8                                                             |
| L24   | Machine upgrade level 5                                             |
| L25   | Starfruit                                                           |
| L26   | Grand hamper                                                        |

`progression.ts`: add `unlocksAt(level) → {plants, machines, recipes, features}` for the LevelUpModal. `addXp` calls `onFeatureUnlocked` so quests and the balloon appear right away when their level is reached.

---

## 3. Production machines and goods (M2.4)

### 3.1 Config (`config/machines.ts`, `config/goods.ts`)

- **Machine levels 1–5:** queue 2/3/4/5/6; speed bonus 0/5/10/15/20%.
- **Upgrade to level n+1:** gold = `round10(price·[0.6,1.2,2.4,4.8][n−1])`. Materials:
  - →2: cloudclay 4
  - →3: cloudclay 6 + dewglass 2
  - →4: dewglass 5 + sunstone 1
  - →5: sunstone 3 + stardust 1
  - Player level gates: level 3 needs L10, level 4 needs L17, level 5 needs L24.
- `MACHINE_MAX_COPIES = 1` per machine type.

| id      | VI name         | Icon | Unlock | Price  | 3D model (fits a 1.5×1.9 cell) and working animation                                                                    |
| ------- | --------------- | ---- | ------ | ------ | ----------------------------------------------------------------------------------------------------------------------- |
| still   | Nồi chưng hương | ⚗️   | 4      | 600    | Copper lathe pot, dome lid, torus-arc pipe, transparent glass flask with tinted liquid. Steam puffs rise; liquid pulses |
| kettle  | Nồi mứt         | 🍯   | 6      | 1,500  | Black cauldron on 3 legs with a wooden ladle. Surface bubbles pop; ladle stirs                                          |
| kiln    | Lò nung chậu    | 🏺   | 7      | 1,200  | Squashed brick dome, chimney, glowing mouth (MeshBasic orange). Smoke; mouth flickers                                   |
| roaster | Lò sao trà      | 🫖   | 8      | 3,000  | Horizontal drum on a stand with a crank. Drum spins; leaf flecks                                                        |
| loom    | Khung dệt mây   | 🧶   | 11     | 6,000  | Box frame, thin threads, cloud-white cloth plane. Shuttle slides side to side                                           |
| press   | Máy ép trái     | 🧃   | 13     | 9,000  | Tub, screw (cylinder plus torus threads), spoked top wheel. Wheel spins; plate bobs                                     |
| oven    | Lò bánh mây     | 🥐   | 16     | 15,000 | Cloud-shaped stacked spheres, round door, chimney. Door glows                                                           |
| atelier | Xưởng gói quà   | 🎁   | 21     | 30,000 | Table with stacked ribboned boxes (torus crosses) and a spool. Boxes hop; spool turns                                   |

**Goods.** Prices are derived when the config loads: `sellPrice = round5(Σ input value·1.2 + minutes·1.0)`, collect XP = `round(2 + 0.45·min)`, order/crate XP value = `round(Σ input xpValue·1.1 + collectXp·0.5)`.

| Good (VI)                               | Machine | Unlock L | Inputs                                           | Time | Sell  | XP  |
| --------------------------------------- | ------- | -------- | ------------------------------------------------ | ---- | ----- | --- |
| rose_water (Nước hoa hồng) 🧴           | still   | 4        | rose×4                                           | 5m   | 25    | 4   |
| mint_oil (Tinh dầu bạc hà) 🧪           | still   | 4        | mint×3                                           | 15m  | 95    | 9   |
| lavender_oil (Tinh dầu oải hương) 🧪    | still   | 5        | lavender×3                                       | 25m  | 135   | 13  |
| lotus_essence (Tinh chất sen)           | still   | 13       | lotus×2 + rose_water                             | 90m  | 515   | 43  |
| strawberry_jam (Mứt dâu) 🍯             | kettle  | 6        | strawberry×4                                     | 15m  | 85    | 9   |
| apple_jam (Mứt táo)                     | kettle  | 7        | apple×3                                          | 40m  | 310   | 20  |
| dragonfruit_jam (Mứt thanh long)        | kettle  | 19       | dragonfruit×2 + strawberry×3                     | 2h   | 1,040 | 56  |
| roasted_seeds (Hạt hướng dương rang) 🌰 | roaster | 8        | sunflower×5                                      | 10m  | 60    | 7   |
| green_tea (Trà xanh) 🍵                 | roaster | 8        | tea×3                                            | 30m  | 190   | 16  |
| mint_tea (Trà bạc hà) 🫖                | roaster | 9        | tea×2 + mint×2                                   | 45m  | 205   | 22  |
| lotus_tea (Trà sen)                     | roaster | 13       | tea×3 + lotus                                    | 2h   | 480   | 56  |
| yarn (Sợi bông) 🧶                      | loom    | 11       | cotton×3                                         | 40m  | 380   | 20  |
| cloth (Vải mây) 🧣                      | loom    | 12       | yarn×2                                           | 90m  | 1,000 | 43  |
| scented_sachet (Túi thơm) 👝            | loom    | 14       | cloth + lavender_oil                             | 60m  | 1,420 | 29  |
| apple_juice (Nước ép táo) 🧃            | press   | 13       | apple×3                                          | 30m  | 300   | 16  |
| smoothie (Sinh tố) 🥤                   | press   | 13       | banana + strawberry×2 + apple                    | 45m  | 315   | 22  |
| coconut_milk (Nước cốt dừa) 🥛          | press   | 14       | coconut×2                                        | 60m  | 565   | 29  |
| starfruit_juice (Nước ép khế) 🍹        | press   | 25       | starfruit×2                                      | 2h   | 1,390 | 56  |
| chocolate (Sô-cô-la) 🍫                 | oven    | 16       | cocoa×3                                          | 60m  | 1,085 | 29  |
| banana_bread (Bánh chuối) 🍞            | oven    | 16       | banana×2 + roasted_seeds                         | 75m  | 435   | 36  |
| vanilla_cake (Bánh vani) 🍰             | oven    | 22       | vanilla + chocolate + apple_jam                  | 3h   | 2,380 | 83  |
| bouquet (Bó hoa) 💐                     | atelier | 21       | lily×3 + rose×5 + yarn                           | 60m  | 755   | 29  |
| spa_basket (Giỏ thư giãn) 🎀            | atelier | 23       | lavender_oil + lotus_essence + scented_sachet    | 3h   | 2,665 | 83  |
| grand_hamper (Giỏ quà thượng hạng) 🎁   | atelier | 26       | vanilla_cake + starfruit_juice + dragonfruit_jam | 6h   | 6,130 | 164 |

### 3.2 Rules and actions (`actions/machines.ts`)

- **`buildMachine(s, machineId, floor, slot)`** pays and places in one step; there is no machine stock.
  - Errors: `LEVEL_TOO_LOW`, `MACHINE_OWNED`, `SLOT_OCCUPIED`, `NOT_ENOUGH_GOLD`.
  - Event: `machineBuilt`.
- **`startJob(s, f, sl, recipe, now)`**
  - Checks: the recipe belongs to this machine, the recipe level is reached, `queue.length < capacity`, inputs (and gold for kiln recipes) are available.
  - Consumes inputs.
  - `startAt = max(now, last.doneAt)`; `doneAt = startAt + round(min·60000·(1−speed%))`, saved at enqueue time.
  - Event: `jobStarted`.
- **`collectMachine(s, f, sl, now)`**
  - Takes the finished prefix of the queue (`doneAt ≤ now`, in order) that fits in storage.
  - For kiln jobs, rolls a pot from the `forge` stream and needs space in `potBag`.
  - Errors: `NOTHING_TO_COLLECT`, `STORAGE_FULL`, `POT_BAG_FULL`.
  - Events: `goodsCollected {floor, slot, items, xp}` and/or `potForged {floor, slot, pot}`. Collect XP goes through `addXp`.
- **`speedUpMachine(s, f, sl, now)`**
  - Cost: `speedUpCost(running.doneAt − now)` ruby. The running job finishes now, and later jobs move earlier by the same delta.
- **`cancelJob(s, f, sl, index, now)`**
  - Only for jobs that have not started (`startAt > now`); otherwise `JOB_STARTED`.
  - Refunds inputs and gold; later jobs move earlier.
- **`upgradeMachine(s, f, sl)`**: errors `MAX_LEVEL`, `LEVEL_TOO_LOW`, `NOT_ENOUGH_MATERIALS`; event `machineUpgraded`.
- **`swapSlots(s, a, b)`**: always allowed; contents move intact (growing crops and queues keep their timestamps). Used to move machines and pots around.
- Machines need no `tick`. Their state is derived from timestamps, so offline time works automatically.

### 3.3 Owl orders (`orders.ts`)

- `generateOrder(rng, pool, level, id)`. The pool is unlocked plants plus goods whose machine is placed and whose recipe is unlocked. Goods are picked with `ORDER_GOODS_SHARE = 0.35`; goods qty is 1–2.
- Gold = `Σ itemValue·qty·1.5`; XP = `Σ itemXpValue·qty·1.5`.
- Rename `sellCrop` to `sellItem(s, id, qty)` (crops and goods), and the `sold` event field `plantId` to `item`.
- Rename the error `NOT_ENOUGH_CROPS` to `NOT_ENOUGH_ITEMS`. Errors are not saved, so this is safe.

---

## 4. Pot attributes and the forge (M2.5)

**Rarity tiers.** Each stat line picks a different stat, weighted xp 30 / gold 30 / yield 20 / time 20. Time values are multiplied by 0.6.

| Rarity (VI)             | Lines | Roll range (%) | Forged shape                                     | Rim colour |
| ----------------------- | ----- | -------------- | ------------------------------------------------ | ---------- |
| common (Thường)         | 1     | 3–8            | stoneware                                        | #9aa5b1    |
| uncommon (Tốt)          | 2     | 5–12           | stoneware with glaze band                        | #4caf50    |
| rare (Hiếm)             | 2     | 10–18          | jade (6-sided cylinder)                          | #3d8bfd    |
| epic (Sử thi)           | 3     | 14–24          | crystal (faceted, semi-transparent, halo sprite) | #a259ff    |
| legendary (Huyền thoại) | 4     | 20–30          | celestial (gold, orbiting star ring)             | #ffb300    |

**Stat caps:** time 30, xp 60, gold 60, yield 50.

**Where stats apply:**

- `growMsFor` uses `timePct`.
- `harvestXpFor` uses `xpPct`.
- At harvest, `goldPct` adds gold equal to `sellPrice·qty·goldPct%`, carried in the `harvested.gold` field.
- `yieldPct` is the chance of +1 yield, rolled at **planting** (`crops` stream) and saved in `PlantedCrop.yield`. PotInfo shows "🍀 Được mùa +1".

**Forge recipes (kiln):**

| Recipe         | Unlock | Cost                                        | Time | Odds C/U/R/E/L |
| -------------- | ------ | ------------------------------------------- | ---- | -------------- |
| forge_basic    | L7     | cloudclay 8, 200g                           | 30m  | 70/25/5/0/0    |
| forge_glazed   | L10    | cloudclay 6, dewglass 3, 800g               | 60m  | 30/45/20/5/0   |
| forge_sunfired | L15    | cloudclay 6, dewglass 4, sunstone 2, 2,500g | 3h   | 0/30/45/20/5   |
| forge_starlit  | L20    | dewglass 6, sunstone 4, stardust 1, 8,000g  | 6h   | 0/0/40/45/15   |

**Pot actions** (`actions/pots.ts`; events `potPlaced`, `potStored`, `potSold`, `potSalvaged`, `bought`):

- `buyPot(s, potId, qty)` creates shop-origin instances. Error `POT_BAG_FULL`.
- `placePot(s, f, sl, uid)`. Errors `POT_NOT_FOUND`, `SLOT_OCCUPIED`.
- `storePot(s, f, sl)` works only on an empty pot. Errors `SLOT_BUSY`, `NOT_A_POT`, `POT_BAG_FULL`.
- `sellPot(s, uid)`: shop and legacy pots only, for 25% of the shop price.
- `salvagePot(s, uid)`: forged and reward pots only. Returns:
  - common: cloudclay 3
  - uncommon: cloudclay 4 + dewglass 1
  - rare: dewglass 3 + sunstone 1
  - epic: dewglass 4 + sunstone 2
  - legendary: sunstone 4 + stardust 1

**Materials** (`config/materials.ts`):

| Material (VI)              | Icon | Sources in M2                                        | Mine source in M3   |
| -------------------------- | ---- | ---------------------------------------------------- | ------------------- |
| cloudclay (Đất Mây)        | 🟫   | Pests, salvage, login, quests                        | Shallow layers      |
| dewglass (Thủy Tinh Sương) | 💧   | Pests, balloon, quests                               | Middle layers       |
| sunstone (Đá Mặt Trời)     | 🔆   | Rare pests, balloon completion, login day 7          | Deep layers         |
| stardust (Bụi Sao)         | ✨   | Login day 7, balloon completion (10%), starmoth (4%) | Deepest layers, pet |

---

## 5. Pests (M2.3, no save bump)

**Config (`config/pests.ts`):**

- `PEST_UNLOCK_LEVEL = 5`.
- Pests appear only on crops with grow time of 5 minutes or more, with the chance from the plant table.
- **At planting** (`crops` stream), draw a **fixed 4 values** (extra yield, pest chance, timing, kind), so the stream advances the same amount whatever the outcome.
  - `at = plantedAt + growMs·(0.2 + 0.6·r)`
  - `leaveAt = at + clamp(0.6·growMs, 15m, 4h)`

| Pest (VI)                  | Weight | Drop (rolled at catch, `loot` stream)            | Model (exaggerated size 0.35–0.45 so it is about 12px on a phone, plus a "!" bubble sprite) |
| -------------------------- | ------ | ------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| caterpillar (Sâu Bông) 🐛  | 45     | cloudclay 1 @60%                                 | 5 shrinking green spheres moving in a sine wave, 2 antennae                                 |
| snail (Ốc Sên Mây) 🐌      | 30     | cloudclay 1–2 @80%                               | Torus or lathe spiral shell on a capsule body, slow glide                                   |
| beetle (Bọ Cánh Cam) 🪲    | 18     | dewglass 1 @60%, else cloudclay 1                | Teal half-sphere shell with a seam, 6 stub legs                                             |
| starmoth (Bướm Sao Đêm) 🦋 | 7      | sunstone 1 @35%, dewglass 2 @50%, stardust 1 @4% | 2 pairs of flat triangle wings with glowing dots, flaps and circles                         |

**Rules:**

- `activePest(c, now)` is true when the pest exists, `at ≤ now < leaveAt`, and `at < plantedAt + growMs`. A `speedUp` therefore removes pests that have not appeared yet.
- **`catchPest(s, f, sl, now)`**
  - Deletes `plant.pest`.
  - Reward: XP `max(2, round(xpToNext(level)·0.004))`, gold `5 + 2·level`, plus the material drop.
  - Error `NO_PEST`. Event `pestCaught {floor, slot, pestId, xp, gold, materials}`.
- **`isNibbled`**: the pest was never caught and `now ≥ leaveAt`.
  - `harvest` gives `max(1, yield − 1)` and sets `harvested.nibbled = true`.
  - The harvest counts in `stats.pestsEscaped`.
  - The plant body gets a shared brownish toon material.
- **`harvest` on a crop with an active pest catches it automatically**, with the full reward, then harvests. The only penalty is for a pest that left before anyone came back.
- Expected cost is about 3–4% of total yield; the M3 pet can auto-catch to soften it.
- **`sweep(s, f, sl, now)`** is a pure composite action. It catches an active pest, harvests if ready, and collects machine output, all in one commit. It returns `NOTHING_TO_DO` if there is nothing. Both the sickle drag and taps use it.
- `offlineSummary` adds `pestsWaiting`, `pestsEscaped` and `machinesReady`.

---

## 6. Hot-air balloon (Khinh khí cầu) (M2.7, SAVE v5)

**Config (`config/balloon.ts`):**

- `BALLOON_UNLOCK_LEVEL = 10`.
- `DOCK_MS = 14h`.
- Time away before the next balloon: 3h if every crate was filled, otherwise 6h.
- Crates: 6 crates (L10–14), 8 (L15–21), 9 (L22+).

**State:**

```ts
type BalloonState =
  | { phase: 'away'; returnsAt: number }
  | { phase: 'docked'; id: number; arrivedAt: number; leavesAt: number; crates: Crate[] };
interface Crate {
  id: ItemId;
  qty: number;
  gold: number;
  xp: number;
  filled: boolean;
}
```

**Crate generation** (`balloon` stream):

- About 60% goods (owned machines with unlocked recipes); qty 3 if the recipe takes 30m or less, 2 if 90m or less, else 1.
- Otherwise crops with grow time of 15m or more; qty 6–10 / 4–6 / 2–4 by grow time.
- Crate gold = `round10(value·qty·2.0)`; crate XP = `ceil(xpValue·qty·1.8)`.

**Actions:**

- **`fillCrate(s, i, now)`** consumes the items and gives the crate's gold and XP.
  - Errors: `BALLOON_AWAY`, `CRATE_FILLED`, `NOT_ENOUGH_ITEMS`. Event: `crateFilled`.
- **`sendBalloon(s, now)`** can be used at any time. If every crate is filled, it grants the completion bonus:
  - gold equal to 25% of all crate gold
  - ruby 2 and dewglass 2
  - sunstone 1 with 50% chance and stardust 1 with 10% chance (`loot` stream)

  The next balloon arrives after the 3h or 6h wait. Event: `balloonSent {completed, reward}`.

**`tick`:**

- If docked and `now ≥ leavesAt`: emit `balloonDeparted`, then `returnsAt = leavesAt + 6h`.
- If away, `level ≥ 10` and `now ≥ returnsAt`: dock at **`now`** (not backdated), emit `balloonArrived`.
- This is at most one departure and one arrival per tick, so long absences cause no loops.

**v4→v5 migration:** `balloon = { phase: 'away', returnsAt: raw.lastSeenAt }`.

**3D** (`render/BalloonView.ts`): purely decorative, behind the garden in the sky layer.

- Lathe teardrop envelope with alternating stripe colours, basket, rope cylinders.
- Descends when it arrives, bobs while docked, rises when it leaves.
- Tapping happens through the HUD chip, so `Picker` does not change.

---

## 7. Daily login and daily quests (M2.6, SAVE v4)

**State:**

```ts
interface DailyState {
  tz: number;
  tzChangedAt: number;
  day: number;
  quests: Quest[];
  bonusClaimed: boolean;
  freeRerollUsed: boolean;
  loginDay: number;
  loginCount: number;
}
interface Quest {
  kind: QuestKind;
  target?: ItemId;
  goal: number;
  progress: number;
  claimed: boolean;
  reward: Reward;
}
```

**Time handling** (`daily.ts`):

- `localDay(now, tz) = floor((now − tz·60000) / 86_400_000)`, where `tz` is `getTimezoneOffset()`.
- `setTimezone(s, tz, now)` accepts tz in [−840, 840] in multiples of 15, at most once per 24h. `Game` calls it at boot, before `tick`.
- `tick` rollover: if `localDay ≠ daily.day`, set the new day, generate quests if level ≥ 3 (`daily` stream), reset the bonus and the free reroll, and emit `dailyReset`. One rollover covers any number of missed days.

**Login gift:**

- `claimLogin(s, now)` requires `today > loginDay`; error `ALREADY_CLAIMED`.
- The 7-day cycle position is `loginCount % 7` and never resets on a missed day (kind). G = `40 + 25·L`.

| Day | Reward                           |
| --- | -------------------------------- |
| D1  | 3G gold                          |
| D2  | cloudclay 4                      |
| D3  | 5G gold                          |
| D4  | dewglass 2                       |
| D5  | 8G gold                          |
| D6  | ruby 2 + cloudclay 4             |
| D7  | ruby 3 + sunstone 1 + stardust 1 |

**Quests:**

- 3 per day, 4 from L15.
- Templates have `requires(state)` gates.
- Reward per quest: gold `round10(2G·diff)`, XP `round10(xpToNext(L)·0.05·diff)`, and cloudclay 2 with 25% chance.
- Bonus for finishing all quests (`claimQuestBonus`): ruby 1 + dewglass 1 + 5% of a level in XP.
- `rerollQuest(s, i, now)`: 1 free per day, then 2 ruby.
- `claimQuest(s, i, now)`: errors `QUEST_NOT_DONE`, `ALREADY_CLAIMED`.

| Kind                          | Goal                     | Difficulty | Progress comes from event             |
| ----------------------------- | ------------------------ | ---------- | ------------------------------------- |
| harvestAny                    | round5(15 + 1.5L)        | 1.0        | `harvested.qty`                       |
| harvestPlant (grow ≤ 2h)      | 20 / 10 / 6 by grow time | 1.2        | `harvested` where the plant matches   |
| deliverOrders                 | 3–5                      | 1.2        | `orderDelivered`                      |
| catchPests (L5+)              | 3–6                      | 1.3        | `pestCaught`                          |
| collectGoods (owns a machine) | 4 + L/5                  | 1.2        | `goodsCollected` Σqty                 |
| makeGood (recipe ≤ 60m)       | 2–4                      | 1.4        | `goodsCollected` where the id matches |
| sellGold                      | round100(3G)             | 0.8        | `sold.gold`                           |
| fillCrates (balloon unlocked) | 3–5                      | 1.5        | `crateFilled`                         |
| forgePot (owns kiln)          | 1                        | 1.5        | `potForged`                           |

**v3→v4 migration:** `daily = { tz: 0, tzChangedAt: 0, day: -1, quests: [], bonusClaimed: false, freeRerollUsed: false, loginDay: -1, loginCount: 0 }`. The boot `setTimezone` call and the first `tick` fill it in.

---

## 8. New errors and events

**Errors added:** `NOT_A_POT`, `NOT_A_MACHINE`, `MACHINE_OWNED`, `QUEUE_FULL`, `NOT_ENOUGH_ITEMS` (renamed), `NOT_ENOUGH_MATERIALS`, `NOTHING_TO_COLLECT`, `NOTHING_TO_DO`, `MAX_LEVEL`, `POT_BAG_FULL`, `POT_NOT_FOUND`, `CANNOT_SALVAGE`, `CANNOT_SELL`, `NO_PEST`, `NO_JOB`, `JOB_STARTED`, `BALLOON_AWAY`, `CRATE_FILLED`, `QUEST_NOT_DONE`, `ALREADY_CLAIMED`, `FEATURE_LOCKED`.

**Events added or changed:**

- `harvested` gains `+gold, +nibbled`.
- `sold {item, qty, gold}`.
- New: `potStored`, `potSold`, `potSalvaged {materials}`, `slotsSwapped`, `machineBuilt`, `machineUpgraded`, `jobStarted`, `jobCanceled`, `goodsCollected`, `potForged {pot}`, `machineSpeedUp`, `pestCaught`, `balloonArrived`, `balloonDeparted`, `balloonSent`, `crateFilled`, `dailyReset`, `loginClaimed`, `questCompleted`, `questClaimed`, `questBonusClaimed`, `questRerolled`, `timezoneSet`.
- `AppEvent.welcomeBack` gains `pestsWaiting`, `pestsEscaped`, `machinesReady`.

---

## 9. UI (Preact)

- **`core/Game.ts`**
  - `PanelId` adds `machine | balloon | quests`.
  - `ShopTab` adds `machines`; a new `storageTab` signal holds `crops | goods | materials | pots`.
  - `Tool` becomes:
    ```ts
    {kind:'seed'} | {kind:'pot'; stack: string} | {kind:'harvest'} | {kind:'machine'; machineId} | {kind:'move'; from: SlotRef}
    ```
  - `loginShown` signal.
- **Hud.** A second row of event chips. It stays inside `.hud`, so the camera's top inset adjusts automatically. Using a side rail would cover slot 5.
  - `hud-balloon`: 🎈 with countdown; dimmed while away.
  - `hud-quests`: 📋 n/3, with a badge when a quest can be claimed.
  - `hud-login`: 🎁, pulses when the gift can be claimed.
- **New panels:**
  - **`MachinePanel.tsx`**: queue strip (running job with progress bar and ruby speed-up, pending jobs with ✕ cancel, finished jobs), recipe cards (input have/need, time, sell price, XP, Start button), Upgrade card, Move button.
  - **`BalloonPanel.tsx`**: 3×3 crate grid that fills on tap, bonus preview, "Cho bay" (send) button.
  - **`QuestsPanel.tsx`**: 7-day calendar strip on top, quests with progress bars, claim and reroll buttons, bonus chest.
  - **`LoginModal`**: opens once per session when the gift can be claimed.
  - **`ForgeReveal`**: overlay signal in `feedback.ts`, a CSS rarity burst plus the pot's stats.
- **ShopPanel.**
  - The `machines` tab shows cards (unlock level, price, output icons, "Đã có" if owned). The buy button sets `tool = {kind:'machine'}` and closes the panel; ToolBanner then shows "Chạm vào ô trống để đặt {name}".
  - Seeds get a "Mua đủ trồng" button that buys enough seeds for every empty pot.
  - Upgrades show gold plus material costs.
- **StoragePanel.** 4 tabs. Pots tab: rarity-bordered cards with stats and Place / Salvage / Sell buttons.
- **Tray.** The pot row is grouped by `potStackKey` and sorted by rarity, and the row scrolls horizontally because there are now 16 seeds.
- **PotInfo.**
  - Rarity and stats lines.
  - Pest line with a `catch-pest` button, or "Bị sâu ăn −1".
  - `store-pot` button for an empty pot.
  - Bonus-yield hint.
- **LevelUpModal** uses `unlocksAt`.
- **`feedback.ts`** handles every new event: flyers for goods, materials, gold and XP; toasts for balloon, quests and machines.
- **Helpers.**
  - `names.ts` adds `itemName`, `materialName`, `machineName`, `pestName`, `rarityName`, `potStatsText`.
  - `icons.tsx` adds `ITEM_ICON` (emoji plus a tint colour) and a `RarityPotIcon`.
  - About 200 new `vi.ts` keys; adding `en.ts` can wait for M3.

## 10. Render

**File split:**

| File                      | Contents                                           |
| ------------------------- | -------------------------------------------------- |
| `render/models/common.ts` | `geo`, `mesh`, `ball`, `stem`, `leaf`              |
| `models/pots.ts`          | 7 shapes plus rarity rim and halo                  |
| `models/plants.ts`        | 16 plant builders                                  |
| `models/machines.ts`      | `MachineModel {root, animate(t, working), bubble}` |
| `models/pests.ts`         | 4 pest models                                      |
| `models/balloon.ts`       | balloon model                                      |
| `models/sprites.ts`       | canvas speech bubble with an emoji, "!" alert      |

**`GardenView` changes:**

- `SlotView` delegates to `PotContentView` (the current logic plus a pest overlay and the nibbled tint) or `MachineContentView` (idle, working or ready; the ready bubble shows the output emoji). Each is keyed by `kind|id|level`.
- New particle bursts for `pestCaught`, `goodsCollected` and `potForged` (rainbow).

**Optional debug gallery:** `?debug&gallery` lays out every model in a grid, and `e2e/gallery.spec.ts` screenshots it for art review.

**Draw-call budget:** about 2–3 visible floors × (pot + plant + pest). Watch `renderer.info.render.calls` in the debug view. If mid-range Android goes above about 400 calls, add a `mergeByMaterial` helper.

## 11. Input (`InputController`)

- **Tap order:**
  1. Run `sweep`; a pest, ready crop or finished job is handled first.
  2. If the slot is a machine, also open MachinePanel with `selected` set.
  3. If the slot is empty and a pot stack exists, place the best-rarity pot; otherwise emit `needPot`.
  4. Otherwise select the slot.
- **Drag:** the harvest tool calls `sweep`; the pot tool resolves the next uid for the stack on each slot; the machine tool calls `buildMachine` and clears the tool on success; the move tool calls `swapSlots`.
- `DRAG_QUIET` adds `NOT_A_POT`, `NOTHING_TO_DO`, `NOTHING_TO_COLLECT`.

## 12. Debug API and tests

**`debug.ts`** adds:

- `grant({ goods, materials, pots: Counts<PotId> })` (creates shop instances), `givePot(rarity)`
- `spawnPest(f, s, id?)` (`at = now`), `forceBalloon()`, `skipToMidnight()`, `setTz(m)`

**Unit tests (Vitest):**

| File                       | Covers                                                                                                                                                                                                                                  |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/migrations.test.ts` | Fixtures v1→v5 and each step on its own. Pot bag counts by `potId`, uids unique, legacy stats, `growMs` kept, `yield = 2`, order items converted, XP fraction kept, `rng.orders === old rngSeed`, `looksValid`.                         |
| `tests/items.test.ts`      | Id uniqueness, `storageUsed`                                                                                                                                                                                                            |
| `tests/pots.test.ts`       | Roll distribution over 10k rolls per tier within tolerance; distinct stats within ranges; place/store/sell/salvage; bag full; stats affect `growMs`, XP, gold and yield                                                                 |
| `tests/machines.test.ts`   | Build gates, sequential timing, queue full, partial collect when storage is full, upgrade, speed-up shift, cancel refund, `NOT_A_POT`, `sweep`, kiln output                                                                             |
| `tests/pests.test.ts`      | Deterministic rolls, level and grow-time gates, active window, catch drops, nibble penalty, auto-catch on harvest, speed-up removes future pests, offline pest that left                                                                |
| `tests/balloon.test.ts`    | Unlock, crates, fill, deadline departure, send with and without bonus, long absence handled in one tick                                                                                                                                 |
| `tests/daily.test.ts`      | `localDay` for VN +7, US −5, a DST shift; rollover; event progress; claim, bonus, reroll; double claim; timezone rate limit                                                                                                             |
| `tests/economy.test.ts`    | Every crop is profitable; every good is worth more than its inputs; recipe inputs are reachable at or below the recipe level; every new plant is used by at least one recipe; curve is monotonic; live curve equals the frozen v3 table |
| `tests/balance.test.ts`    | Deterministic bot over 28 days, 5 sessions a day, greedy strategy. Asserts day1 L7–10, day7 L18–22, day14 L24–28, day21 L27–30, day28 L29–33; gold never negative. Prints a table when `SIM_VERBOSE=1`.                                 |

**E2E (Playwright, mobile and desktop):**

- `e2e/core-loop.spec.ts`: update the floor cost (300 → 400).
- `e2e/machines.spec.ts`: buy and place the still, start rose_water, skip time, sickle-drag collect, sell from the goods tab.
- `e2e/pests-forge.spec.ts`: `spawnPest`, tap, materials increase; build the kiln, forge, reveal, place the pot from the tray.
- `e2e/daily-balloon.spec.ts`: login modal, quests claim, L10 balloon fill and send.

## 13. Implementation order (one commit each; every step leaves the project green)

| Step | Work                                                                                                                                                                    | Save version |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| 0    | Capture `tests/fixtures/save-v1.json` from the current code                                                                                                             | —            |
| M2.1 | Foundation: types, slot union, pot instances, items, RNG streams, `commit` hook, stats, lint rule, actions folder; update render, input, UI and debug to the new shapes | v2           |
| M2.2 | Rebalance: curve, 8 plants with models, floors, shop pots, storage costs, `unlocksAt`                                                                                   | v3           |
| M2.3 | Pests and materials; `sweep` (needs v2 materials)                                                                                                                       | —            |
| M2.4 | Machines and goods; orders include goods                                                                                                                                | —            |
| M2.5 | Kiln, pot rolls, salvage and sell, ForgeReveal (needs M2.3 and M2.4)                                                                                                    | —            |
| M2.6 | Daily login and quests, timezone (quest templates gated on features that exist)                                                                                         | v4           |
| M2.7 | Balloon                                                                                                                                                                 | v5           |
| M2.8 | Balance bot and tuning, E2E, gallery screenshots, README                                                                                                                | —            |

## 14. Risks

1. **Slot-union ripple.** M2.1 touches every layer. Keep it free of gameplay changes and keep the tests green.
2. **Migration bugs.** Use fixtures, frozen constants, and a property test: random v1 states → migrate → invariants hold.
3. **RNG stream split** changes exact results that seeded tests depend on. Tests should assert properties, not exact values.
4. **Balance numbers are a first pass.** The bot test is the guard rail; keep all tuning values in `config/`.
5. **Timezone and DST abuse.** Limited to one change per 24h plus the `loginDay` check; the M4 server enforces it again.
6. **Pest penalty may feel harsh** on long crops left overnight. Tuning knobs: chance, stay duration, and the M3 pet auto-catching.
7. **Phone performance** (draw calls, animations) and **UI density** (second HUD row, 16-seed tray). Test at 390×844.
8. **Unlock levels moved up** for migrated players; accepted.

## 15. Hooks for later milestones

- **M3:**
  - Mine drops the 4 materials, adding new ones only if needed.
  - Pet auto-catches pests and buffs stats.
  - Achievements read `stats`; audio cues use the new events.
- **M4:**
  - Commands are serializable and replayable on the server.
  - The server owns the seeds (secret salt).
  - Pot uids are reassigned when a pot is traded.
  - Balloon crates get a `helper` field for friend help.
  - The roadside shop trades `Stack<StockId>`.

### Critical Files for Implementation

- /home/user/Skyline-Garden/src/game/types.ts
- /home/user/Skyline-Garden/src/game/actions.ts (becomes `src/game/actions/` with `commit.ts`)
- /home/user/Skyline-Garden/src/game/save.ts (plus a new `src/game/migrations.ts`)
- /home/user/Skyline-Garden/src/render/GardenView.ts (plus `src/render/models.ts`, to be split)
- /home/user/Skyline-Garden/src/input/InputController.ts
