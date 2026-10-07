export const PLANT_IDS = [
  'rose',
  'sunflower',
  'strawberry',
  'lavender',
  'lily',
  'apple',
  'banana',
  'coconut',
] as const;
export type PlantId = (typeof PLANT_IDS)[number];

export const POT_IDS = ['clay', 'ceramic', 'porcelain'] as const;
export type PotId = (typeof POT_IDS)[number];

export interface PlantedCrop {
  plantId: PlantId;
  plantedAt: number;
  /** Thời gian lớn đã tính bonus chậu lúc trồng, để đổi config không làm hỏng save cũ. */
  growMs: number;
}

export interface Pot {
  potId: PotId;
  plant: PlantedCrop | null;
}

export interface Floor {
  /** Luôn có SLOTS_PER_FLOOR phần tử; null là ô trống chưa đặt chậu. */
  slots: (Pot | null)[];
}

export interface OrderItem {
  plantId: PlantId;
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

export type Counts<K extends string> = Partial<Record<K, number>>;

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
  crops: Counts<PlantId>;
  potStock: Counts<PotId>;
  storageCapacity: number;
  storageUpgrades: number;
  orders: OrderSlot[];
  nextOrderId: number;
  rngSeed: number;
}

export type GameEvent =
  | { type: 'planted'; floor: number; slot: number; plantId: PlantId }
  | { type: 'harvested'; floor: number; slot: number; plantId: PlantId; qty: number; xp: number }
  | { type: 'potPlaced'; floor: number; slot: number; potId: PotId }
  | { type: 'speedUp'; floor: number; slot: number; ruby: number }
  | { type: 'bought'; item: 'seed' | 'pot'; id: PlantId | PotId; qty: number; gold: number }
  | { type: 'sold'; plantId: PlantId; qty: number; gold: number }
  | { type: 'storageUpgraded'; capacity: number }
  | { type: 'floorUnlocked'; floor: number }
  | { type: 'orderDelivered'; index: number; gold: number; xp: number }
  | { type: 'orderDiscarded'; index: number }
  | { type: 'ordersArrived'; count: number }
  | { type: 'levelUp'; level: number; gold: number; ruby: number };

export type ActionError =
  | 'INVALID'
  | 'NOT_ENOUGH_GOLD'
  | 'NOT_ENOUGH_RUBY'
  | 'LEVEL_TOO_LOW'
  | 'NO_SEED'
  | 'NO_POT'
  | 'NO_POT_STOCK'
  | 'SLOT_OCCUPIED'
  | 'SLOT_BUSY'
  | 'NOTHING_PLANTED'
  | 'NOT_READY'
  | 'ALREADY_READY'
  | 'STORAGE_FULL'
  | 'NOT_ENOUGH_CROPS'
  | 'NO_ORDER'
  | 'MAX_FLOORS';

export type ActionResult =
  { ok: true; state: GameState; events: GameEvent[] } | { ok: false; error: ActionError };
