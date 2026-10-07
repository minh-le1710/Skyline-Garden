# Milestone 4 design: social features in both modes (offline NPC neighbors and a self-hosted server)

Target repo: `/home/user/Skyline-Garden`. I read every file the design touches: `src/game/*`, `src/core/Game.ts`, `GardenView`, `Picker`, `InputController`, the UI panels, the configs, the tests and the existing plan file.

---

## 0. Key decisions

| Topic                      | Decision                                                                                                                                                                                                                                                                                   | Why                                                                                                                                                                                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Anti-cheat model           | **The server holds the real state and replays a log of commands** through the same `src/game` code. Snapshots are accepted only once, when importing a guest save into an empty cloud account, and only after plausibility checks.                                                         | Every action is already a pure function of `(state, args, now)`. Replaying them gives exact validation. Snapshot checks cannot catch "sold crops you never had".                                                                                 |
| How the client syncs       | The client applies changes optimistically and **rebases**: keep the last server-confirmed `base` state and a `pending` list of commands; current state = replay(base, pending). Every server reply sets a new base, then the client replays the commands the server has not yet confirmed. | One simple mechanism covers: offline play while logged in, server-side changes (an item sold to a player, help received), a second device, and lost replies on retry.                                                                            |
| Clock ticks                | Clock ticks that change state are **written to the log** as `{type:'tick'}`. Every command runs `tick` first, through a shared `step()`.                                                                                                                                                   | The server replays exactly what the client did. M2/M3 tick logic does not have to be "chunking-invariant" (give the same result whether time is processed in one big step or many small ones).                                                   |
| Changes made by the server | Separate pure commands (`ServerCommand`) that the server alone applies, for example buy, help reward, help received. Clients that submit them are rejected.                                                                                                                                | Changes that cross two accounts are done in one SQLite transaction, with no awaits inside.                                                                                                                                                       |
| Repo layout                | npm workspaces: the root package stays the client, plus a new **`server/`** workspace. `src/game` and the new `src/shared` are **imported in place** through an alias (`@game`, `@shared`) and bundled with the **Vite SSR build** (no new bundler). No `packages/game` extraction.        | No changes to the ~40 existing imports and tests. Vite and Vitest resolve the alias the same way. Typechecking the server without the DOM library is a free purity check on `src/game`.                                                          |
| Database                   | better-sqlite3 behind a small `Db` interface (`prepare` / `exec` / `tx`).                                                                                                                                                                                                                  | It is synchronous, so a transaction cannot be interleaved with another request: atomic buys with no race conditions. Node 22.22's built-in `node:sqlite` works here without a flag (I checked), so it is the fallback if the native build fails. |
| Passwords and sessions     | `node:crypto` scrypt; opaque Bearer tokens stored as SHA-256 hashes.                                                                                                                                                                                                                       | No native argon2. Bearer headers avoid cookie and CSRF problems between the GitHub Pages origin and the server.                                                                                                                                  |
| Social service             | `SocialService` interface with `LocalSocial` (NPCs, all pure game logic, validated by the server too) and `RemoteSocial` (HTTP). A `SocialHub` routes each call by neighbor id prefix (`npc:` / `p:`) and merges lists.                                                                    | NPCs work offline and also online, where they fill out a small player base. Game rules never depend on which mode is active.                                                                                                                     |

---

## 1. Prerequisites in `src/game` for server replay (do these first, ideally as the first step of M2)

M2 and M3 will add about 20 actions. If the command layer exists before then, nothing has to be done twice. **Ordering dependency: tell the M2 design.**

### 1.1 Command layer: new file `src/game/commands.ts`

```ts
export type ClientCommand =
  | { type: 'tick' }
  | { type: 'buySeed'; plantId: PlantId; qty: number }
  | { type: 'buyPot'; potId: PotId; qty: number }
  | { type: 'placePot'; floor: number; slot: number; potId: PotId }
  | { type: 'plant'; floor: number; slot: number; plantId: PlantId }
  | { type: 'harvest'; floor: number; slot: number }
  | { type: 'speedUp'; floor: number; slot: number }
  | { type: 'sellCrop'; plantId: PlantId; qty: number }
  | { type: 'upgradeStorage' }
  | { type: 'unlockFloor' }
  | { type: 'deliverOrder'; index: number }
  | { type: 'discardOrder'; index: number }
  // M2/M3 commands are added here
  // M4:
  | { type: 'listStall'; slot: number; itemId: TradeItemId; qty: number; price: number }
  | { type: 'cancelListing'; slot: number }
  | { type: 'collectStall'; slot: number }
  | { type: 'unlockStallSlot' }
  | { type: 'helpNpc'; npcId: NpcId; floor: number; slot: number }
  | { type: 'buyNpcListing'; npcId: NpcId; index: number }
  | {
      type: 'debugGrant';
      gold?: number;
      ruby?: number;
      level?: number;
      crops?: Counts<PlantId>;
      seeds?: Counts<PlantId>;
    };

export type ServerCommand =
  | {
      type: 'stallSoldToPlayer';
      slot: number;
      listingId: number;
      at: number;
      buyerId: number;
      buyerName: string;
    }
  | {
      type: 'marketPurchase';
      sellerId: number;
      sellerName: string;
      listingId: number;
      itemId: TradeItemId;
      qty: number;
      price: number;
      at: number;
    }
  | { type: 'helpReward'; targetId: number; floor: number; slot: number; kind: HelpKind; at: number }
  | {
      type: 'helpReceived';
      floor: number;
      slot: number;
      kind: HelpKind;
      plantedAt: number;
      helperName: string;
      at: number;
    };

export interface LogEntry {
  seq: number;
  t: number;
  cmd: ClientCommand;
}

export function applyCommand(s: GameState, c: ClientCommand, now: number): ActionResult; // switch → existing actions
export function step(s: GameState, c: ClientCommand, now: number): ActionResult {
  const ticked = tick(s, now); // always ok; returns the same object if nothing is due
  if (c.type === 'tick') return ticked;
  const r = applyCommand(ticked.state, c, now);
  return r.ok ? { ok: true, state: r.state, events: [...ticked.events, ...r.events] } : r;
}
export function applyServerCommand(s: GameState, c: ServerCommand): ActionResult; // no tick; time comes only from `at`
export function parseClientCommand(raw: unknown, opts?: { allowDebug?: boolean }): ClientCommand | null;
```

- `parseClientCommand` validates with a hand-written table (no zod): a schema per `type` (field kinds `int>=0`, `posInt`, `plantId`, `potId`, `npcId`, `tradeItemId`); unknown keys are rejected; `ServerCommand` types are rejected; `debugGrant` is accepted only when `allowDebug` is set.

### 1.2 Purity hardening (needed so the server compiles and replays the same code)

- `src/game/save.ts`: `type KeyValueStore = Pick<Storage, ...>` becomes a structural interface `{ getItem(k: string): string | null; setItem(k: string, v: string): void }`. `Storage` is a DOM type, and the server's tsconfig has no DOM library.
- `src/game/time.ts`: **move `Clock` to `src/core/Clock.ts`** (it calls `Date.now`); `formatDuration` stays. Add `serverOffsetMs` to Clock (see 3.3). Update the imports in `Game.ts` and `debug.ts`.
- `src/game/state.ts`: `createNewGame(now, seed)`: **seed becomes required**. The `Math.random()` default moves to `Game.ts`.
- `eslint.config.js`, for `src/game/**` and `src/shared/**`:
  - add `no-restricted-globals: window, document, localStorage, navigator, fetch`;
  - add `no-restricted-properties: Date.now, Math.random, performance.now`.
- `src/game/orders.ts` `fillOrders`: fill due slots sorted by `(readyAt, index)`. This is not strictly needed now that ticks are logged, but it makes catch-up after a long absence stable. Recommend the same "process due items in time order" rule to M2 (machines, pests, balloon).

### 1.3 New pure helpers

- `src/game/version.ts`: `export const RULES_VERSION = 1`. **Bump it whenever any config number or action meaning changes.** The server rejects sync from clients on a different rules version.
- `src/game/hash.ts`: `stableStringify` (sorted keys, skips `undefined`, normalizes `-0`) + `cyrb53` → `stateHash(state)`, **excluding `lastSeenAt`**. `Game.save` overwrites `lastSeenAt` outside any command. The hash only detects divergence; it is not a security feature.
- `src/game/calendar.ts`: `DAY_OFFSET_MS = 7*3600_000` (fixed UTC+7), `dayIndex(t)`, `dayStart(day)`, `weekIndex(t)` (Monday start: `floor((dayIndex(t)+3)/7)`). **M2 daily quests must use the same helper (shared dependency).**
- `src/game/rng.ts`: add `hashSeed(...parts: (string|number)[]): number` for per-NPC, per-day seeds that do not consume `state.rngSeed`.

### 1.4 `Game.ts` refactor (16 call sites)

- `run(closure)` becomes `exec(cmd: ClientCommand, opts)`. Call sites: InputController ×5, ShopPanel ×3, UnlockDialog, PotInfo ×2, OrdersPanel ×2, StoragePanel ×2, plus `update()`.
- `exec` does three things:
  - computes `now = max(clock.now(), lastT)`, so time never goes backwards;
  - runs `step`;
  - on success with a new state, calls `this.onCommand?.({seq, t: now, cmd})`. A tick that changes nothing returns the same state and is not logged.
- Startup: the constructor no longer ticks. `start()` runs `exec({type:'tick'})` after the sync hook is attached.
- New `replaceState(state, reason)`:
  - sets the state signal and emits a new `AppEvent` `{type:'stateReplaced'; reason: 'sync'|'conflict'|'login'}`;
  - GardenView resyncs without pop animations;
  - panels that hold indices (orders, stall) close.
- Debug `patch()`:
  - in remote mode it sends `exec({type:'debugGrant',…})`, which the server accepts only with `ALLOW_DEBUG=1`;
  - otherwise it patches locally as now. On a server the next sync then reverts it, which is the intended anti-cheat behavior and is covered by an E2E test.

### 1.5 Cross-milestone rule (tell M2 and M3)

- Anything that changes `GameState` must be a `ClientCommand`. Ticks must stay pure functions of `(state, now)`.
- Cosmetic flags (tutorial step, dialogs seen) live **outside** GameState in local settings.
- Anything that grants rewards (achievement or quest claims, mine digs) is a command.
- The M3 mine minigame must be turn-based and draw from the state's RNG. Real-time skill results cannot be checked on the server.

---

## 2. New game logic (pure): roadside stall, NPC neighbors, help

### 2.1 Types (added to `types.ts`)

```ts
export type TradeItemId = PlantId; // widens to M2's ItemId (crops + goods + materials) once it exists
export type HelpKind = 'water' | 'bug'; // 'bug' needs M2 pests; until then only 'water'
export type BuyerRef = { kind: 'npc'; npcId: NpcId } | { kind: 'player'; playerId: number; name: string };
export interface StallListing {
  id: number;
  itemId: TradeItemId;
  qty: number;
  price: number /* total for the bundle */;
  listedAt: number;
  npcBuyAt: number | null; // decided when listed, using state.rngSeed; null = too expensive for NPCs
  sold: { at: number; buyer: BuyerRef } | null;
}
export interface StallState {
  slots: (StallListing | null)[];
  nextListingId: number;
} // slots.length = unlocked slots
export interface SocialState {
  day: number;
  helpsToday: number;
  helped: string[]; // today's help keys: "npc:bamay:1:4" / "p:42:1:4"
  npcBought: string[]; // "bamay:2" bought today from NPC stalls
  week: number;
  weekXp: number; // updated in addXp(); feeds the weekly leaderboard on both sides
  npcVisitAt: number; // next time an NPC visits your garden
}
// GameState += { stall: StallState; social: SocialState }
```

**New `GameEvent`s:**

- `listed {slot,itemId,qty,price,npcBuyAt}`
- `listingCancelled {slot,itemId,qty}`
- `stallSold {slot,itemId,qty,price,buyer}`
- `stallCollected {slot,gold}`
- `stallSlotUnlocked {slots}`
- `helped {neighborId,floor,slot,kind,xp,gold,bonus?}`
- `npcBought {npcId,itemId,qty,price}`
- `npcVisited {npcId,floor,slot}`
- `marketBought {sellerName,itemId,qty,price}`
- `helpReceived {helperName,floor,slot,kind}`

**New `ActionError`s:**

- `STALL_FULL`, `NO_LISTING`, `LISTING_SOLD`, `NOT_SOLD`, `BAD_PRICE`
- `MAX_STALL_SLOTS`, `HELP_LIMIT`, `ALREADY_HELPED`, `NOTHING_TO_HELP`
- `WRONG_DAY`, `ALREADY_BOUGHT`, `NOT_TRADABLE`

Reused: `LEVEL_TOO_LOW`, `NOT_ENOUGH_CROPS`, `STORAGE_FULL`, `NOT_ENOUGH_GOLD`. Each new error needs an `error.*` key in `vi.ts`.

### 2.2 Config: `src/game/config/social.ts` and `config/npcs.ts`

**Stall slots and trading limits**

- `STALL_UNLOCK_LEVEL = 3`, `STALL_START_SLOTS = 4`.
- `STALL_SLOT_UNLOCKS` (slots 5 to 8): `[{gold:800,level:6},{gold:2000,level:10},{ruby:10,level:12},{ruby:20,level:15}]`.
- `STALL_MAX_QTY = 10`, `MIN_TRADE_LEVEL_PLAYER = 4` (minimum level to buy from real players; checked on the server).

**Prices.** `itemBaseValue(id) = PLANTS[id].sellPrice` (M2 adds goods' values). Allowed price is `[ceil(base*qty*0.5), floor(base*qty*3)]`; the suggested price is `round(base*qty*1.2)`.

**When NPC traders buy.** NPCs buy only if `ratio = price/(base*qty) ≤ 1.5`. The delay is `(3 + 87*((ratio-0.5)/1.0)^2)` minutes, times a random factor in 0.85–1.15: about 3 min at 0.5×, about 25 min at 1×, 90 min at 1.5×. NPCs paying up to 1.5× matches the owl orders' 1.5× multiplier.

**Help**

- `HELP_PER_DAY = 15`, `HELP_PER_NEIGHBOR_PER_DAY = 5`.
- Watering: `WATER_REDUCE_PCT = 5`, capped at 10 minutes.
- Reward: `helpReward(level) = { xp: 1 + floor(level/8), gold: 4 + 2*level }`, plus a 15% chance of a bonus seed (an unlocked plant) drawn from `state.rngSeed`.

**NPC visits.** `NPC_VISIT_INTERVAL = [3h, 6h]`; at most 4 catch-up visits per tick.

**NPC roster (original, sky-themed).** Each NPC has a name key in `npc.<id>.name`, an emoji avatar, a color, a `levelOffset`, and a list of favorite plants:

| id            | Name          | Avatar | Level offset |
| ------------- | ------------- | ------ | ------------ |
| `bamay`       | Bà Mây        | ☁️     | +3           |
| `besuong`     | Bé Sương      | 💧     | −1           |
| `ongcauvong`  | Ông Cầu Vồng  | 🌈     | +6           |
| `cosaobang`   | Cô Sao Băng   | 🌠     | +1           |
| `anhsam`      | Anh Sấm       | ⚡     | +2           |
| `chihoanghon` | Chị Hoàng Hôn | 🌇     | 0            |
| `cutrang`     | Cụ Trăng      | 🌙     | +8           |
| `chugio`      | Chú Gió       | 🍃     | −2           |

These are not VNG names.

### 2.3 Stall actions: `src/game/stall.ts`

- **`listStall(s, slot, itemId, qty, price, now)`**
  - checks: level, the slot exists and is empty, `1≤qty≤10`, price within range, enough items;
  - removes the items from storage, which frees capacity;
  - sets `npcBuyAt` using the state RNG.
- **`cancelListing(s, slot)`**
  - errors: `NO_LISTING`; `LISTING_SOLD` if already sold; `STORAGE_FULL` if the items do not fit back;
  - returns the items to storage.
- **`collectStall(s, slot)`**: requires `sold`; adds `gold += price`; frees the slot.
- **`unlockStallSlot(s)`**: pays per `STALL_SLOT_UNLOCKS`.
- **`processStallNpcBuys(s, now, events)`** (called from `tick`): every unsold listing with `npcBuyAt ≤ now` is marked sold to an NPC. The buyer is `NPC_IDS[hashSeed(listingId) % n]`.

### 2.4 NPC neighbors: `src/game/npc.ts`

- **`npcLevel(id, playerLevel)`**: `clamp(playerLevel + offset, 1, MAX_LEVEL)`, so neighbors stay relevant as the player levels.
- **`npcGarden(id, day, playerLevel)`** returns `{ floors: Floor[]; thirsty: Set<"f:s"> }`, deterministic from `hashSeed(id, day)`:
  - the number of floors follows `FLOOR_UNLOCKS` for that level;
  - pot types and plants are chosen by level, favoring the NPC's favorite plants;
  - each plant's `plantedAt` is spread over the day, so plants visibly grow;
  - about one third of planted pots are "thirsty", a fixed set for the whole day.
- **`npcStall(id, day, playerLevel)`**: 2–4 crop listings priced at 1.2–2.0× base value. Buying crops is useful for finishing owl orders.
- **`helpNpc(s, npcId, floor, slot, now)`**:
  - resets the daily counters when `dayIndex(now) !== s.social.day`;
  - checks the per-day cap, the per-neighbor cap, `helped`, and that the slot is in `thirsty`;
  - grants the reward through the shared `grantHelpReward(s, key, now, events)`.
- **`buyNpcListing(s, npcId, index, now)`**: the listing must be today's and not already in `npcBought`; checks gold and storage space.
- **`processNpcVisits(s, now, events)`** (called from `tick`): while `now ≥ npcVisitAt` and fewer than 4 visits have run, pick a growing plant with the RNG and apply `waterBoost` to it; emits `npcVisited`.
- **`waterBoost(plant)`**: shared with remote help.
- **Projections used by visit views and by the server:**
  - `publicGarden(state)` → `Floor[]`;
  - `helpTargetsFor(state, day, helpedKeysToday)` → `HelpTarget[]`.

### 2.5 Server-only commands: `src/game/social.ts`

All changes the server makes to a player's state should **only help the player**, so that replaying pending commands on top of them never fails. The one exception is `stallSold` versus a pending `cancelListing`; that conflict is intended and dropped.

- **`stallSoldToPlayer`**: if the slot still holds an unsold listing with that `listingId`, set `sold = {at, buyer: player}`; otherwise do nothing.
- **`marketPurchase`** (buyer side):
  - errors: `NOT_ENOUGH_GOLD`, `STORAGE_FULL`, `LEVEL_TOO_LOW` (below `MIN_TRADE_LEVEL_PLAYER`);
  - otherwise deducts gold and adds the items.
- **`helpReward`**: the same caps as `helpNpc`, keyed `p:<id>:f:s`, using `at` as the time.
- **`helpReceived`**:
  - `water`: if `plant.plantedAt` still matches and the plant is not ready, apply `waterBoost`;
  - `bug` (M2): remove the pest;
  - otherwise do nothing.

### 2.6 Changes to `tick`

`tick = fillOrders (sorted) + processStallNpcBuys + processNpcVisits (+ M2 processes)`. It still returns **the same state object when nothing is due**, by checking first; logging depends on this.

`addXp` also updates `social.week` and `weekXp` using `weekIndex(now)`.

### 2.7 Save migration

M4 raises `SAVE_VERSION` by one over whatever M3 leaves (expected: 3 → 4):

```ts
MIGRATIONS[3] = (raw) => ({
  ...raw,
  stall: { slots: Array.from({ length: STALL_START_SLOTS }, () => null), nextListingId: 1 },
  social: {
    day: -1,
    helpsToday: 0,
    helped: [],
    npcBought: [],
    week: -1,
    weekXp: 0,
    npcVisitAt: (raw.lastSeenAt as number) + 3 * 3600_000,
  },
});
```

- `createNewGame` gets the same defaults.
- `looksValid` additionally checks `isRecord(d.stall) && Array.isArray(d.stall.slots) && d.stall.slots.length <= 8 && isRecord(d.social)`.
- The server uses the same `deserialize`, so cloud saves migrate when they are loaded and are written back at the new version.
- Separately, bump `RULES_VERSION` in the same release.

---

## 3. Client: social service, mode selection, sync

### 3.1 New folders

- `src/core/Clock.ts`
- `src/net/`: `ApiClient.ts`, `SyncEngine.ts`, `settings.ts`, `authStore.ts`
- `src/social/`: `types.ts`, `LocalSocial.ts`, `RemoteSocial.ts`, `SocialHub.ts`, `VisitSession.ts`
- `src/shared/api.ts`: pure request/response types (DTOs) and route constants, imported by the server through `@shared`.

```ts
// src/social/types.ts
export type NeighborId = `npc:${NpcId}` | `p:${number}`;
export interface NeighborSummary {
  id: NeighborId;
  name: string;
  level: number;
  avatar: string;
  kind: 'npc' | 'friend' | 'suggested';
  helpable: number | null;
  lastActiveAt?: number;
}
export type Outcome = { ok: true; events: GameEvent[] } | { ok: false; error: ActionError | NetError };
export type NetError =
  'OFFLINE' | 'UNAUTHORIZED' | 'RATE_LIMITED' | 'OUTDATED' | 'GONE' | 'CONFLICT' | 'SERVER';
export interface SocialService {
  readonly kind: 'local' | 'remote';
  neighbors(): Promise<NeighborSummary[]>;
  visit(id: NeighborId): Promise<GardenSnapshot>; // GardenSnapshot defined in @shared/api
  help(id: NeighborId, t: HelpTarget): Promise<Outcome>;
  buy(id: NeighborId, listing: PublicListing): Promise<Outcome>;
  market(filter?: { itemId?: TradeItemId }): Promise<MarketEntry[]>;
  leaderboard(board: 'level' | 'weekly', scope: 'global' | 'friends'): Promise<LeaderboardView>;
}
export interface FriendService {
  myCode(): string | null;
  add(code: string): Promise<Outcome>;
  remove(id: number): Promise<Outcome>;
}
```

**`LocalSocial(game)`:**

- `neighbors`: `NPC_ROSTER` with `npcLevel`.
- `visit`: built from `npcGarden` and `npcStall`.
- `help`: `game.exec({type:'helpNpc'})`.
- `buy`: `game.exec({type:'buyNpcListing'})`.
- `market`: today's NPC stalls.
- `leaderboard`: the NPCs plus the player. NPC weekly XP is pseudo-random from `(npc, week, level)`; the player's comes from `state.social.weekXp`.

**`RemoteSocial(api, sync)`:** REST calls. Calls that change state go through `sync.serverOp()` (see 3.3).

**`SocialHub`:**

- routes by id prefix;
- `neighbors()` = real friends, then suggested players, then NPCs;
- `market()` = player listings first, then NPC listings;
- `leaderboard` = remote when online, local otherwise.

**`GardenSnapshot`** (in `@shared/api`):

```ts
{
  owner: { id, name, level, kind },
  floors: Floor[],
  stall: (PublicListing | null)[],
  helpTargets: HelpTarget[],
  helpsLeftToday: number,
  serverTime: number,
}
```

### 3.2 Mode selection and server URL

`src/net/settings.ts` resolves the server URL, in this order:

1. `?server=` URL parameter (used by E2E tests);
2. `localStorage['skyline-garden/settings'].serverUrl`, from the Settings panel's "Máy chủ" field;
3. `import.meta.env.VITE_SERVER_URL`;
4. `''`.

The special value `'same-origin'` means `location.origin`, for a Docker image that also serves the client.

At startup:

- **Empty URL:** `LocalSocial` only. The account UI is hidden; Settings shows "Chưa cấu hình máy chủ".
- **URL set:**
  - probe `GET /api/health` with backoff (5 s up to 5 min);
  - compare `rulesVersion`; if it differs, sync status becomes `outdated` (banner "Cập nhật trò chơi để đồng bộ"), the game stays playable and commands keep being logged;
  - with a saved token, start the `SyncEngine`;
  - without a token, the Social panel shows "Đăng nhập để chơi cùng bạn bè"; NPC features keep working.

Order of work in `main.tsx`:

1. settings, auth store, sync record;
2. compute the initial state: `replay(base, pending)` if a sync record exists for the account, otherwise the `save` key;
3. `new Game(storage, { initialState, seed })`;
4. `sync.attach(game)`, which sets `game.onCommand`;
5. `SocialHub`, then `render(App)`, then `game.start()`.

**Single tab.** `navigator.locks.request('skyline-game', {ifAvailable:true})`. If another tab holds the lock, show "Game đang mở ở tab khác". This also fixes an existing M1 bug: two tabs overwrite each other's save.

### 3.3 `SyncEngine`

**Stored in localStorage:**

- `skyline-garden/auth`: `{serverUrl, token, accountId, username}`
- `skyline-garden/device`: a `crypto.randomUUID()`
- `skyline-garden/sync/<host>/<accountId>`: `{rev, base, pending: LogEntry[], nextSeq, lastT, lastNoticeId}`, written with the same debounce as the game save. The `save` key keeps holding the current state, so offline play is unchanged.

**Status:** `status: Signal<'disabled'|'idle'|'pending'|'syncing'|'offline'|'outdated'|'loggedOut'|'error'>`, shown as a dot in the HUD.

**`record(entry)`:** appends to `pending`; schedules a push 3 s later, every 30 s, and on `visibilitychange: hidden` (via `fetch(..., {keepalive:true})`).

**`push()`** sends:

```
POST /api/sync { rulesVersion, saveVersion, deviceId, baseRev, entries, expectHash: stateHash(current) }
```

The reply is `{rev, ackSeq, serverTime, hash, state?, dropped[], notices[]}`.

**`adopt(rev, state, ackSeq)`:**

- `base = state`; drop pending entries with `seq ≤ ackSeq`;
- `current = replay(base, remaining)`, dropping any entry that now fails;
- if the result differs from the current state, call `game.replaceState`.
- If the server omitted `state` because the hashes matched, `base` = the client's own replay result.

**`serverOp(fn)`** (buy, help):

- tries a push first;
- then calls `fn()`, which returns `{rev, state, events}`;
- adopts the result and emits the returned events (for fly-up animations and toasts).

**Clock offset:**

- every reply carries `serverTime`;
- `clock.serverOffsetMs` = an exponential moving average of `serverTime − (send+recv)/2`, only applied when off by more than 1 s;
- log timestamps are still clamped to never go backwards.

**Notices:** toasts such as "Bob đã mua 5 Hoa hồng", "Lan tưới cây giúp bạn", plus the Mailbox list.

**Polling:** `GET /api/sync/head` every 60 s while the page is visible, to pick up sales and help.

**Pending cap:** at most 20,000 entries. Past that, logging stops and the conflict dialog appears on the next connection.

### 3.4 Conflict handling

| Situation                                                                   | Server behavior                                                          | Client behavior                                                                                                                     |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `baseRev == rev` and everything replays                                     | **Strict** replay, commit                                                | Keep its state (no state sent if the hash matched)                                                                                  |
| `baseRev == rev` but a command fails or a timestamp is invalid              | 422 `DIVERGED` / `CLOCK_AHEAD`, `suspicion++`, sends server state        | Adopt server state, drop pending, toast "Đã khôi phục tiến độ theo máy chủ"                                                         |
| `baseRev == rev`, replay fine, hash differs                                 | Commit the server result, log `hash_mismatch`                            | Adopt (fixes local edits or a determinism bug)                                                                                      |
| `baseRev < rev` (the server changed this account, or another device synced) | **Rebase** replay: drop failing or out-of-date entries                   | Adopt. If anything was dropped, open `SyncConflictDialog` ("N thao tác bị bỏ…"); the previous state goes to `skyline-garden/backup` |
| Retry after a lost reply                                                    | Entries with `seq ≤ device_last_seq` are skipped (idempotent)            | Adopt                                                                                                                               |
| First login on a device that has a guest save                               | —                                                                        | Dialog: "Dùng vườn trên mây" (guest save goes to backup) or "Tiếp tục chơi offline" (log out)                                       |
| Register with a guest save                                                  | `POST /api/auth/register {importState}`: plausibility checks, then rev=1 | Adopt                                                                                                                               |
| 401                                                                         | —                                                                        | Status `loggedOut`; keep pending; after logging in to the same account, push                                                        |
| 426 rules mismatch                                                          | —                                                                        | Status `outdated`; keep logging; after the PWA update, replay pending under the new rules                                           |
| Log in to a different account                                               | —                                                                        | The old sync record stays; the local state goes to backup; adopt the new account's cloud state                                      |

### 3.5 Account UI

- **`AccountPanel` (Sheet):**
  - Login and Register tabs: username matching `[a-z0-9_]{3,20}`, password 8–128 characters, display name;
  - a "Tải vườn hiện tại lên mây" checkbox (on by default);
  - status, friend code with copy button, "Đăng xuất", "Xóa tài khoản";
  - a collapsible "Máy chủ" URL field.
- **`SettingsPanel`:** language and server URL. Coordinate with M3, which may add a settings panel for sound.
- **HUD additions:** a 👥 social button and a sync status dot (`data-testid="sync-status"`).

---

## 4. Roadside stall (sạp hàng): UX and 3D

- **3D:** `src/render/GroundIslet.ts`, a small cloud island under floor 0 at `ISLET_Y = -4.0`. It holds:
  - `StallView` (`src/render/StallView.ts`): a procedural cart (box counter, striped awning from vertex colors, cylinder wheels), showing small crop models from `buildPlant(..).bloom` for each listing and a "SOLD" sign sprite;
  - a mailbox (opens the Social panel);
  - a signboard (opens the market board).
- **Layout and input:**
  - `layout.ts`: `stallHitBox`, `mailboxHitBox`, `boardHitBox`;
  - `GardenView.bounds.bottom` extends down to the island;
  - `PickTarget` gains `{kind:'stall'|'mailbox'|'board'}`.
- **`StallPanel`:**
  - a grid of slots: empty (tap opens `ListItemDialog`), listed (countdown "Thương lái ghé sau ~12 phút" or "Chỉ người chơi mua", cancel button), sold (buyer name, "Thu tiền" button), locked (unlock cost);
  - also reachable as a tab in StoragePanel;
  - toolbar badge = number of sold slots.
- **`ListItemDialog`:**
  - item picker from storage, quantity stepper 1–10;
  - a price slider limited to the allowed range, defaulting to 1.2×;
  - a live estimate from `npcBuyDelay`.
- **`MarketPanel` ("Bảng tin Chợ Mây"):** listings from players and NPCs, each with "Mua" and "Ghé thăm".
- **`LeaderboardPanel`:** tabs Cấp độ / Tuần này × Toàn server / Bạn bè.
- **`SocialPanel`:** tabs Hàng xóm (NPCs and friends) / Bạn bè (my code, add by code) / Hộp thư (notices).
- **`PanelId` additions:** `'social'|'account'|'settings'|'stall'|'listItem'|'market'|'leaderboard'|'syncConflict'|'visitStall'`.
- **i18n namespaces:** `stall.*`, `market.*`, `social.*`, `account.*`, `sync.*`, `npc.*`, `net.*`.

---

## 5. Visiting a garden (reusing `GardenView`)

- **New `src/render/GardenSource.ts`:**
  ```ts
  export interface GardenSource {
    floors(): readonly Floor[];
    showLockedNext: boolean;
    selected(): SlotRef | null;
    helpTargets(): readonly HelpTarget[];
    events: EventBus<AppEvent> | null;
  }
  ```
- `GardenView(scene, source, tweens)` replaces `this.game.state.value` with `source.floors()`. The home source wraps `Game`; `VisitSession.source` wraps `snapshot: Signal<GardenSnapshot>` and has its own event bus for help bursts.
- **Two GardenView instances.** Home stays alive and hidden with `group.visible=false`, so its state survives without pop animations on return. The visit view is built on enter and disposed on leave; this needs a `dispose()` on FloorView and SlotView.
- `SlotView.update` gets a `helpMark` argument. `HelpMarkers.ts` shows a low-poly water drop or (M2) bug models with a bob animation.
- **Picker:** `pick(x, y, source)` uses `source.floors().length` and only offers the locked floor when `showLockedNext`.
- **CameraScroller:** bounds come from the active view.
- **State and input:**
  - `game.ui.visit: Signal<VisitSession|null>`; `Tool` gains `{kind:'help'}` (watering can).
  - `InputController` in visit mode: tapping a help mark or dragging the help tool across pots calls `social.help()`. Remote calls are queued one at a time and the mark hides optimistically.
  - Harvest, plant and pot tools are disabled.
- **UI swaps while visiting:**
  - `VisitHud`: avatar, name, level, "Lượt giúp còn lại N/15", "🏠 Về nhà";
  - `VisitToolbar`: Help, Their stall (opens `VisitStallPanel` with buy buttons), Back;
  - `SkyBackground.setTint(0xffe9d6)` for a warmer sky;
  - a name banner sprite above the top floor.
- **Remote growth timing:** snapshot `plantedAt` is in server time, and `clock.now()` already includes the server offset.

---

## 6. Server (`/server`)

### 6.1 Layout and build

```
package.json                 + "workspaces": ["server"]; scripts: test:server, typecheck adds `tsc -p server`
server/package.json          @skyline/server: deps fastify@5, @fastify/cors, @fastify/rate-limit (Fastify-5 majors),
                             better-sqlite3; dev: @types/better-sqlite3 (vite/vitest/typescript come from root)
server/tsconfig.json         lib ES2023 (no DOM), types [node], moduleResolution Bundler,
                             paths { "@game": ["../src/game/index.ts"], "@game/*": [...], "@shared/*": ["../src/shared/*"] },
                             include [src, test, ../src/game, ../src/shared]
server/vite.config.ts        build.ssr 'src/main.ts' → dist/server.mjs, target node22, ssr.noExternal true,
                             external ['better-sqlite3']; resolve.alias @game/@shared; test.include test/**/*.test.ts
server/src/
  main.ts  app.ts (buildApp({db, clock, config}) → FastifyInstance)  config.ts  clock.ts (Real/Fake ServerClock)
  db/Db.ts (prepare/exec/tx over better-sqlite3; node:sqlite fallback)  db/migrations.ts (PRAGMA user_version)  db/repo.ts
  auth/password.ts  auth/sessions.ts  auth/plugin.ts (decorateRequest 'account', requireAuth preHandler)
  game/replay.ts  game/accounts.ts (load → deserialize/migrate, save + derived columns)  game/listings.ts  game/antiCheat.ts
  routes/{health,auth,me,sync,friends,players,market,leaderboard,testClock}.ts
server/test/{helpers,auth,sync,replay,import,market,friends,help,leaderboard,ratelimit,migrations}.test.ts
server/Dockerfile  server/Caddyfile  docker-compose.yml (root)  docs/server.md
```

- **Why not a `packages/game` workspace:** it would mean moving files and rewriting about 40 imports plus the ESLint paths, for no benefit. The alias keeps a single source of truth.
- **Cost of this choice:** the Docker build context is the repo root.
- **Dev loop:** `vite build --watch` together with `node --watch dist/server.mjs`.

### 6.2 Database schema (SQLite, WAL, `foreign_keys=ON`, `busy_timeout=5000`)

```sql
accounts(id INTEGER PRIMARY KEY, username TEXT UNIQUE COLLATE NOCASE, display_name TEXT, pass_hash TEXT,
  friend_code TEXT UNIQUE, created_at INT, flagged INT DEFAULT 0, suspicion INT DEFAULT 0, imported INT DEFAULT 0,
  level INT DEFAULT 1, xp INT DEFAULT 0, week INT DEFAULT -1, week_xp INT DEFAULT 0, last_active_at INT)
sessions(token_hash TEXT PRIMARY KEY, account_id INT REFERENCES accounts ON DELETE CASCADE, device_id TEXT,
  created_at INT, expires_at INT, last_used_at INT)
saves(account_id INT PRIMARY KEY REFERENCES accounts ON DELETE CASCADE, rev INT, state_json TEXT, state_hash TEXT,
  last_client_t INT, rules_version INT, updated_at INT)
device_seq(account_id INT, device_id TEXT, last_seq INT, PRIMARY KEY(account_id, device_id))
action_log(account_id INT, rev INT, idx INT, t INT, author TEXT CHECK(author IN('client','server')), cmd_json TEXT,
  PRIMARY KEY(account_id, rev, idx))                                   -- pruned after 14 days
friendships(a INT, b INT, created_at INT, PRIMARY KEY(a, b))            -- both directions stored
listings(seller_id INT, listing_id INT, item_id TEXT, qty INT, price INT, listed_at INT, npc_buy_at INT,
  status TEXT CHECK(status IN('open','sold','gone')), buyer_id INT, sold_at INT, PRIMARY KEY(seller_id, listing_id))
CREATE INDEX listings_open ON listings(status, item_id, listed_at);
help_log(helper_id INT, target_id INT, day INT, floor INT, slot INT, kind TEXT, at INT,
  UNIQUE(target_id, day, floor, slot, kind))                           -- one help of each kind per pot per day, from anyone
notices(id INTEGER PRIMARY KEY, account_id INT, at INT, kind TEXT, payload_json TEXT)
```

### 6.3 Auth

- **Passwords:** `crypto.scrypt` (async), N=2^15, r=8, p=1, 64-byte key, 16-byte salt, stored as `scrypt$15$8$1$<salt>$<hash>`, compared with `timingSafeEqual`. Unknown usernames still verify against a dummy hash so timing does not leak which usernames exist.
- **Login lockout:** 10 failures per username per 15 minutes.
- **Tokens:**
  - 32 random bytes, base64url, sent as `Authorization: Bearer`; the database stores only `sha256`;
  - 30-day sliding expiry, with `last_used_at` written at most hourly;
  - at most 10 sessions per account; the oldest is evicted.
- **Friend codes:** 8 random characters of Crockford base32.
- **Logging:** the pino logger redacts `authorization` and `password`.

### 6.4 Sync validation and anti-cheat (`game/replay.ts`)

For each batch, inside a single synchronous transaction:

1. **Batch-level checks:**
   - `rulesVersion` must equal `RULES_VERSION`, else 426;
   - body ≤ 512 KB and ≤ 1000 entries, else 413;
   - entries with `seq ≤ device_seq` are skipped (idempotent retries).
2. **Per-entry checks:**
   - `parseClientCommand(cmd, {allowDebug: config.ALLOW_DEBUG})` must succeed;
   - `t` must be an integer;
   - `t ≥ last_client_t` (never backwards), else `NON_MONOTONIC`;
   - `t ≤ serverNow + 120 s`, else `CLOCK_AHEAD`;
   - a token bucket over `t` (capacity 60, refills 8 per second) catches command floods, else `RATE`.
3. **Replay:** `state = step(state, cmd, t)`.
   - Strict mode (`baseRev == rev`): any failure rejects the whole batch with 422 and `suspicion++`.
   - Rebase mode: failing entries go into `dropped`.
4. **Commit:**
   - `rev++`; store the state with `lastSeenAt = last_client_t`; append to `action_log`; update `device_seq`;
   - copy `level`, `xp`, `week`, `week_xp` from `state.social` into `accounts`;
   - rebuild that seller's rows in `listings` from `state.stall` (insert new, mark removed open rows `gone`).
5. **Reply:** send the state unless the client's `expectHash` equals the server hash and nothing was dropped.

If `suspicion ≥ 5`, set `flagged = 1`: the account is hidden from leaderboards, the market and suggestions.

**Threats and how they are covered:**

| Threat                                               | Mitigation                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Edited localStorage or debug patches                 | No command exists for them; the server state wins.                                                                                                                                                                                                                                         |
| Forged commands (selling crops you don't have)       | Strict replay fails → 422.                                                                                                                                                                                                                                                                 |
| Device clock pushed forward                          | `CLOCK_AHEAD` rejection, plus the client uses the server offset.                                                                                                                                                                                                                           |
| Backdated commands                                   | Rejected as non-monotonic. Net effect: progress can never outpace real elapsed time.                                                                                                                                                                                                       |
| Submitting server-only commands                      | Rejected by the parser.                                                                                                                                                                                                                                                                    |
| Bots                                                 | HTTP rate limits plus the command bucket. Human-speed bots are accepted as unavoidable.                                                                                                                                                                                                    |
| Double buy race                                      | Synchronous transaction with a status check inside it.                                                                                                                                                                                                                                     |
| Moving gold to a second account through stall prices | Price cap of 3×; at most 5 buys per buyer per seller per day; buyer must be level ≥ 4; flagged accounts excluded.                                                                                                                                                                          |
| Help farming with alt accounts                       | Daily caps stored in the helper's state, the per-pot-per-day unique `help_log`, friends only.                                                                                                                                                                                              |
| Inflated imported save                               | Only into an untouched account. Checks: `deserialize` succeeds; `xp ≤ xpCap(now - createdAt)` (theoretical maximum XP rate from config); `gold ≤ 2000 + 3000*level`; `ruby ≤ 5 + 2*level`; floors allowed for the level; all timestamps ≤ now. Sets `imported=1` and resets `weekXp` to 0. |
| SQL injection                                        | Prepared statements only.                                                                                                                                                                                                                                                                  |
| Brute-force login                                    | Rate limits, scrypt cost, lockout.                                                                                                                                                                                                                                                         |

### 6.5 Endpoints (validated with Fastify JSON schemas)

| Method               | Path                                                         | Auth                      | Notes                                                                                                                           |
| -------------------- | ------------------------------------------------------------ | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| GET                  | `/api/health`                                                | –                         | `{ok, rulesVersion, saveVersion, serverTime, registration}`                                                                     |
| POST                 | `/api/auth/register`                                         | –                         | `{username,password,displayName,deviceId,importState?}` → `{token, me, save:{rev,state}}`                                       |
| POST                 | `/api/auth/login` · `/api/auth/logout`                       | – / ✓                     |                                                                                                                                 |
| GET / PATCH / DELETE | `/api/me`                                                    | ✓                         | DELETE requires the password; cascades, marks listings `gone`                                                                   |
| GET                  | `/api/save`                                                  | ✓                         | `{rev, state, lastClientT, serverTime}`                                                                                         |
| POST                 | `/api/save/import`                                           | ✓                         | Only when the account is untouched (rev ≤ 1 with no client entries)                                                             |
| POST                 | `/api/sync`                                                  | ✓                         | See 6.4                                                                                                                         |
| GET                  | `/api/sync/head?since=`                                      | ✓                         | `{rev, notices}`                                                                                                                |
| GET / POST           | `/api/friends`                                               | ✓                         | POST `{code}` creates a two-way friendship at once (the code is shared on purpose); at most 50 friends                          |
| DELETE               | `/api/friends/:id`                                           | ✓                         |                                                                                                                                 |
| GET                  | `/api/players/suggested`                                     | ✓                         | 10 random active players, not flagged                                                                                           |
| GET                  | `/api/players/:id/garden`                                    | ✓                         | Any player: `GardenSnapshot`, built with `publicGarden` + `helpTargetsFor` + `help_log`                                         |
| POST                 | `/api/players/:id/help`                                      | ✓                         | Friends only. `{floor,slot,kind,plantedAt}`                                                                                     |
| GET                  | `/api/market?item=&cursor=`                                  | ✓                         | Open listings, excluding own and flagged sellers, and `(npc_buy_at IS NULL OR npc_buy_at > now+120s)`; 30 newest, then shuffled |
| POST                 | `/api/market/buy`                                            | ✓                         | `{sellerId, listingId, price}`                                                                                                  |
| GET                  | `/api/leaderboard?board=level\|weekly&scope=global\|friends` | optional                  | Top 100 plus own rank; 60 s in-memory cache                                                                                     |
| POST                 | `/api/test/clock`                                            | `ALLOW_TEST_CLOCK=1` only | `{advanceMs}`                                                                                                                   |

### 6.6 Buy transaction (`db.tx`, no awaits)

1. Load the buyer and the seller. Fail if same account (400), seller flagged, or the per-seller daily cap reached (429).
2. Seller check: the listing in the seller's _state_ stall must have the right id, be unsold, and have `price` equal to the request (409 on mismatch). If `npcBuyAt ≤ now + 120 s`, return 410 (the NPC is buying it).
3. Apply `marketPurchase` to the buyer, mapping action errors to 422. Apply `stallSoldToPlayer` to the seller. Both revs go up and both get `action_log` entries written as `server`.
4. Set the listing row to `sold`; add a notice for the seller.
5. Reply with `{rev, state, events}` for the buyer.

Gold goes to the seller only when the seller later runs `collectStall`, which reads the price from their own state. Items and gold are therefore conserved.

### 6.7 Help transaction

1. Require friendship.
2. Apply `helpReward` to the helper; errors map to 422.
3. The target pot must match `plantedAt` and be helpable (not ready, or has a pest).
4. Insert into `help_log`; a unique-constraint violation returns 409 `ALREADY_HELPED`.
5. Apply `helpReceived` to the target and add a notice.
6. Reply with the helper's `{rev, state, events, helpTargets}`.

### 6.8 Rate limits (`@fastify/rate-limit`)

- Requests are keyed by account id, or by IP when not logged in; `trustProxy` follows `TRUST_PROXY`.

| Scope        | Limit         |
| ------------ | ------------- |
| Global       | 120/min       |
| Auth         | 10/min per IP |
| Sync         | 30/min        |
| Buy          | 30/min        |
| Help         | 60/min        |
| Friends POST | 10/min        |

### 6.9 Configuration (environment variables)

- `PORT` = 8787, `HOST` = 0.0.0.0
- `DB_PATH` = /data/skyline.db (`:memory:` in tests)
- `CORS_ORIGINS`: comma list; defaults to the Pages origin, `http://localhost:5173`, `http://localhost:4173`, `https://localhost` and `capacitor://localhost` (for M5)
- `TRUST_PROXY`, `SESSION_TTL_DAYS` = 30, `ALLOW_REGISTRATION` = true
- `ALLOW_DEBUG` = false, `ALLOW_TEST_CLOCK` = false
- `SERVE_CLIENT` (optional: serve a built `dist/` for the `'same-origin'` setup)
- `LOG_LEVEL`

### 6.10 Docker

- **`server/Dockerfile`, build stage** (`node:22-bookworm-slim` with python3, make and g++ as a fallback for better-sqlite3):
  1. copy the root and server `package*.json`, run `npm ci`;
  2. copy `tsconfig.json`, `src/game`, `src/shared`, `server`, run `npm run -w server build`;
  3. in `/out`, create a minimal `package.json` that pins **only** better-sqlite3 and run `npm install --omit=dev`.
- **Runtime stage:**
  - copies `/out/node_modules` and `server/dist`;
  - runs as `USER node`, with `VOLUME /data` and `EXPOSE 8787`;
  - `HEALTHCHECK` with `node -e fetch('/api/health')`;
  - `CMD node dist/server.mjs`.
- **`docker-compose.yml`:**
  - `server` service (volume `skyline-data:/data`, `restart: unless-stopped`);
  - a `caddy` service under the `tls` profile (Caddyfile `{$DOMAIN} { reverse_proxy server:8787 }`). TLS is required because Pages is served over HTTPS and browsers block mixed content.
- **Backups:** `npm run -w server backup` runs `db.backup()`; documented in `docs/server.md`.

---

## 7. CI and GitHub Pages

- **`ci.yml`:**
  - existing jobs (typecheck, lint, unit, build, e2e) plus a `server` job: `npm ci` → `npm run -w server typecheck && npm run -w server test && npm run -w server build`;
  - a docker build check;
  - on `v*` tags, push to `ghcr.io/<owner>/skyline-garden-server:r<RULES_VERSION>-<sha>`. Tagging with the rules version helps keep client and server deploys in step.
- **`pages.yml`:** `env: VITE_SERVER_URL: ${{ vars.SKYLINE_SERVER_URL }}` (empty means offline-only build).
- **Root `npm ci`** now builds or downloads better-sqlite3 for every job. Prebuilt binaries exist for Linux x64 on Node 22; this container has g++, python3 and make as a fallback.
- **Note for M3 (PWA):** the service worker must use network-only for `/api/` and for cross-origin requests.

---

## 8. Tests

**Client unit tests (`tests/`):**

- `commands.test.ts`:
  - the parser accepts valid commands and rejects malformed ones (extra keys, NaN, negatives, bad ids, server-only types, `debugGrant` without the flag);
  - `applyCommand` gives the same result as calling the action directly.
- `replay.test.ts`:
  - a seeded fuzzer plays about 2000 random valid commands with timestamps through `Game`-like logging;
  - replaying from the initial state gives an equal state and equal `stateHash`;
  - tick entries are logged only when the state changes;
  - `fillOrders` gives the same result whether time is processed all at once or in pieces.
- `hash.test.ts`: key order does not matter; `lastSeenAt` is ignored; `-0` equals `0`.
- `stall.test.ts`:
  - list, cancel and collect; price and quantity bounds; level gate; storage full on cancel;
  - NPC buy time is deterministic; overpriced listings never sell to NPCs; tick marks them sold;
  - `stallSoldToPlayer` does nothing on a mismatch.
- `npc.test.ts`:
  - gardens and stalls are deterministic per day;
  - help caps and the reset at the UTC+7 day boundary; `ALREADY_HELPED`; `WRONG_DAY`;
  - rewards are deterministic; at most 4 NPC visits per catch-up.
- `social.test.ts`: `marketPurchase` and `helpReward` errors; `helpReceived` is lenient.
- `save.test.ts`: the M4 migration fills defaults; `looksValid` rejects a broken stall.
- `syncEngine.test.ts` (fake ApiClient, memory storage):
  - pending survives a restart;
  - adopt with rebase drops stale entries;
  - hash match means the state is not replaced;
  - 422 means adopt and clear;
  - 426 sets `outdated`;
  - retries are idempotent.

**Server tests** (Vitest with `app.inject`, `:memory:` database, `FakeClock`):

- `auth`: register, login, logout, duplicates, wrong password, expiry, lockout.
- `sync`: happy path; `CLOCK_AHEAD`; non-monotonic; strict divergence gives 422 and suspicion; hash mismatch means the server wins; rebase drops; 426; 413; server-only command rejected; `debugGrant` gate.
- `import`: plausibility checks; second import refused.
- `market`:
  - listing shows up after sync; buy moves gold and items atomically; seller collects;
  - a second buy gets 410; an NPC-margin listing gets 410; own listing gets 400; price mismatch 409; buyer storage full 422; cancel then buy 410; daily cap 429.
- `friends`: add by code, remove, limit, help on a non-friend gets 403.
- `help`: effects on both accounts; unique per pot; caps.
- `leaderboard`: weekly totals come from state; flagged accounts excluded; friends scope.
- `migrations`: `user_version` upgrades the schema.
- `ratelimit`.

**E2E:**

- **`e2e/social-local.spec.ts`:**
  - list roses, `skip(3600)`, NPC sale toast, collect, gold goes up;
  - visit `npc:bamay`, tap a water mark, XP flies up, helps left goes down, go home;
  - reload: state persists.
- **`e2e/social-remote.spec.ts`:** Playwright `webServer` adds the server on 8787 with `DB_PATH=:memory:`, `ALLOW_TEST_CLOCK=1`, `ALLOW_DEBUG=1`. Two browser contexts, Alice and Bob:
  1. both register; Bob adds Alice's friend code;
  2. Alice lists at 2× (NPCs will not buy);
  3. Bob buys it through a visit; Alice collects;
  4. Bob helps water Alice's plant;
  5. Alice runs `addGold` as a local patch, sync reverts it;
  6. a new context logs in as Alice and the cloud save is restored.
- Use test ids such as `btn-social`, `stall-slot-N`, `list-confirm`, `collect-N`, `visit-npc:bamay`, `help-mark-F-S`, `market-buy-…`, `sync-status`.

---

## 9. Implementation order (one commit per step)

1. **M4.0 (before or at the start of M2):**
   - Clock move, purity lint, `KeyValueStore`, required seed;
   - `commands.ts`, `step`, `version.ts`, `hash.ts`, `calendar.ts`;
   - `Game.exec`, `replaceState`, `onCommand`; the 16 call sites;
   - replay fuzz test.
2. **M4.1 (offline social, ships on Pages):**
   - stall, NPC and social logic plus the save migration;
   - `LocalSocial` and `SocialHub`;
   - GardenSource refactor and visit mode; GroundIslet, StallView and HelpMarkers;
   - StallPanel, ListItemDialog, SocialPanel, MarketPanel, LeaderboardPanel (local);
   - `social-local` E2E.
3. **M4.2 (server core):**
   - workspace, Vite SSR build, `Db`, migrations;
   - auth, health, save, import, sync with replay;
   - server tests.
4. **M4.3 (client sync):**
   - ApiClient, SyncEngine, settings and URL resolution, single-tab lock;
   - AccountPanel, SettingsPanel, SyncConflictDialog, status dot;
   - E2E: register, reload, cheat reverted.
5. **M4.4:** friends, suggested players, remote garden visits, help, notices; `RemoteSocial`.
6. **M4.5:** listings index, buy transaction, market board with player listings, weekly leaderboard; two-player trade E2E.
7. **M4.6:** Dockerfile, compose with Caddy, CI jobs, Pages variable, `docs/server.md`, README.

---

## 10. Risks and dependencies

- **Client and server rule drift (biggest risk).** Any config change gives different replay results. Mitigations:
  - `RULES_VERSION` gating;
  - image tags carrying the rules version;
  - a documented rule: deploy the server first, then Pages; the client stays playable while `outdated`.
- **Constraints on M2 and M3:**
  - every state change must be a command, and ticks must be pure;
  - `dayIndex` is shared with daily quests;
  - M2's `ItemId` and inventory helpers widen `TradeItemId`;
  - "catch bugs" help needs M2 pests (until then, water only);
  - the mine must be turn-based.
- **Replay cost.** `structuredClone` per command is about 20–50 ms per 1000 entries. The 1000-entry cap applies; a mutable fast path on the server is a later option. The synchronous handlers block the event loop briefly, which is fine for a self-hosted single process.
- **Single process only.** better-sqlite3 transactions give atomicity only within one Node process; horizontal scaling is not supported (documented).
- **better-sqlite3 native build** in CI or Docker. Prebuilt binaries plus build tools cover it; the `node:sqlite` fallback is behind `Db`.
- **Honest players with very wrong device clocks** can lose offline progress (`CLOCK_AHEAD`). Show a clear message; the server offset fixes it once online.
- **Multi-device play** gives partial loss through rebase drops. The dialog plus local backup is acceptable for a casual game.
- **Tokens in localStorage** are exposed to XSS. There are no third-party scripts; keep it that way and consider a Content-Security-Policy in M3's PWA work.
- **E2E cost.** Two SwiftShader contexts plus the server is slow. Run the remote spec only on the desktop project, with longer timeouts.
- **Package lock churn** from adding workspaces; update CI caching keys.

### Critical files for implementation

- /home/user/Skyline-Garden/src/game/actions.ts (plus new /home/user/Skyline-Garden/src/game/commands.ts)
- /home/user/Skyline-Garden/src/core/Game.ts
- /home/user/Skyline-Garden/src/game/save.ts
- /home/user/Skyline-Garden/src/render/GardenView.ts
- /home/user/Skyline-Garden/src/input/InputController.ts
