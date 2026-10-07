// ---------- Danh mục id ----------

export const PLANT_IDS = [
  'rose',
  'sunflower',
  'strawberry',
  'mint',
  'lavender',
  'tea',
  'lily',
  'apple',
  'cotton',
  'banana',
  'lotus',
  'coconut',
  'cocoa',
  'dragonfruit',
  'vanilla',
  'starfruit',
] as const;
export type PlantId = (typeof PLANT_IDS)[number];

/** Hàng chế biến từ máy. */
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
export type GoodId = (typeof GOOD_IDS)[number];

/** Vật liệu (từ sâu bọ, mỏ, phần thưởng), dùng để đúc chậu và nâng cấp. */
export const MATERIAL_IDS = ['cloudclay', 'dewglass', 'sunstone', 'stardust'] as const;
export type MaterialId = (typeof MATERIAL_IDS)[number];

/** Vật phẩm dùng được (bom mây ở mỏ, bánh cho thú cưng). */
export const CONSUMABLE_IDS = ['cloudBomb', 'petTreat'] as const;
export type ConsumableId = (typeof CONSUMABLE_IDS)[number];

/** Mọi thứ nằm trong kho. Nông sản + hàng chế biến tính vào sức chứa kho; vật liệu + vật phẩm nằm trong rương. */
export type ItemId = PlantId | GoodId | MaterialId | ConsumableId;
export type BarnItemId = PlantId | GoodId;
export type ChestItemId = MaterialId | ConsumableId;

/** Hình dáng chậu. Ba loại đầu bán ở cửa hàng, các loại sau chỉ có từ lò đúc. */
export const POT_IDS = ['clay', 'ceramic', 'porcelain', 'stoneware', 'jade', 'crystal', 'celestial'] as const;
export type PotId = (typeof POT_IDS)[number];

export const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'] as const;
export type Rarity = (typeof RARITIES)[number];

export const POT_STATS = ['xpPct', 'timePct', 'goldPct', 'yieldPct'] as const;
export type PotStat = (typeof POT_STATS)[number];

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
export type MachineId = (typeof MACHINE_IDS)[number];

/** Công thức của lò đúc chậu. */
export const FORGE_IDS = ['forge_basic', 'forge_glazed', 'forge_sunfired', 'forge_starlit'] as const;
export type ForgeId = (typeof FORGE_IDS)[number];
export type RecipeId = GoodId | ForgeId;

/** Các luồng số ngẫu nhiên độc lập: thêm nơi dùng random mới không làm lệch kết quả của nơi khác. */
export const RNG_STREAMS = [
  'orders',
  'crops',
  'loot',
  'forge',
  'daily',
  'balloon',
  'mine',
  'pet',
  'npc',
] as const;
export type RngStream = (typeof RNG_STREAMS)[number];

/** Thống kê trọn đời, cập nhật tự động từ sự kiện (dùng cho nhiệm vụ, thành tựu, bảng xếp hạng). */
export const STAT_KEYS = [
  'harvests',
  'cropsHarvested',
  'seedsPlanted',
  'goodsMade',
  'potsForged',
  'pestsCaught',
  'pestsEscaped',
  'ordersDelivered',
  'cratesFilled',
  'balloonsCompleted',
  'questsCompleted',
  'loginDays',
  'goldEarned',
  'rubySpent',
  'tilesBroken',
  'mineClears',
  'petTrips',
  'petFeeds',
  'helpsGiven',
  'stallSales',
  'tutorialDone',
] as const;
export type StatKey = (typeof STAT_KEYS)[number];

export const PEST_IDS = ['caterpillar', 'snail', 'beetle', 'starmoth'] as const;
export type PestId = (typeof PEST_IDS)[number];

export type Counts<K extends string> = Partial<Record<K, number>>;

// ---------- Khu vườn ----------

/** Sâu bọ được quyết định lúc trồng: xuất hiện tại `at`, bỏ đi tại `leaveAt` nếu không ai bắt. */
export interface PestInfo {
  id: PestId;
  at: number;
  leaveAt: number;
}

export interface PlantedCrop {
  plantId: PlantId;
  plantedAt: number;
  /** Thời gian lớn đã tính bonus chậu lúc trồng, để đổi config không làm hỏng save cũ. */
  growMs: number;
  /** Số nông sản khi thu hoạch, quyết định lúc trồng (gồm cả lượt "được mùa"). */
  yield: number;
  pest: PestInfo | null;
}

/** Chỉ số của chậu, theo %. Khóa vắng mặt nghĩa là 0. */
export type PotStats = Partial<Record<PotStat, number>>;

/** Một chiếc chậu cụ thể (mỗi chậu có chỉ số riêng). */
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
}

/** Một mẻ trong hàng đợi của máy. Thời điểm được tính sẵn lúc xếp hàng. */
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
  /** Luôn có SLOTS_PER_FLOOR phần tử; null là ô trống. */
  slots: (SlotContent | null)[];
}

// ---------- Đơn hàng ----------

export interface OrderItem {
  id: BarnItemId;
  qty: number;
}

export interface Order {
  id: number;
  items: OrderItem[];
  gold: number;
  xp: number;
}

export interface OrderSlot {
  order: Order | null;
  /** Khi order là null: thời điểm cú mang đơn mới tới. */
  readyAt: number;
}

// ---------- Hằng ngày ----------

export const QUEST_KINDS = [
  'harvestAny',
  'harvestPlant',
  'deliverOrders',
  'catchPests',
  'collectGoods',
  'makeGood',
  'sellGold',
  'fillCrates',
  'forgePot',
] as const;
export type QuestKind = (typeof QUEST_KINDS)[number];

/** Phần thưởng chỉ gồm vàng, ruby, XP, hạt giống và đồ trong rương (không bao giờ làm kho tràn). */
export interface Reward {
  gold?: number;
  ruby?: number;
  xp?: number;
  seeds?: Counts<PlantId>;
  items?: Counts<ChestItemId>;
}

export interface Quest {
  kind: QuestKind;
  /** Món cụ thể (với nhiệm vụ "thu hoạch X", "làm X"), null nếu không cần. */
  target: BarnItemId | null;
  goal: number;
  progress: number;
  claimed: boolean;
  reward: Reward;
}

export interface DailyState {
  /** Ngày (theo calendar.dayIndex) của bộ nhiệm vụ hiện tại; -1 là chưa có. */
  day: number;
  quests: Quest[];
  bonusClaimed: boolean;
  freeRerollUsed: boolean;
  /** Ngày nhận quà đăng nhập gần nhất. */
  loginDay: number;
  /** Số lần đã nhận quà (vị trí trong vòng 7 ngày = loginCount % 7). */
  loginCount: number;
}

// ---------- Khinh khí cầu ----------

export interface Crate {
  id: BarnItemId;
  qty: number;
  gold: number;
  xp: number;
  filled: boolean;
}

export type BalloonState =
  | { phase: 'away'; returnsAt: number; trips: number }
  | { phase: 'docked'; arrivedAt: number; leavesAt: number; crates: Crate[]; trips: number };

// ---------- State ----------

export interface GameState {
  version: number;
  createdAt: number;
  lastSeenAt: number;
  gold: number;
  ruby: number;
  /** Tổng XP tích lũy từ đầu game. */
  xp: number;
  level: number;
  /** Chỉ chứa các tầng đã mở khóa; tầng 0 ở dưới cùng. */
  floors: Floor[];
  seeds: Counts<PlantId>;
  items: Counts<ItemId>;
  /** Chậu đang cất trong kho (chưa đặt lên tầng). */
  potBag: PotInstance[];
  nextUid: number;
  storageCapacity: number;
  storageUpgrades: number;
  orders: OrderSlot[];
  nextOrderId: number;
  rng: Record<RngStream, number>;
  stats: Counts<StatKey>;
  daily: DailyState;
  balloon: BalloonState;
}

// ---------- Sự kiện và kết quả ----------

export type GameEvent =
  | { type: 'planted'; floor: number; slot: number; plantId: PlantId }
  | {
      type: 'harvested';
      floor: number;
      slot: number;
      plantId: PlantId;
      qty: number;
      xp: number;
      /** Vàng thêm từ chỉ số chậu. */
      gold: number;
      /** Bị sâu ăn mất một phần. */
      nibbled: boolean;
    }
  | {
      type: 'pestCaught';
      floor: number;
      slot: number;
      pestId: PestId;
      by: 'player' | 'pet' | 'friend';
      xp: number;
      gold: number;
      items: Counts<ChestItemId>;
    }
  | { type: 'potPlaced'; floor: number; slot: number; potId: PotId; uid: number }
  | { type: 'speedUp'; floor: number; slot: number; ruby: number }
  | { type: 'bought'; item: 'seed'; id: PlantId; qty: number; gold: number }
  | { type: 'bought'; item: 'pot'; id: PotId; qty: number; gold: number }
  | { type: 'sold'; item: BarnItemId; qty: number; gold: number }
  | { type: 'storageUpgraded'; capacity: number }
  | { type: 'floorUnlocked'; floor: number }
  | { type: 'orderDelivered'; index: number; gold: number; xp: number }
  | { type: 'orderDiscarded'; index: number }
  | { type: 'ordersArrived'; count: number }
  | { type: 'levelUp'; level: number; gold: number; ruby: number }
  | { type: 'machineBuilt'; floor: number; slot: number; machineId: MachineId; gold: number }
  | { type: 'machineUpgraded'; floor: number; slot: number; machineId: MachineId; level: number }
  | { type: 'jobStarted'; floor: number; slot: number; recipe: RecipeId }
  | { type: 'jobCanceled'; floor: number; slot: number; recipe: RecipeId }
  | { type: 'goodsCollected'; floor: number; slot: number; items: Counts<GoodId>; xp: number }
  | { type: 'machineSpeedUp'; floor: number; slot: number; ruby: number }
  | { type: 'slotsSwapped'; from: { floor: number; slot: number }; to: { floor: number; slot: number } }
  | { type: 'potForged'; floor: number; slot: number; pot: PotInstance; xp: number }
  | { type: 'potStored'; floor: number; slot: number; uid: number }
  | { type: 'potSold'; uid: number; gold: number }
  | { type: 'potSalvaged'; uid: number; items: Counts<ChestItemId> }
  | { type: 'dailyReset'; day: number }
  | { type: 'loginClaimed'; position: number; reward: Reward }
  | { type: 'questCompleted'; index: number; kind: QuestKind }
  | { type: 'questClaimed'; index: number; reward: Reward }
  | { type: 'questBonusClaimed'; reward: Reward }
  | { type: 'questRerolled'; index: number; ruby: number }
  | { type: 'crateFilled'; index: number; id: BarnItemId; qty: number; gold: number; xp: number }
  | { type: 'balloonArrived'; crates: number }
  | { type: 'balloonDeparted'; filled: number }
  | { type: 'balloonSent'; completed: boolean; reward: Reward };

export const ACTION_ERRORS = [
  'INVALID',
  'NOT_ENOUGH_GOLD',
  'NOT_ENOUGH_RUBY',
  'LEVEL_TOO_LOW',
  'NO_SEED',
  'NO_POT',
  'NOT_A_POT',
  'POT_NOT_FOUND',
  'POT_BAG_FULL',
  'SLOT_OCCUPIED',
  'SLOT_BUSY',
  'NOTHING_PLANTED',
  'NOT_READY',
  'ALREADY_READY',
  'STORAGE_FULL',
  'NOT_ENOUGH_ITEMS',
  'NOT_SELLABLE',
  'NO_ORDER',
  'MAX_FLOORS',
  'MAX_LEVEL',
  'NO_PEST',
  'NOTHING_TO_DO',
  'NOT_A_MACHINE',
  'MACHINE_OWNED',
  'QUEUE_FULL',
  'NOTHING_TO_COLLECT',
  'NO_JOB',
  'JOB_STARTED',
  'CANNOT_SELL',
  'CANNOT_SALVAGE',
  'ALREADY_CLAIMED',
  'QUEST_NOT_DONE',
  'FEATURE_LOCKED',
  'BALLOON_AWAY',
  'CRATE_FILLED',
] as const;
export type ActionError = (typeof ACTION_ERRORS)[number];

export type ActionResult =
  { ok: true; state: GameState; events: GameEvent[] } | { ok: false; error: ActionError };
