# Skyline Garden: reconciled design for M2 to M5 (critic pass over the economy, polish, social and infra designs)

I resolved the conflicts by reading the code at `b971689`. Facts from the code that the decisions below depend on:

- **Slots and pots.** `Floor.slots` is `(Pot|null)[]`. Pots are kept as counts in `potStock`.
- **Randomness.** There is one `rngSeed`.
- **Pure-logic boundary.** `commit()` is private inside `actions.ts`. `Clock` sits in `src/game/time.ts` and calls `Date.now()`. `createNewGame` falls back to `Math.random()` when no seed is passed. `save.ts` uses the DOM `Storage` type.
- **Failed loads overwrite the save.** `Game` falls back to `createNewGame` when `deserialize` returns null, so a corrupt save or one from a newer version is lost.
- **Invalid ids corrupt state.** `PLANTS['constructor']` resolves to `Object`, so `sellCrop(s,'constructor',1)` commits `gold = NaN`.
- **HUD and camera.** The HUD is one flex row. `main.tsx` measures `.hud` and `.bottom` to set the camera insets.
- **Camera fit.** The camera fits `GARDEN_WIDTH = 6*1.75+0.9` to the screen width, so any side rail would cover slot 0 or slot 5.
- **Toolchain.** `node:sqlite` works here without a flag on Node 22.22, but prints an `ExperimentalWarning`. Vite is 8.3.3, and Rolldown supports `codeSplitting`.
- **Deployment.** Pages is not live and there is no `main` branch. Only `claude/charming-ptolemy-n96r1j` exists.

---

## 1. Conflicts and how they are resolved

| #   | Conflict                                                                                                                                                                                                                                            | Designs                    | Resolution                                                                                                                                                                                                                                                                                                                                                                                  |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | **SAVE_VERSION numbering.** Economy uses v2–v5. Polish uses V+1..V+4. Social adds +1. Infra uses v2–v14 in a different order.                                                                                                                       | all                        | One sequence, v2 to v11 (§4.3). A bump happens only in a commit that changes the shape of GameState. A type declared at v2 that no save writes yet (Machine, PestInfo) can still change until its feature ships.                                                                                                                                                                            |
| C2  | **Inventory model.** Economy keeps `crops` and adds `goods`, `materials` and `potBag`. Infra wants one `items` map. Polish adds a separate `consumables` map plus gems and `stone/clay/iron/crystal` materials. Social has `TradeItemId = PlantId`. | eco, infra, polish, social | **One `items: Counts<ItemId>` map** driven by a registry `config/items.ts` with `kind: crop\|good\|material\|consumable` and `store: 'barn'\|'chest'`. The barn (crop and good) is capped; the chest (material and consumable) is not. `seeds` stays separate. Pots are separate instances in `potBag` (economy). There is no `consumables` field. Tradable items are crops and goods only. |
| C3  | **Storage overflow.** Economy lets rewards and refunds go over capacity. Infra says storage can never overflow.                                                                                                                                     | eco, infra                 | **Strict invariant `barnUsed ≤ capacity`.** The `Reward` type cannot hold barn items (only gold, ruby, xp, seeds and chest items). `cancelJob`, `cancelListing` and `buyNpcListing` return `STORAGE_FULL` when the items don't fit.                                                                                                                                                         |
| C4  | **Material ids.** Economy uses `cloudclay/dewglass/sunstone/stardust`. Polish uses `stone/clay/iron/crystal` plus gems `amethyst/topaz/emerald`.                                                                                                    | eco, polish                | Keep the economy's 4 materials. The mine drops them by depth: band 0 cloudclay, band 1 dewglass, band 2 sunstone, and the chest has a chance of stardust. Pickaxe costs move to dewglass and sunstone. **Gems are cut.**                                                                                                                                                                    |
| C5  | **RNG.** Economy streams: orders, crops, loot, forge, daily, balloon. Infra streams: orders, pests, balloon, quests, forge, mine, npc. Polish and social still use `state.rngSeed`.                                                                 | all                        | `rng: Record<RngStream, number>` with **9 streams created at v2**: `orders, crops, loot, forge, daily, balloon, mine, pet, npc`. `orders` keeps the old `rngSeed`; the others come from `deriveSeed(rngSeed, name)`. Per-day NPC gardens use `hashSeed(npcId, day)` and draw from no stream.                                                                                                |
| C6  | **Day boundary.** Economy uses the local timezone through a `setTimezone` action. Polish, social and infra use a fixed UTC+7.                                                                                                                       | eco vs rest                | **Fixed UTC+7** in `src/game/calendar.ts` (`dayIndex`, `weekIndex`, `msUntilNextDay`). `tz`, `tzChangedAt`, `setTimezone` and `timezoneSet` are dropped.                                                                                                                                                                                                                                    |
| C7  | **Post-commit hooks.** Economy has `applyProgress`. Polish has `recordStats → tutorialOnEvents → progressQuests → checkAchievements`. Infra has `applyMeta`.                                                                                        | eco, polish, infra         | `src/game/meta.ts` `applyMeta(draft, events, now)`, called by `commit()` in a fixed order: `recordStats → progressQuests → tutorialOnEvents → checkAchievements`. It runs once; events the hooks append (`questCompleted`, `achievementUnlocked`, `tutorialStep`) are not fed back in.                                                                                                      |
| C8  | **Stats shape.** Economy uses a fixed `LifetimeStats` interface. Polish uses a `Counts<StatKey>` map with different names (bugsCaught vs pestsCaught, goodsProduced vs goodsMade, questsDone vs questsCompleted).                                   | eco, polish                | A `stats: Counts<StatKey>` **map**, created at v2. Adding a key needs no migration. Names follow the economy design ("pest", not "bug").                                                                                                                                                                                                                                                    |
| C9  | **Pest naming.** Economy uses `catchPest`, `pestCaught`, `NO_PEST`. Polish uses `catchBug`, `bugCaught`, `hasBugs`. Social uses `HelpKind 'bug'`.                                                                                                   | eco, polish, social        | "pest" everywhere: `pestCaught {floor, slot, pestId, by:'player'\|'pet'\|'friend', …}` and `HelpKind = 'water' \| 'pest'`.                                                                                                                                                                                                                                                                  |
| C10 | **`undefined` in state.** Economy has `pest?:` and other optional fields. Infra forbids `undefined`.                                                                                                                                                | eco, infra                 | `pest: PestInfo \| null` and `yield: number`, both set by the v2 migration. Reward objects leave out absent keys; they are never set to `undefined`.                                                                                                                                                                                                                                        |
| C11 | **Command layer.** Social: `ClientCommand {type}`, `parseClientCommand`, `Game.exec`. Infra: `Command {t}`, `decodeCommand`, `Game.dispatch`. Economy: `Game.run(cmd)`.                                                                             | social, infra, eco         | `Command` union with a `type` field (same as GameEvent), plus `applyCommand`, `step` (tick, then the command), `parseCommand(raw, {allowDebug})` (strict, uses `Object.hasOwn`, rejects extra keys) and **`Game.exec(cmd, opts)`**. `ServerCommand` is a separate union that the parser rejects. It lands in Phase 0, **before M2**.                                                        |
| C12 | **Logging ticks vs. tick-granularity invariance.** Social logs every tick that changes state. Infra requires a property test that results don't depend on how often tick runs.                                                                      | social, infra              | **Log ticks that change state** (exact replay on the server). Drop the general granularity test: balloon "dock at now" and daily rollover depend on tick time by design. Keep tests for: no-op tick returns the same object, tick is idempotent at the same `now`, determinism, and granularity invariance for **orders and pet catches only**.                                             |
| C13 | **Where `Clock` lives.** Social moves it to `src/core/Clock.ts`. Infra keeps it in `time.ts` with a lint exception.                                                                                                                                 | social, infra              | Move it to `src/core/Clock.ts` (no lint exception needed). `formatDuration` stays in `src/game/time.ts`.                                                                                                                                                                                                                                                                                    |
| C14 | **SQLite driver.** Social uses better-sqlite3 with node:sqlite as fallback. Infra uses node:sqlite with better-sqlite3 as fallback.                                                                                                                 | social, infra              | **`node:sqlite` `DatabaseSync`** behind `server/src/db/Db.ts`. No native build in CI or Docker. Start with `node --disable-warning=ExperimentalWarning`. Add `engines: {node: ">=22.13"}`.                                                                                                                                                                                                  |
| C15 | **Shared code path and alias.** Social: `src/shared`, `@game`, `@shared`, `server/src/main.ts`, `server/test/`. Infra: `src/protocol`, `@skyline/game`, `@skyline/protocol`, `server/src/index.ts`, `server/tests/`.                                | social, infra              | `src/protocol/`, aliases `@skyline/game` and `@skyline/protocol`, `server/src/index.ts`, `server/tests/`. The server is bundled with the Vite SSR build (`ssr.noExternal: true`), so the image is a single file.                                                                                                                                                                            |
| C16 | **Rules versioning.** Social: manual `RULES_VERSION`. Infra: `RULES_REVISION` plus a pinned config-hash `RULES_HASH`.                                                                                                                               | social, infra              | `src/game/rules.ts`: `RULES_VERSION` (manual) and `RULES_HASH` = FNV over `JSON.stringify(configs)` plus `RULES_VERSION`. An inline snapshot test pins the hash. The handshake compares `RULES_HASH`. Function-valued config (for example `speedUpCost`) is not captured by the hash, so changing it requires a manual `RULES_VERSION` bump; this is documented.                            |
| C17 | **Tutorial location.** Polish puts it in GameState (steps advanced by events and by an injected order). Social says cosmetic flags must stay outside state. Infra makes it a save bump.                                                             | polish, social, infra      | `tutorial: {step, progress}` stays in GameState because it grants a reward. `seen` tips move to local settings. `skipped` is cut. **Order injection is replaced** by a fixed first order in `createNewGame` (`rose×4, 24g, 3xp`).                                                                                                                                                           |
| C18 | **Settings store and panel.** Polish: `core/settings.ts` plus SettingsPanel. Social: `net/settings.ts` reads `serverUrl` from the same key and builds its own SettingsPanel.                                                                        | polish, social             | One `src/core/settings.ts` (`skyline-garden/settings`). `serverUrl` and `seenTips` are added with parse-time defaults, so no version bump. One SettingsPanel; the "Máy chủ & tài khoản" section is added in M4.                                                                                                                                                                             |
| C19 | **Single-tab lock.** Polish: BroadcastChannel, newest tab wins. Social: `navigator.locks` with `ifAvailable`, so the first tab wins.                                                                                                                | polish, social             | `navigator.locks.request('skyline-game', {steal: true})`, held for the page lifetime. A new tab steals the lock and the old tab's promise rejects, so the old tab sets `blocked='otherTab'`. If the API is missing, run without a lock. Ships in Phase 0.                                                                                                                                   |
| C20 | **Load safety.** Polish: `readSave → {none\|ok\|corrupt\|tooNew}`. Infra: `{ok\|empty\|corrupt\|newer}` plus `save.backup.<ts>`. Social: `skyline-garden/backup`.                                                                                   | polish, infra, social      | `readSave(json): LoadResult` with `none\|ok\|corrupt\|tooNew` and keys `skyline-garden/save.backup` (one key, written before a migration, replace, import or sync conflict) and `skyline-garden/save.corrupt`. Ships in Phase 0, **before the first bump**.                                                                                                                                 |
| C21 | **Fixture tooling.** Economy: `save-v{N}.json` with `UPDATE_FIXTURES`. Infra: `scripts/freeze-fixtures.ts`, three per version.                                                                                                                      | eco, infra                 | `scripts/*.ts` **cannot run under plain node**: `src/game` uses extensionless imports. Use `tests/freeze-fixtures.test.ts`, skipped unless `FREEZE_FIXTURES=1`, which refuses to overwrite. One midgame fixture per version at `tests/fixtures/saves/v{N}.json`, plus `v1-new.json`.                                                                                                        |
| C22 | **Pot instances and `Tool`.** Economy: `Tool {kind:'pot'; stack}`, `{kind:'machine'}`, `{kind:'move'}`. Social: `{kind:'help'}`. Polish: a separate `mineTool` signal.                                                                              | eco, social, polish        | `Tool = seed \| pot(stack) \| harvest \| machine(machineId) \| move(from) \| help`. The mine keeps `ui.mineTool: 'pick'\|'bomb'` because it is a different screen.                                                                                                                                                                                                                          |
| C23 | **Objects under floor 0.** Polish puts a quarry island at y≈−4.5. Social puts a ground islet with a stall, mailbox and board at y=−4.0.                                                                                                             | polish, social             | **One `GroundIslet`** under floor 0: quarry cave mouth (right), stall cart (left), notice board (middle, opens Social or Market). Pick targets are `{kind:'islet', part:'quarry'\|'stall'\|'board'}`. `CameraScroller.homeY` (polish) keeps the starting view on floor 0. It is built in M3 (quarry) and gets the cart and board in M4.1.                                                   |
| C24 | **Side rail vs. HUD chips.** Polish: left rail with 🏆⛏🐾 under the HUD. Economy: a second HUD row of chips, because a rail covers edge slots. Social: 👥 and a sync dot in the HUD. Polish: ⚙ after the ruby pill.                                 | eco, polish, social        | **No rail.** A second row `ChipBar` inside `.hud`, so the existing `measure()` adjusts the camera inset automatically. Chips appear as features unlock: 🎁 login, 📋 quests, 🎈 balloon, 🏆 achievements, 🐾 pet, ⛏ mine, 👥 social (with a sync dot). ⚙ is always last. The row scrolls sideways when it overflows; buttons are 40×36. FeatureTips attach to chips.                        |
| C25 | **Visiting gardens vs. ScreenHost.** Social: `GardenSource`, two GardenView instances, `ui.visit`, VisitHud and VisitToolbar. Polish: a ScreenHost with garden and mine screens.                                                                    | social, polish             | Visit becomes a third `Screen`: `ScreenId = 'garden'\|'mine'\|'visit'`. `VisitScreen` = `GardenView(VisitSource)` + `VisitInput`. `ui.screen` decides which HUD and toolbar `App` shows. `ui.visit` holds the `VisitSession`.                                                                                                                                                               |
| C26 | **`actions/` folder vs. one file per feature.**                                                                                                                                                                                                     | eco, infra                 | Flat feature modules: `src/game/<feature>.ts` (helpers and actions together) plus `config/<feature>.ts`. `actions.ts` keeps the M1 garden actions, updated to the v3 shapes. `commit.ts` is extracted.                                                                                                                                                                                      |
| C27 | **Debug patches when online.** Infra: a `tainted` flag blocks upload. Social: the patch is reverted by the next sync.                                                                                                                               | infra, social              | Social's approach, no `tainted` flag. `?debug` patches stay local. With a server that has `ALLOW_DEBUG=1`, they are sent as a `debugGrant` command.                                                                                                                                                                                                                                         |
| C28 | **Skipping the tutorial in E2E.** Polish: `openGame()` calls `skipTutorial()`. Infra: `?debug` starts with the tutorial done unless `?tutorial`.                                                                                                    | polish, infra              | At boot, `?debug` runs `exec({type:'skipTutorial'})` (a real command) unless `?tutorial` is set. Existing specs need no change.                                                                                                                                                                                                                                                             |
| C29 | **PWA implementation.** Polish: `vite-plugin-pwa@^2` plus workbox. Infra: a custom service-worker plugin.                                                                                                                                           | polish, infra              | **Custom `build/pwa.ts` Vite plugin** (manifest, `sw.js` with a precache list named by `__BUILD_SHA__`, network-only for `/api` and cross-origin, `SKIP_WAITING` update flow) plus `build/icons.ts` (polish's SDF rasterizer and `node:zlib` PNG encoder). No workbox dependency tree, and no uncertainty about Vite 8 peer support.                                                        |
| C30 | **Capacitor native folders.** Infra commits the generated `android/` and `ios/`. Polish gitignores them.                                                                                                                                            | infra, polish              | Gitignore them (polish). `android.yml` runs `cap add android` in CI. `@capacitor/assets` is run with `npx` and is not a dependency (it pulls in sharp).                                                                                                                                                                                                                                     |
| C31 | **English locale timing.** Polish: early M3, eager. Infra: end of M3, lazy.                                                                                                                                                                         | polish, infra              | **Eager, at the start of M3 (3.1)**, after M2 content is stable. From then on `en: Messages` forces vi/en parity at typecheck time. Lazy loading is cut, since it would make `t()` async for about 8 KB gzip.                                                                                                                                                                               |
| C32 | **Error names.** `NOT_ENOUGH_CROPS` vs `NOT_ENOUGH_ITEMS`; `MAX_TIER` vs `MAX_LEVEL`; `NO_POT_STOCK` vs `POT_NOT_FOUND`.                                                                                                                            | eco, polish, social        | `NOT_ENOUGH_ITEMS`, `MAX_LEVEL` and `POT_NOT_FOUND`. Errors are never saved, so renaming is safe. `ACTION_ERRORS` becomes a const array (polish) for the i18n test.                                                                                                                                                                                                                         |
| C33 | **Constructors for `Game` and `replaceState`.** Polish: `new Game(storage, settings)` and `replaceState(next)`. Social: `new Game(storage, {initialState, seed})` and `replaceState(s, reason)`.                                                    | polish, social             | `new Game({storage, settings, initialState?, seed?})` and `replaceState(state, reason: 'import'\|'reset'\|'sync'\|'conflict'\|'login')`, which emits `stateReplaced`. Only `import` and `reset` reset `clock.offsetMs`.                                                                                                                                                                     |
| C34 | **Polish's `machineDone` SFX event.** Economy has no such event; machines are timestamp-derived.                                                                                                                                                    | polish, eco                | Collect SFX plays on `goodsCollected`. The "job finished" chime comes from a UI-side watcher (`machineStatus` crossing `readyCount>0`), not a GameEvent.                                                                                                                                                                                                                                    |
| C35 | **Name clashes.** The pet "Bông" collides with cotton "Bông" and the caterpillar "Sâu Bông". "Bom Bông" collides too.                                                                                                                               | polish, eco                | Pet: **"Xốp" (vi) / "Puff" (en)**. Cotton: "Bông vải". Caterpillar: "Sâu Xanh". Bomb: "Bom Mây" (Cloud Bomb).                                                                                                                                                                                                                                                                               |
| C36 | **Unlock-level collisions.** Pet L4 (polish) lands on L4 still and ceramic. Mine L6 lands on L6 lily, kettle and floor 4. Stall L3 (social). Quests L3 (economy).                                                                                   | all                        | Merged timeline in §4.4.                                                                                                                                                                                                                                                                                                                                                                    |
| C37 | **Transcendental math in pure code.** Economy's runtime `8·L²·1.06^L` and `250·1.45^n` vs. infra's lint ban on `Math.pow/exp/log/trig` (results can differ between V8 and JavaScriptCore).                                                          | eco, infra                 | `XP_TABLE`, `STORAGE_UPGRADES` and similar tables are **literal integer arrays** in config, generated once offline. Lint **errors** on transcendental `Math.*` in `src/game` and `src/protocol`. Plain `+ − × ÷`, `Math.round` and `Math.floor` are deterministic.                                                                                                                          |
| C38 | **Import while online, and imported-save trust.** Polish: export/import. Social: plausibility checks on import. Infra: an unverified first upload counts only XP gained after linking.                                                              | polish, social, infra      | Local import is **disabled while logged in**. Register-time import uses social's plausibility checks plus `accounts.xp_at_link`. Leaderboards rank by **verified XP** (`xp − xp_at_link`) and by weekly XP.                                                                                                                                                                                 |

---

## 2. Gaps and how to fill them

| Area                                                                                                                  | Status               | Fill                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------------------------------------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Floors, pots, plants, special pots, machines, owl orders, balloon, pests, daily quests                                | Covered (economy)    | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Mine, pet, audio, tutorial, achievements, PWA, Capacitor, English                                                     | Covered (polish)     | Apply the C4/C29/C30/C31/C35 changes.                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Roadside shop, friends visit and help, offline NPCs, server, anti-cheat, leaderboard                                  | Covered (social)     | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| CI, Pages, budgets, property tests                                                                                    | Covered (infra)      | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **Accessibility**                                                                                                     | Not covered          | Phase 3.1: `aria-label` on every icon-only button and chip; keep toasts `aria-live` (already present); `Sheet` focus trap and focus return; rarity shown as **text plus border style**, not colour only; tap targets ≥ 40 px; a **"Giảm chuyển động" (reduce motion) setting** defaulting to `prefers-reduced-motion`, which turns off camera inertia, pop tweens and CSS animations and halves particles; Escape closes the top panel or modal. Run an axe check in `settings.spec`. |
| **Modal pile-up at boot** (tutorial, level-up, login gift, pet adoption, forge reveal, update banner)                 | Not covered          | `src/ui/modals.ts`: a derived `activeModal` with priority **BlockingNotice > Tutorial > LevelUp > ForgeReveal > PetAdopt > LoginGift**. Only one is shown; the rest queue. UpdateBanner is not modal.                                                                                                                                                                                                                                                                                 |
| **Mobile notifications** (crops ready, balloon arrived, pet back)                                                     | Not covered          | M5.1, optional: `@capacitor/local-notifications`. On `pause`, schedule up to 5 entries from a pure `upcomingEvents(state, now)` in `src/game/schedule.ts`. No web push (it would need a server and VAPID keys).                                                                                                                                                                                                                                                                       |
| **Account recovery** (no email)                                                                                       | Not covered          | A recovery code is shown once at registration and stored as a scrypt hash, with `POST /api/auth/recover {username, code, newPassword}`. Server admin CLI: `npm run -w server admin -- reset-password\|ban\|rename <user>`.                                                                                                                                                                                                                                                            |
| **Display-name moderation**                                                                                           | Partial              | Charset `[\p{L}\p{N} _.-]{2,20}`, strip control characters, a small blocklist in `server/src/moderation.ts`, plus the admin rename and ban above.                                                                                                                                                                                                                                                                                                                                     |
| **CSP for Bearer tokens in localStorage**                                                                             | Mentioned only       | Build-only `transformIndexHtml` CSP: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' https: http://localhost:*; worker-src 'self'`.                                                                                                                                                                                                                                                                          |
| **localStorage quota** (save + base + pending log + backup)                                                           | Not covered          | Cap pending at 5,000 entries. Coalesce consecutive `tick` entries (keep the last). On `QuotaExceededError`, set sync status `error`, push immediately and toast an export hint. A test checks that the serialized maxed fixture is ≤ 64 KB.                                                                                                                                                                                                                                           |
| **Migrations reading `lastSeenAt`** (economy's balloon `returnsAt: lastSeenAt`, social's `npcVisitAt: lastSeenAt+3h`) | Bug                  | `lastSeenAt` is excluded from the state hash and differs between client and server, so migrations would diverge. Rule: migrations depend only on gameplay fields. Use `returnsAt: 0` and `npcVisitAt: 0` (the event happens on the next tick).                                                                                                                                                                                                                                        |
| **Mine and pet balance vs. the rescaled economy**                                                                     | Partial              | Extend `tests/balance.test.ts` (economy's bot) in 3.7 and 3.9 with mine and pet income. Keep polish's mine Monte-Carlo bounds, but express them as a fraction of farm income per day at the same level, not fixed gold.                                                                                                                                                                                                                                                               |
| **Size budget realism**                                                                                               | Too tight            | Infra's 60 KB gzip for the app entry will fail once ~25 panels and two dictionaries exist. Start at entry ≤ 100 KB, three ≤ 165 KB, total initial ≤ 280 KB, then ratchet down at each checkpoint.                                                                                                                                                                                                                                                                                     |
| **Pages prerequisites**                                                                                               | Covered in docs only | The agent cannot change the default branch or Pages settings. README steps: create `main`, make it the default branch, set Pages source to Actions, run the workflow once. CI runs on every branch meanwhile.                                                                                                                                                                                                                                                                         |
| **Smallest phones**                                                                                                   | Not covered          | E2E tests 390×844 (Pixel 7). Add a 360×740 check in the `@smoke` HUD and ChipBar test to catch overflow.                                                                                                                                                                                                                                                                                                                                                                              |
| Friends helping fill balloon crates, gifts, decorations, chat, seasonal events                                        | Not requested        | **Out of scope**; list them in the README roadmap.                                                                                                                                                                                                                                                                                                                                                                                                                                    |

---

## 3. Risks and mitigations

| Risk                                                                                                  | Mitigation                                                                                                                                                                                                                                                                         |
| ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **The v3 inventory-model commit ripples through every layer** (types, render, input, UI, debug, e2e). | Split it from v2 (logic-only RNG and stats). Make the v3 commit purely a type and shape change with **no gameplay change**. Run the full E2E before moving on.                                                                                                                     |
| **Migration bugs and live-config drift.**                                                             | Frozen literals per migration. Fixtures frozen before each bump. A property test: random v1 states → migrate → `checkInvariants`. A guard test that the live `XP_TABLE` equals the frozen v4 table.                                                                                |
| **Stale PWA or a second tab overwriting saves** (a real bug today).                                   | Phase 0: `readSave` with `tooNew` sets `blocked`, plus backup keys and the Web Locks steal. These ship before the first bump and before the service worker.                                                                                                                        |
| **Client/server rule drift**, and Pages auto-deploying ahead of a hand-updated server.                | `RULES_HASH` handshake: on mismatch the client shows `outdated`, stays playable and keeps logging. The Docker image bundles its own web build served same-origin (`VITE_SERVER_URL=same-origin`) as the primary online client. Pages connecting to a remote server is best-effort. |
| **Cross-engine floating-point differences** (V8 server vs. JavaScriptCore on iOS).                    | Lint error on transcendental `Math.*` in `src/game`; literal tables; integer economy.                                                                                                                                                                                              |
| **Players predicting RNG** (seeds are in client state).                                               | Accepted for a casual game. Every stream advances a fixed amount per action, so the player can't steer outcomes. Documented; no secret server salt, because that would break optimistic replay.                                                                                    |
| **Prototype-key ids from untrusted JSON.**                                                            | Phase 0: `src/game/ids.ts` guards (`isPlantId` etc. using `Object.hasOwn`) in actions and `parseCommand`, plus a fuzz test with `__proto__` and `constructor`.                                                                                                                     |
| **Replay cost and DoS on the server.**                                                                | ≤ 1,000 entries per batch, 512 KB body, rate limits, synchronous transactions, a single process (documented).                                                                                                                                                                      |
| **Honest players with wrong device clocks** hitting `CLOCK_AHEAD`.                                    | Server offset estimated from `serverTime` on every reply, plus a clear message.                                                                                                                                                                                                    |
| **Draw calls** grow with machines, pests, pet, balloon and islet.                                     | `__skyline.renderInfo()` budget E2E (≤ 250 calls with 8 floors full). `bake.ts` merging only if the budget fails. FrameScheduler. Adaptive DPR.                                                                                                                                    |
| **SwiftShader E2E time and flakiness.**                                                               | Prebuilt `dist` artifact, desktop runs only `@smoke`, retries with trace in CI, the online project only on desktop.                                                                                                                                                                |
| **The tick log inflating pending entries.**                                                           | Only state-changing ticks are logged (orders arrive about once a minute), plus coalescing and the 5,000 cap.                                                                                                                                                                       |
| **iOS storage eviction and audio quirks.**                                                            | `navigator.storage.persist()`, export reminder, cloud save; `audioSession='ambient'`, resume on touch. Manual device testing at checkpoints.                                                                                                                                       |
| **Fastify inside a single SSR bundle.**                                                               | No pino transports. Fallback: externalize and run `npm ci --omit=dev -w server` in the runtime image.                                                                                                                                                                              |
| **Too much UI density at 360–390 px.**                                                                | Chips appear only as features unlock. The Tray scrolls sideways. Panels are Sheets. Checks at 360 px.                                                                                                                                                                              |

---

## 4. Reconciled design

### 4.1 Contracts for every feature (Phase 0)

1. Every change to GameState is a `Command` (or a `ServerCommand`) handled by a pure action `(state, …args, now) → ActionResult`.
2. `Game.exec` runs `step = tick → command` at the same `now`. `now` never goes backwards. State-changing ticks are logged.
3. `commit()` runs `applyMeta` (stats, quests, tutorial, achievements).
4. Random outcomes are rolled when something is created and stored with timestamps; nothing uses a per-tick probability. Streams live in `state.rng`.
5. Durations and rewards are snapshotted when something starts (growMs, job `doneAt`, trip reward, mine loot).
6. The day is `dayIndex(now)` at fixed UTC+7.
7. State never contains `undefined`; use `null`.
8. A shape change means one SAVE_VERSION bump, a frozen-literal migration, an updated `looksValid`, and a fixture frozen before the bump.
9. Per feature: Command variant, parser case, fast-check arbitrary, invariant, i18n keys, `feedback.ts` handling, debug `screenPos` kind, and an E2E spec with one `@smoke` test.
10. Lint for `src/game/**` and `src/protocol/**`: no `three`, `preact`, `render`, `ui`, `core`, `input`, `audio`, `net`, `social`, `i18n` or `node:*` imports; no `window`, `document`, `localStorage`, `navigator` or `fetch` globals; no `Math.random`, `Date.now`, `performance.now` or `new Date`; no transcendental `Math.*`. `tsconfig.game.json` (lib ES2022, `types: []`) proves the code has no DOM or Node dependency.

### 4.2 Final GameState (v11)

```ts
interface GameState {
  version: number;
  createdAt: number;
  lastSeenAt: number;
  gold: number;
  ruby: number;
  xp: number;
  level: number;
  floors: Floor[]; // slots: (SlotContent | null)[]                     v3
  seeds: Counts<PlantId>;
  items: Counts<ItemId>; // replaces crops; barn = crop+good, chest = material+consumable  v3
  potBag: PotInstance[]; // replaces potStock (max 40)                         v3
  nextUid: number; //                                                    v3
  storageCapacity: number;
  storageUpgrades: number;
  orders: OrderSlot[];
  nextOrderId: number; // OrderItem = { id: ItemId; qty }                    v3
  rng: Record<RngStream, number>; // replaces rngSeed; 9 streams                        v2
  stats: Counts<StatKey>; //                                                    v2
  daily: { day; quests: Quest[]; bonusClaimed; freeRerollUsed; loginDay; loginCount }; //      v5
  balloon: { phase: 'away'; returnsAt } | { phase: 'docked'; id; arrivedAt; leavesAt; crates: Crate[] }; // v6
  achievements: Partial<Record<AchievementId, number>>; // tiers claimed                        v7
  tutorial: { step: TutorialStep; progress: number }; //                                      v8
  mine: MineState | null; // { day, tiles[60], energy, energyAt, refillsToday, pickaxe }  v9
  pet: PetState | null; // { name|null, xp, level, satiety, satietyAt, nextCatchAt, trip|null, pattedDay }  v10
  stall: { slots: (StallListing | null)[]; nextListingId: number }; //      v11
  social: { day; helpsToday; helped: string[]; npcBought: string[]; week; weekXp; npcVisitAt }; // v11
}
type SlotContent = Pot | Machine;
interface Pot extends PotInstance {
  kind: 'pot';
  plant: PlantedCrop | null;
}
interface PotInstance {
  uid;
  potId;
  rarity;
  stats: PotStats;
  origin: 'shop' | 'forge' | 'reward' | 'legacy';
}
interface Machine {
  kind: 'machine';
  machineId;
  level;
  queue: MachineJob[];
} // MachineJob { recipe; startAt; doneAt }
interface PlantedCrop {
  plantId;
  plantedAt;
  growMs;
  yield: number;
  pest: PestInfo | null;
} // PestInfo { id; at; leaveAt }
type Reward = { gold?; ruby?; xp?; seeds?: Counts<PlantId>; items?: Counts<ChestItemId> }; // never barn items
RngStream = 'orders' | 'crops' | 'loot' | 'forge' | 'daily' | 'balloon' | 'mine' | 'pet' | 'npc';
ItemId =
  PlantId |
  GoodId |
  MaterialId('cloudclay' | 'dewglass' | 'sunstone' | 'stardust') |
  ConsumableId('cloudBomb' | 'petTreat');
StatKey =
  harvests |
  cropsHarvested |
  seedsPlanted |
  goodsMade |
  potsForged |
  pestsCaught |
  pestsEscaped |
  ordersDelivered |
  cratesFilled |
  balloonsCompleted |
  questsCompleted |
  loginDays |
  goldEarned |
  rubySpent |
  tilesBroken |
  mineClears |
  petTrips |
  petFeeds |
  helpsGiven |
  stallSales |
  tutorialDone;
```

### 4.3 Save versions and migrations (each migration is frozen and self-contained)

| Version | Step | Migration from the previous version                                                                                                                                                                                                                                                                                          |
| ------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| v2      | 2.1  | `rng` = `{orders: rngSeed, …others: deriveSeed(rngSeed, name)}`; `stats: {}`; every plant gets `yield: 2, pest: null`; delete `rngSeed`                                                                                                                                                                                      |
| v3      | 2.2  | `items = {...crops}`. `potStock` and the slots become instances (`uid++`, `rarity:'common'`, `origin:'legacy'`, `stats` from `V1_POT_STATS = {clay:{}, ceramic:{xpPct:20}, porcelain:{timePct:15}}`), with `kind:'pot'` on each slot. Order items become `{id: plantId, qty}`. Set `nextUid`. Delete `crops` and `potStock`. |
| v4      | 2.3  | XP rescale: `frac` within the level using the frozen `V1(L)=5L(L−1)`, then `xp = V4[L] + floor(frac·(V4[L+1]−V4[L]))` with a frozen literal V4 table. The level is unchanged.                                                                                                                                                |
| v5      | 2.8  | `daily = {day:-1, quests:[], bonusClaimed:false, freeRerollUsed:false, loginDay:-1, loginCount:0}`                                                                                                                                                                                                                           |
| v6      | 2.9  | `balloon = {phase:'away', returnsAt: 0}`                                                                                                                                                                                                                                                                                     |
| v7      | 3.5  | `achievements = {}`                                                                                                                                                                                                                                                                                                          |
| v8      | 3.6  | `tutorial = {step: xp>0 \|\| level>1 ? 'done' : 'welcome', progress: 0}`                                                                                                                                                                                                                                                     |
| v9      | 3.7  | `mine = null`                                                                                                                                                                                                                                                                                                                |
| v10     | 3.9  | `pet = null`                                                                                                                                                                                                                                                                                                                 |
| v11     | 4.1  | `stall = {slots:[null,null,null,null], nextListingId:1}`, `social = {day:-1, helpsToday:0, helped:[], npcBought:[], week:-1, weekXp:0, npcVisitAt:0}`                                                                                                                                                                        |

`migrations.ts` is split out of `save.ts`. `createNewGame(now, seed)` (seed required) produces the v11 defaults and the fixed tutorial order.

### 4.4 Merged unlock timeline (`config/levels.ts` `unlocksAt`)

| Level      | Unlocks                                                                                         |
| ---------- | ----------------------------------------------------------------------------------------------- |
| L1         | Orders, login gift, tutorial, achievements                                                      |
| L2         | Strawberry, **daily quests**                                                                    |
| L3         | Mint, floor 3, **stall and NPC neighbors**                                                      |
| L4         | Lavender, still, ceramic pot                                                                    |
| L5         | Tea, **pests and pet "Xốp"** (the pet is introduced as the pest helper)                         |
| L6         | Lily, kettle, floor 4                                                                           |
| L7         | Apple, kiln                                                                                     |
| L8         | Roaster, porcelain pot                                                                          |
| L9         | Cotton, **mine**                                                                                |
| L10        | Banana, balloon, floor 5, glazed forge, machine level 3                                         |
| L11 and up | As in the economy design. Iron pickaxe at L12, crystal pickaxe at L18. Online trading needs L4. |

All numbers live in config.

### 4.5 Commands, errors and events (deltas)

- **Commands:**
  - **M1:** `buySeed, buyPot, placePot(uid), plant, harvest, speedUp, sellItem, upgradeStorage, unlockFloor, deliverOrder, discardOrder, tick`.
  - **M2:** `storePot, sellPot, salvagePot, swapSlots, catchPest, sweep, buildMachine, startJob, collectMachine, speedUpMachine, cancelJob, upgradeMachine, claimLogin, claimQuest, rerollQuest, claimQuestBonus, fillCrate, sendBalloon`.
  - **M3:** `claimAchievement, advanceTutorial, skipTutorial, openMine, digTile, useBomb, refillEnergy, eatSnack, upgradePickaxe, adoptPet, renamePet, feedPet, patPet, startTrip, collectTrip`.
  - **M4:** `listStall, cancelListing, collectStall, unlockStallSlot, helpNpc, buyNpcListing, debugGrant`.
  - **ServerCommand:** `stallSoldToPlayer, marketPurchase, helpReward, helpReceived`.
- **Tick systems** (`src/game/tick.ts`, a registry of `{isDue, run}`; returns the same state object if nothing is due): `orders`, `dailyRollover` (quests, login reset, social counters), `balloon`, `petTrip`, `petCatch` (catch times scheduled up to `fedUntil`, so bounded and granularity-invariant), `tutorialWaitGrow`, `stallNpcBuys`, `npcVisits`.
- **Errors:** the economy's list minus the timezone errors; polish's `NO_ENERGY, MINE_EXPIRED, TILE_UNREACHABLE, TILE_BROKEN, NO_BOMB, WRONG_STEP, NOT_ACHIEVED, NO_PET, PET_AWAY, PET_FULL, PET_HUNGRY, NO_TRIP, TRIP_NOT_DONE, INVALID_NAME`; social's `STALL_FULL, NO_LISTING, LISTING_SOLD, NOT_SOLD, BAD_PRICE, MAX_STALL_SLOTS, HELP_LIMIT, ALREADY_HELPED, NOTHING_TO_HELP, WRONG_DAY, ALREADY_BOUGHT, NOT_TRADABLE`. Renames per C32. `sparkTea` is removed.
- **Events:** the union of all four designs, with "pest" naming, `sold {item, qty, gold}`, and `pestCaught.by`. AppEvent adds `welcomeBack` (extended), `stateReplaced`, `screenChanged`, `needPot` and `actionFailed`.

### 4.6 Repository layout and new files

```
src/game/   commit.ts commands.ts tick.ts meta.ts rules.ts hash.ts calendar.ts ids.ts invariants.ts env.d.ts
            migrations.ts items.ts pots.ts machines.ts pests.ts rewards.ts stats.ts daily.ts balloon.ts
            achievements.ts tutorial.ts mine.ts pet.ts stall.ts npc.ts social.ts schedule.ts
  config/   items.ts goods.ts materials.ts machines.ts forge.ts pests.ts balloon.ts daily.ts achievements.ts
            tutorial.ts mine.ts pet.ts social.ts npcs.ts   (levels.ts → literal XP_TABLE + unlocksAt; garden.ts → literal STORAGE_UPGRADES)
src/protocol/ api.ts index.ts
src/core/   Clock.ts settings.ts tabLock.ts   (Game.ts: exec, replaceState, blocked, onCommand)
src/audio/  AudioEngine.ts synth.ts sfx.ts connectAudio.ts music/{composer,themes,MusicPlayer}.ts
src/platform/ index.ts pwa.ts native.ts haptics.ts
src/net/    ApiClient.ts SyncEngine.ts authStore.ts            (lazy chunk)
src/social/ types.ts LocalSocial.ts RemoteSocial.ts SocialHub.ts VisitSession.ts
src/render/ models/{common,pots,plants,machines,pests,balloon,sprites}.ts BalloonView.ts GroundIslet.ts
            HelpMarkers.ts GardenSource.ts ScreenHost.ts FrameScheduler.ts Quality.ts screens/{Screen,GardenScreen,VisitScreen}.ts
            pet/{PetModel,PetView}.ts mine/{MineScreen,MineView,CaveBackground}.ts   (bake.ts only if budget fails)
src/input/  GardenInput.ts MineInput.ts VisitInput.ts         (InputController keeps only gesture handling)
src/ui/     ChipBar.tsx modals.ts MachinePanel.tsx BalloonPanel.tsx QuestsPanel.tsx LoginModal.tsx SettingsPanel.tsx
            ConfirmDialog.tsx AchievementsPanel.tsx BlockingNotice.tsx UpdateBanner.tsx ScreenTransition.tsx PuffAvatar.tsx
            tutorial/{TutorialController.ts,targets.ts,TutorialOverlay.tsx,FeatureTip.tsx}
            mine/{MineHud,MineToolbar,PickaxePanel}.tsx  pet/{PetAdoptModal,PetPanel}.tsx
            social/{SocialPanel,StallPanel,ListItemDialog,MarketPanel,LeaderboardPanel,VisitHud,VisitToolbar,
                    VisitStallPanel,AccountPanel,SyncConflictDialog}.tsx
src/i18n/en.ts
build/pwa.ts build/icons.ts       scripts/check-size.mjs   size-budget.json   tsconfig.game.json   .nvmrc
server/ package.json tsconfig.json vite.config.ts Dockerfile Caddyfile
        src/{index,app,config,clock,moderation}.ts db/{Db,migrations,repo}.ts auth/{password,sessions,plugin}.ts
        game/{replay,accounts,listings,antiCheat}.ts routes/*.ts admin.ts
        tests/*.test.ts
docker-compose.yml .dockerignore capacitor.config.ts docs/{server,MOBILE}.md
.github/workflows/{ci,pages,android,release}.yml .github/dependabot.yml
tests/  fixtures/saves/v*.json freeze-fixtures.test.ts arbitraries.ts invariants.test.ts commands.test.ts replay.test.ts
        migrations.test.ts items pots machines pests balloon daily economy balance achievements tutorial mine pet
        stall npc social hash i18n settings audio icons .test.ts
e2e/    helpers.ts machines pests-forge daily-balloon tutorial settings mine pet pwa social-local visual perf .spec.ts
        online/{auth-sync,friends-trade}.spec.ts
```

### 4.7 UI layout (390×844, checked at 360×740)

- **HUD row 1:** unchanged (level and XP, gold, ruby).
- **HUD row 2:** `ChipBar` (C24).
- **Bottom:** PotInfo, Tray (scrolls sideways; pots grouped by `potStackKey`) and the Toolbar with 5 buttons, unchanged. The Kho (Storage) button gets a badge for sold stall slots. Storage tabs: crops, goods, materials, pots, stall.
- **Mine screen:** `MineHud` replaces the ChipBar and `MineToolbar` replaces the Toolbar.
- **Visit screen:** `VisitHud` and `VisitToolbar`.
- **Panels and modals:** all panels are Sheets capped at `100dvh − safe-top − 24px`. Modals go through `modals.ts`. `PanelId` is the union of all four designs (`settings` is shared).

### 4.8 Render architecture

- **One renderer.** `ScreenHost` switches between the `garden`, `mine` (lazy chunk) and `visit` screens.
- **Garden screen:** `SkyBackground`, `GardenView(HomeSource)`, `BalloonView` (sky layer), `PetView` and `GroundIslet`.
- **Pickers:** the `Picker` checks the pet sphere, then slots, then the locked floor, then the islet parts.
- **SlotView:** delegates to `PotContentView` (pest overlay, nibbled tint, rarity rim) or `MachineContentView`.
- **Frame loop:** `FrameScheduler` runs updates every frame but renders only when needed. `Quality` adjusts DPR adaptively.
- **Chunks:** separate `three` and `preact` chunks.

### 4.9 Tooling, CI and server

- **CI (`ci.yml`, infra):** typecheck (web, game and server), lint, `format:check`, Vitest projects (web and server), build, size check, a `dist` artifact, and an E2E matrix (mobile runs everything, desktop runs `@smoke`). Server Docker build and `e2e-online` jobs are added in M4.
- **Pages (`pages.yml`):** runs on `workflow_run` from `main` with `VITE_SERVER_URL: ${{ vars.SKYLINE_SERVER_URL }}`.
- **Server:** workspace `server/`, Vite SSR single-file bundle, Fastify 5, `@fastify/cors`, `@fastify/rate-limit` and `@fastify/static` (serves the same-origin client).
- **Accounts and storage:** `node:sqlite` with WAL and `PRAGMA user_version` migrations. scrypt password hashes. SHA-256-hashed Bearer tokens. Recovery code.
- **Sync and endpoints:**
  - Sync (strict vs. rebase), endpoints and anti-cheat follow social §6.
  - Leaderboard on verified XP.
  - The buy transaction checks `listingId` and price. After a timeout the client re-syncs; there are no idempotency keys.
- **Docker:** `node:22-slim`, two stages. The builder runs `npm ci` and builds both the client (`same-origin`) and the server. The runtime image holds `dist/index.mjs` and `public/`, runs as `USER node` with `VOLUME /data`, and has a `HEALTHCHECK`.
- **Compose:** `server` plus a `caddy` service under the `tls` profile.
- **Mobile:** Capacitor 8 per polish §11. `webDir: dist-native` is built with `--mode native` (no service worker). `android.yml` runs on `workflow_dispatch`.

### 4.10 Cut as gold-plating

| Cut                                  | Replacement                                                          |
| ------------------------------------ | -------------------------------------------------------------------- |
| Mine gems and `sparkTea`             | Goods from machines restore mine energy (`MINE_SNACKS`)              |
| Timezone action                      | Fixed UTC+7 day boundary                                             |
| `vite-plugin-pwa` and workbox        | Custom `build/pwa.ts` plugin                                         |
| Lazy English locale                  | Eager `en.ts`                                                        |
| `tainted` flag and `batchId`         | Debug patches are reverted by sync; per-device `seq` for idempotency |
| Tutorial order injection             | Fixed first order in `createNewGame`                                 |
| Tutorial `skipped` and `seen` fields | `seenTips` in local settings                                         |
| better-sqlite3                       | `node:sqlite` only                                                   |
| Visual tier-2 screenshot diffs       | —                                                                    |
| Nightly workflow                     | Optional                                                             |
| `bake.ts`                            | Only if the draw-call budget fails                                   |
| Debug model gallery                  | Optional                                                             |

Kept, though small: the local NPC leaderboard (so the panel is never empty offline), `cancelJob`, `rerollQuest` and `swapSlots`.

---

## 5. Implementation sequence (one commit per step; typecheck, lint, format, unit tests, build and size must pass at every step)

| #    | Commit                                                                                                                                                                                                               | Save    |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| P1   | `.nvmrc`, `engines`, `format:check`, `ci.yml`, Playwright CI settings (`PW_PREBUILT`, `@smoke`, `serviceWorkers:'block'`), README fixes (GLTF → procedural, CI badge)                                                | –       |
| P2   | `pages.yml`, `__BUILD_SHA__`, README "Bật GitHub Pages" (enable GitHub Pages) steps                                                                                                                                  | –       |
| P3   | Hardening: `ids.ts` guards and tests (fixes the `constructor` NaN bug), `KeyValueStore`, `env.d.ts`, `tsconfig.game.json`, scoped ESLint purity, Clock moved to `core/`, required seed, `commit.ts`, `ACTION_ERRORS` | –       |
| P4   | `commands.ts` (`Command`, `applyCommand`, `step`, `parseCommand`), `Game.exec`, `replaceState`, `onCommand`, the 16 call sites, debug `dispatch`                                                                     | –       |
| P5   | `e2e/helpers.ts`, pageerror fixture, `screenPos`, `renderInfo`; fast-check, `invariants.ts`, arbitraries, determinism, no-op tick, round-trip and parser-fuzz tests                                                  | –       |
| P6   | `readSave` LoadResult, backup and corrupt keys, `blocked`, BlockingNotice, Web Locks tab lock, `migrations.ts`, `freeze-fixtures.test.ts` plus the v1 fixtures, `rules.ts` with hash snapshot                        | –       |
| P7   | Vendor chunks, `check-size.mjs`, budgets. **Checkpoint A:** CI green, full E2E                                                                                                                                       | –       |
| 2.1  | RNG streams (`deriveSeed`, `withRng`), stats map, `meta.ts` (recordStats), `tick.ts` registry, `yield` and `pest:null`                                                                                               | **v2**  |
| 2.2  | Item registry and `items`, `potBag` instances, slot `kind`, `OrderItem.id`, `sellItem`, Tray and Storage tabs, debug `grant`, `render/models/*` split, E2E updated for the new shape                                 | **v3**  |
| 2.3  | Rebalance: literal `XP_TABLE` plus rescale, 8 new plants with models, floors (E2E 300→400), shop pots, literal storage table, `unlocksAt` in LevelUpModal, `economy.test.ts`                                         | **v4**  |
| 2.4  | Pests and materials: roll at planting, `catchPest`, `sweep`, models and "!" bubble, PotInfo line, `pests` E2E                                                                                                        | –       |
| 2.5  | Machines logic: config, goods, `buildMachine…swapSlots`, goods in orders                                                                                                                                             | –       |
| 2.6  | Machines: 3D models, MachinePanel, shop machines tab, move tool, `machines.spec`. **Checkpoint B1:** draw calls                                                                                                      | –       |
| 2.7  | Kiln and forge: rolls, salvage and sell, ForgeReveal, rarity pot visuals, `pests-forge.spec`                                                                                                                         | –       |
| 2.8  | Daily: `calendar.ts`, login gift, quests, ChipBar, QuestsPanel, LoginModal, `modals.ts`                                                                                                                              | **v5**  |
| 2.9  | Balloon: logic, BalloonView, BalloonPanel, `daily-balloon.spec`                                                                                                                                                      | **v6**  |
| 2.10 | Balance bot and tuning, README "Cách chơi" (How to play). **Checkpoint B**                                                                                                                                           | –       |
| 3.1  | Settings store, locale signal, full `en.ts`, SettingsPanel (language, graphics, reduce motion, export/import, reset), ConfirmDialog, accessibility pass, i18n parity test                                            | –       |
| 3.2  | Audio engine, SFX, haptics, `connectAudio`; music composer and player (lazy)                                                                                                                                         | –       |
| 3.3  | ScreenHost and Screen, GardenScreen and GardenInput, FrameScheduler, Quality, `homeY`, perf overlay                                                                                                                  | –       |
| 3.4  | PWA: `build/pwa.ts` and `build/icons.ts`, UpdateBanner, install, `persist()`, CSP, `pwa.spec`. **Checkpoint C1**                                                                                                     | –       |
| 3.5  | Achievements, panel and chip                                                                                                                                                                                         | **v7**  |
| 3.6  | Tutorial (fixed first order), overlay, FeatureTips, `?debug` auto-skip, `tutorial.spec`                                                                                                                              | **v8**  |
| 3.7  | Mine logic (cloudBomb and petTreat in the registry, snacks); balance-bot mine income                                                                                                                                 | **v9**  |
| 3.8  | Mine lazy chunk, GroundIslet (quarry), MineInput, MineHud and PickaxePanel, `mine.spec`                                                                                                                              | –       |
| 3.9  | Pet logic (scheduled catches, trips, satiety)                                                                                                                                                                        | **v10** |
| 3.10 | Pet 3D, PetPanel, adopt modal, `pet.spec`. **Checkpoint C**                                                                                                                                                          | –       |
| 4.1  | Social logic: stall, NPC, help, server-only commands (pure), tests                                                                                                                                                   | **v11** |
| 4.2  | Offline social UI: GardenSource, VisitScreen, HelpMarkers, islet cart and board, stall, market, social and local leaderboard panels, `social-local.spec`                                                             | –       |
| 4.3  | Workspace, server skeleton (`/api/health`), tsconfig, ESLint and Vitest projects, Dockerfile, compose, CI server job. **Checkpoint D1:** lockfile                                                                    | –       |
| 4.4  | `src/protocol`, database migrations, auth (scrypt, tokens, recovery code, lockout)                                                                                                                                   | –       |
| 4.5  | Sync: server replay and anti-cheat, `SyncEngine`, AccountPanel, Settings server section, SyncConflictDialog, sync dot                                                                                                | –       |
| 4.6  | Friends, suggested players, remote visits and help, notices, `RemoteSocial`                                                                                                                                          | –       |
| 4.7  | Player market and buy transaction                                                                                                                                                                                    | –       |
| 4.8  | Leaderboard (verified and weekly XP)                                                                                                                                                                                 | –       |
| 4.9  | `online` Playwright project, `e2e-online` CI job, admin CLI, moderation, security checklist, `docs/server.md`. **Checkpoint D**                                                                                      | –       |
| 5.1  | `capacitor.config.ts`, `platform/native.ts` (back button, pause and resume, orientation, splash), safe-area variables, `build:native`, optional local notifications (`schedule.ts`)                                  | –       |
| 5.2  | `android.yml` (debug APK artifact), `docs/MOBILE.md`                                                                                                                                                                 | –       |
| 5.3  | `release.yml` (GHCR image, `dist` zip), Dependabot, tag v1.0.0. **Checkpoint E**                                                                                                                                     | –       |

**Ordering rules:**

- P3–P6 must land before any new action or save bump.
- 2.1 and 2.2 must land before every M2 feature.
- 2.8 (meta pipeline with quests) must land before 3.5.
- 3.3 must land before 3.8 and 4.2 (screens).
- 3.4 must land before 4.3 (stale clients must be able to update for the rules handshake).
- 3.8 (GroundIslet) must land before 4.2.
- 4.1 and 4.2 ship the complete offline social game before any server code.
- 4.5 must land before 4.6–4.8.

At each checkpoint: full Playwright run on both projects, `renderInfo` budget, screenshots refreshed in `docs/`, and a manual Android Chrome check.

### Critical Files for Implementation

- /home/user/Skyline-Garden/src/game/types.ts
- /home/user/Skyline-Garden/src/game/actions.ts (extract `commit.ts`, add `commands.ts` and `tick.ts`, `ids.ts` guards)
- /home/user/Skyline-Garden/src/game/save.ts (`readSave`, `KeyValueStore`, new `migrations.ts`, `looksValid`)
- /home/user/Skyline-Garden/src/core/Game.ts (`exec`, `replaceState`, `blocked`, options constructor, settings)
- /home/user/Skyline-Garden/src/render/GardenView.ts and /home/user/Skyline-Garden/src/input/InputController.ts (slot union, GardenSource, ScreenHost split)
