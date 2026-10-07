# Skyline Garden: cross-cutting engineering design for M2 to M5

## 0. Findings in the current code that this design depends on

1. **Bad ids from untrusted input corrupt state.** `PLANTS[plantId]` and `count(counts, key)` read plain object literals, so they also see inherited keys. For example, `sellCrop(state, 'constructor', 1)` passes every check: `def` is `Object`, `count()` returns a function and the `<` comparison against it is false. The action commits with `gold = NaN` and writes a string into `crops.constructor`. The UI can't trigger this, but the server will receive ids as JSON, so every id needs an `Object.hasOwn` check before the server reuses `src/game`.
2. **`src/game` is not yet safe to run on the server.**
   - `save.ts` uses the DOM type `Storage` (`Pick<Storage,...>`).
   - `actions.ts` calls `structuredClone`, which has no type unless DOM or Node types are loaded.
   - `createNewGame` defaults its seed to `Math.random()`.
   - `time.ts` calls `Date.now()`.
   - ESLint only blocks imports in `src/game`. It does not block globals such as `window` or `Math.random`.
3. **Ticks are not tied to actions.** The game ticks every 250 ms through `run(tick)`, and user actions run without a tick at the same `now`. When later actions start using randomness, the server's replay will diverge unless every action ticks first.
4. **A save that fails to load gets overwritten.** `deserialize` returns `null` for a corrupt save or one from a newer version. The game then starts a new game and autosaves over the old data. Once a PWA service worker can serve an older client, this will wipe saves.
5. **Toolchain facts.**
   - Node 22.22, npm 10.9, Vite 8.3 (Rolldown 1.2, which supports `output.codeSplitting.groups` and `resolve.tsconfigPaths`), TypeScript 6.0.3, Vitest 5.0.3.
   - `@playwright/test` is pinned exactly to 1.56.1 (Chromium build 1194).
   - esbuild is not installed.
   - The repo passes `prettier --check`.
   - The bundle is one 627 KB chunk (163 KB gzip).
   - The only branch is `claude/charming-ptolemy-n96r1j`. There is no `main` yet.
   - README's M3 roadmap line still mentions GLTF models, which contradicts the "everything procedural" decision.

---

## 1. CI/CD

### 1.1 Changes before adding workflows

- **`.nvmrc`**: set to `22`. In `package.json`, set `"engines": { "node": ">=22.13" }` (22.13 is the first version where `node:sqlite` needs no flag).
- **New scripts**:
  - `"format:check": "prettier --check ."`
  - `"size": "node scripts/check-size.mjs"`
  - `"test:deep": "FC_NUM_RUNS=5000 vitest run tests/invariants.test.ts"`
- **`playwright.config.ts`**:
  - `const CI = !!process.env.CI`
  - `forbidOnly: CI`, `retries: CI ? 1 : 0`, `workers: CI ? 2 : undefined`
  - `reporter: CI ? [['github'], ['html', { open: 'never' }], ['list']] : [['list']]`
  - `trace: CI ? 'on-first-retry' : 'retain-on-failure'`
  - `use.serviceWorkers: 'block'` (only `pwa.spec.ts` overrides it with `'allow'`)
  - `webServer.command`: when `PW_PREBUILT` is set, run `npx vite preview --port 4173 --strictPort` without building; otherwise keep the current build-then-preview command.
  - `reuseExistingServer: !CI`
  - Projects: `mobile` runs every spec. `desktop` sets `grep: /@smoke/` and only runs tests tagged `test('...', { tag: '@smoke' }, ...)`. This keeps SwiftShader run time manageable. `online` is added only when `PW_ONLINE=1` (M4).
- **`vite.config.ts`**:
  - `define: { __BUILD_SHA__: JSON.stringify(process.env.VITE_BUILD_SHA ?? 'dev') }`, used for the service worker cache name, the "about" screen and the server handshake.
  - `build.rolldownOptions.output.codeSplitting = { groups: [{ name: 'three', test: /node_modules[\\/]three/ }] }`. three gets its own chunk, so deploys that change only game code invalidate about 20 KB instead of 165 KB.
  - Lower `chunkSizeWarningLimit` to 600.

### 1.2 `.github/workflows/ci.yml`

```yaml
name: CI
on: { push: { branches: ['**'] }, pull_request: {}, workflow_dispatch: {} }
concurrency: { group: ci-${{ github.ref }}, cancel-in-progress: true }
permissions: { contents: read }
jobs:
  quality:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with: { node-version-file: .nvmrc, cache: npm }
      - run: npm ci
      - run: npm run typecheck        # later: web + game(no-DOM) + server
      - run: npm run lint
      - run: npm run format:check
      - run: npm test                 # vitest projects: web (+ server from M4)
      - run: npx vite build
        env: { VITE_BUILD_SHA: '${{ github.sha }}' }
      - run: npm run size
      - uses: actions/upload-artifact@v4
        with: { name: dist, path: dist, retention-days: 7 }
  e2e:
    needs: quality
    runs-on: ubuntu-latest
    timeout-minutes: 30
    strategy: { fail-fast: false, matrix: { project: [mobile, desktop] } }
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with: { node-version-file: .nvmrc, cache: npm }
      - run: npm ci
      - id: pw
        run: echo "v=$(npx playwright --version | awk '{print $2}')" >> "$GITHUB_OUTPUT"
      - id: pwcache
        uses: actions/cache@v4
        with: { path: ~/.cache/ms-playwright, key: 'pw-${{ runner.os }}-${{ steps.pw.outputs.v }}-chromium-shell' }
      - if: steps.pwcache.outputs.cache-hit != 'true'
        run: npx playwright install --with-deps --only-shell chromium
      - if: steps.pwcache.outputs.cache-hit == 'true'
        run: npx playwright install-deps chromium      # OS libs are not cacheable
      - uses: actions/download-artifact@v4
        with: { name: dist, path: dist }
      - run: npx playwright test --project=${{ matrix.project }}
        env: { PW_PREBUILT: '1' }       # SwiftShader args already in config
      - if: always()
        uses: actions/upload-artifact@v4
        with: { name: 'pw-${{ matrix.project }}', path: "playwright-report\ntest-results", retention-days: 14 }
  # Added in M4 step 4.3:
  # server:      docker/setup-buildx-action + docker/build-push-action (context ., file server/Dockerfile,
  #              push false, cache type=gha), then `docker run` and curl /api/health.
  # e2e-online:  npm ci; npm run build -w server; PW_ONLINE=1 npx playwright test --project=online
```

Notes:

- The e2e job tests exactly the bytes the quality job built.
- The browser cache key includes the Playwright version, so the `package.json` pin and the cache stay coupled.
- `--only-shell` is enough because headless runs use chromium-headless-shell, which includes SwiftShader.
- Server unit tests need no separate job because they run inside `npm test` through Vitest projects.

### 1.3 `.github/workflows/pages.yml` (deploy only after CI is green on `main`)

```yaml
name: Pages
on:
  workflow_run: { workflows: [CI], types: [completed], branches: [main] }
  workflow_dispatch: {}
permissions: { contents: read, pages: write, id-token: write }
concurrency: { group: pages, cancel-in-progress: false }
jobs:
  build:
    if: github.event_name == 'workflow_dispatch' || (github.event.workflow_run.conclusion == 'success' && github.event.workflow_run.event == 'push')
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
        with: { ref: '${{ github.event.workflow_run.head_sha || github.sha }}' }
      - uses: actions/setup-node@v5
        with: { node-version-file: .nvmrc, cache: npm }
      - run: npm ci && npx vite build
        env: { VITE_BUILD_SHA: '${{ github.event.workflow_run.head_sha || github.sha }}' }
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v4
        with: { path: dist }
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment: { name: github-pages, url: '${{ steps.d.outputs.page_url }}' }
    steps: [{ id: d, uses: actions/deploy-pages@v4 }]
```

- The Vite base is `./`, so the site works at `https://minh-le1710.github.io/Skyline-Garden/`.
- Artifact-based Pages deploys don't run Jekyll, so no `.nojekyll` file is needed.
- No SPA fallback is needed.

**How the user enables Pages** (add to README):

1. Create `main` from the current branch and set it as the default branch (Settings → General). `workflow_run` only fires for workflow files on the default branch, and the `github-pages` environment only accepts deploys from it by default.
2. Settings → Pages → Build and deployment → Source: **GitHub Actions**.
3. Actions → Pages → **Run workflow** once.
4. Private repos need a paid plan for Pages.

### 1.4 Later and optional workflows

- **`nightly.yml`** (schedule): `npm run test:deep`, `npx playwright test --repeat-each=3` to catch flaky tests, and `npm audit --omit=dev`.
- **`release.yml`** (tag `v*`): build and push the server image to `ghcr.io/minh-le1710/skyline-garden-server`, and attach a zip of `dist`.
- **`android.yml`** (M5, manual trigger): GitHub's ubuntu runners include the Android SDK, so this job can run `setup-java`, `npm ci`, `npx vite build`, `npx cap sync android`, then `./gradlew assembleDebug` in `android/`, and upload the unsigned debug APK. The user still builds signed APK/IPA files locally.
- **`.github/dependabot.yml`**: weekly, grouped, for npm and github-actions. Ignore `@playwright/test` so it is bumped by hand together with the cache key.
- **Branch protection on `main`**: require `quality` and `e2e (mobile)`.

---

## 2. Repository layout once `/server` exists

**Decision: npm workspaces, with the web app staying at the repository root and `server/` as the only workspace.** Do not move the client into `packages/game` or `apps/web`. That move would touch about 30 import paths, the Vite and Playwright configs and git history, for little gain: purity is already enforced by lint plus a no-DOM tsconfig (below). If a third consumer of `src/game` appears, `src/game` can later become its own package.

```
/                         package.json  "workspaces": ["server"]
  src/game/               pure rules (shared with the server; no DOM, no time or random sources)
  src/protocol/  [M4]     pure HTTP DTO types + constants (shared; same lint rules as src/game)
  src/audio/ src/social/ src/net/   impure client layers (src/net is lazy-loaded)
  src/render/mine/        lazy chunk
  tests/  tests/fixtures/saves/  e2e/  e2e/online/
  scripts/  check-size.mjs, gen-icons.ts (procedural PNG icons via node:zlib), freeze-fixtures.ts
  server/  package.json(@skyline/server), tsconfig.json, vite.config.ts (SSR build + vitest),
           src/{index.ts, app.ts, db/, routes/, services/replay.ts}, tests/, Dockerfile
  docker-compose.yml  .dockerignore  capacitor.config.ts [M5]  android/ ios/ [M5]
```

### 2.1 How the server uses shared code

- `server/tsconfig.json`:
  - `"moduleResolution": "Bundler"`. This is required: `src/game` uses extensionless imports, which `NodeNext` would reject.
  - `"lib": ["ES2022"]`, `"types": ["node"]`.
  - `"paths": { "@skyline/game": ["../src/game/index.ts"], "@skyline/protocol": ["../src/protocol/index.ts"] }`. Don't use `baseUrl`; TypeScript 6 deprecates it.
- **Bundling**: use the toolchain that is already installed, with no esbuild and no tsx. `server/vite.config.ts` sets `build.ssr: 'src/index.ts'`, `ssr.noExternal: true`, `ssr.target: 'node'`, `resolve.tsconfigPaths: true` (or an explicit `resolve.alias`) and output `dist/index.mjs`.
  - three and preact can't leak into the server bundle: `src/game` can't import them (lint), and the server can only reach `@skyline/game` and `@skyline/protocol`.
  - Dev loop: `vite build --watch` alongside `node --watch dist/index.mjs`.
- **SQLite**: use `node:sqlite` (`DatabaseSync`), wrapped in a small `server/src/db/Db.ts` interface. This avoids native modules in `npm ci`, Docker, CI and this container. `better-sqlite3` can be swapped in later behind the same interface.
- **Server dependencies**: `fastify`, `@fastify/rate-limit`, `@fastify/cors`, `@fastify/static` (to serve the web build in the Docker image).

### 2.2 tsconfig split

Use separate `tsc -p` runs rather than project references. Project references require `composite`, which forces declaration emit and doesn't suit Vite's `noEmit` setup.

- `tsconfig.json`: as today (web, tests, e2e). Add `"exclude": ["server"]`.
- **New `tsconfig.game.json`**:
  ```json
  {
    "extends": "./tsconfig.json",
    "compilerOptions": { "lib": ["ES2022"], "types": [] },
    "include": ["src/game", "src/protocol"]
  }
  ```
  This proves that game code has no DOM or Node dependency. It requires:
  - replacing `Pick<Storage,...>` with `interface KeyValueStore { getItem(k: string): string | null; setItem(k: string, v: string): void }`;
  - adding `src/game/env.d.ts` with `declare function structuredClone<T>(value: T): T;`.
- Script: `"typecheck": "tsc -p tsconfig.json && tsc -p tsconfig.game.json && npm run typecheck -w server --if-present"`.
- Set `types` explicitly in every tsconfig, because TypeScript 6 changed its defaults.

### 2.3 ESLint changes (`eslint.config.js`)

Scope globals per area instead of giving browser and Node globals to everything.

- **`src/**`**: browser globals. Must not import `server/**`.
- **`server/**`, `scripts/**`, `*.config.ts`**: Node globals.
  - `no-restricted-imports` patterns: `three`, `preact`, `@preact/*`, `**/src/render/**`, `**/src/ui/**`, `**/src/core/**`, `**/src/input/**`, `**/src/audio/**`.
- **`src/game/**` and `src/protocol/**`**:
  - `globals.es2021` only.
  - Extend the existing import ban with `../i18n`, `../i18n/*`, `../input/*`, `../audio/*`, `../net/*`, `../social/*`, `node:*`.
  - `no-restricted-properties` for `Math.random` (message: use `Rng` with `state.rng`), `Date.now` (message: take `now` as a parameter), and, as warnings, `Math.exp`, `Math.log`, `Math.pow` and the trig functions. Their results can differ in the last bit between V8 (server) and JavaScriptCore (iOS clients), which would break replays; use lookup tables or integer math instead.
  - `no-restricted-syntax` for `new Date(...)`.
  - Override for `src/game/time.ts` (the `Clock`), which turns `no-restricted-properties` off.
  - `createNewGame` should require an explicit seed. Move the `Math.random()` default into `Game`.
- Add `server/dist`, `android`, `ios`, `public/icons` and `*.db` to the eslint ignores, `.prettierignore` and `.gitignore`.

### 2.4 Vitest projects

In the root `vite.config.ts`:

```ts
test.projects = [
  { extends: true, test: { name: 'web', include: ['tests/**/*.test.ts'], environment: 'node' } },
  'server',
];
```

`server/vite.config.ts` contains `test: { name: 'server', include: ['tests/**/*.test.ts'] }`. Optionally add `@vitest/coverage-v8` with thresholds on `src/game/**` (lines 90, branches 85).

---

## 3. Contracts every new feature must follow (introduced in Phase 0 and early M2)

1. **Command layer, `src/game/commands.ts`.**
   - `type Command = { t: 'plant'; floor; slot; plantId } | { t: 'harvest'; floor; slot } | { t: 'buySeed'; plantId; qty } | ...` covers every action. `applyCommand(state, cmd, now)` is a switch over existing actions, and `decodeCommand(json: unknown): Command | null` is a strict validator: integers, `Object.hasOwn(PLANTS, id)`, and no extra keys.
   - `Game.dispatch(cmd)` replaces the ad-hoc closures. It always applies `tick(state, now)` and then the command at the same `now`, and the server replays the same way.
   - Fuzz tests, the server replay and debug tooling all run through this layer.
   - Every new action must add a Command variant, a decoder case and a fast-check arbitrary.
2. **One file per feature.** Move `commit` and `fail` to `src/game/commit.ts`. Each feature lives in `src/game/<feature>.ts` with its config in `src/game/config/<feature>.ts`. `actions.ts` stays M1-only.
3. **Progression systems run inside the pure action.** `commit()` calls `applyMeta(draft, events, now)` (`src/game/meta.ts`). This updates daily-quest counters, achievements and pet XP from the events of that commit, and may append `questCompleted` or `achievementUnlocked` events, which are not processed again. Never put these in UI listeners, or the server's replay will diverge.
4. **Random-number streams.** Replace `rngSeed` with `rng: Record<'orders'|'pests'|'balloon'|'quests'|'forge'|'mine'|'npc', number>`. The `orders` stream keeps the old seed, so existing order sequences don't change. Within one stream, process due items in `readyAt` order.
5. **No per-tick probabilities.** Schedule random outcomes when the thing is created and store the timestamp. For example, a pest's `pestAt` is drawn at plant time. Never use "each tick has a p% chance", because the outcome would then depend on tick frequency (250 ms on the client, command timestamps on the server, one large tick after time offline). This is enforced by the tick-granularity property test (§5).
6. **Snapshot derived values at start.** Store durations and rewards when something starts, as `PlantedCrop.growMs` already does. This applies to machine jobs, balloon trips and mine runs, so later config changes don't alter running jobs or old saves.
7. **Day boundaries.** Use `dayIndex(now) = Math.floor((now + DAY_OFFSET_MS) / DAY_MS)` with a fixed UTC+7 offset in config. Never call `getTimezoneOffset` inside `src/game`.
8. **One item registry** (`src/game/config/items.ts`: `ItemId`, `kind: 'crop'|'good'|'material'|'ore'|'tool'`, `sellPrice`, `storage: 'barn'|'none'`). Replace `crops: Counts<PlantId>` with `items: Counts<ItemId>` before machines, the forge and the mine land. All grants go through `addItems(state, items)` with a capacity check, so storage can never overflow.
9. **No `undefined` in state.** Use `null`. States are compared by JSON on the server and by `toStrictEqual` in tests.
10. **Rules hash.** `src/game/rules.ts` exports `RULES_REVISION` (bumped by hand when formulas change) and `RULES_HASH`, an FNV-1a hash of `JSON.stringify` over all config tables. A test pins the hash with `toMatchInlineSnapshot`, so any balance change has to be acknowledged. The server rejects clients whose `RULES_HASH` doesn't match its own.

---

## 4. Save-migration process

- **One SAVE_VERSION bump per feature commit that changes the shape of `GameState`.** Pages deploys `main` continuously, so real saves exist at every version. The commit that bumps the version must contain the feature's final shape; any later change needs another bump.
- **Each `MIGRATIONS[n]` (n → n+1) must be self-contained.** It copies any literal values it needs and never imports live config. Otherwise a later rebalance would silently change what old migrations produce.
- **`looksValid` is updated in the same commit.**
- **Fixtures** live in `tests/fixtures/saves/v{N}-{new|midgame|maxed}.json`.
  - `scripts/freeze-fixtures.ts` (run with `npm run fixtures:freeze`) writes fixtures for the current version only if they don't exist yet. It refuses to overwrite.
  - Workflow: run `fixtures:freeze` first, then bump the version.
  - `tests/migrations.test.ts` loads every fixture and checks that `deserialize` returns non-null at `SAVE_VERSION`, that `checkInvariants` passes, that new fields have their expected defaults, and that `serialize` then `deserialize` is stable.
  - The serialized `maxed` fixture must stay under 64 KB (localStorage budget).
- **Load safety** (Phase 0):
  - `loadGame` returns `{ status: 'ok'|'empty'|'corrupt'|'newer', state?, raw? }`.
  - On `corrupt`, copy the raw save to `skyline-garden/save.backup.<ts>` before starting a new game.
  - On `newer`, `Game` sets `saveBlocked = true` (no autosave), shows "Có phiên bản mới, tải lại" ("A new version is available, reload") and asks the service worker to update.
- **Settings, account and session data live outside `GameState`**, so they never need migrations and are never server-validated: `skyline-garden/settings` (audio, locale, graphics, server URL) and `skyline-garden/account`.
- **Expected version table** (actual numbers are assigned in landing order):

| Version | Change                   |
| ------- | ------------------------ |
| v2      | Random-number streams    |
| v3      | Unified `items`          |
| v4      | Machines                 |
| v5      | Pot attributes and forge |
| v6      | Pests                    |
| v7      | Balloon                  |
| v8      | Daily quests             |
| v9      | Tutorial                 |
| v10     | Achievements             |
| v11     | Pet                      |
| v12     | Mine                     |
| v13     | NPC neighbors            |
| v14     | Roadside stall           |

- **Server**: its database schema has its own numbered migrations (`server/src/db/migrations/001_init.sql`, ...) tracked in a `schema_version` table. Cloud saves are stored with their `SAVE_VERSION` and migrated on read through the shared `deserialize`, so the same fixtures test the server.

---

## 5. Testing strategy

**Unit tests (Vitest, Node).** One file per pure module: `machines`, `forge`, `pests`, `balloon`, `quests`, `meta`, `tutorial`, `achievements`, `pet`, `mine`, `neighbors`, `stall`, `commands`, `items`. Each covers the happy path, every `ActionError`, and "does not mutate input": deep-freeze the input state in `tests/helpers.ts` (`frozen(s)`) so accidental mutation throws.

**Property tests** (add `fast-check` as a dev dependency) in `tests/invariants.test.ts`, with arbitraries in `tests/arbitraries.ts`. They generate random command sequences, each with an increasing `now`, and check the following after every step:

- `checkInvariants(state)` from `src/game/invariants.ts`:
  - gold, ruby and xp are non-negative finite integers;
  - `level === levelForXp(xp)` and `level ≤ MAX_LEVEL`;
  - `storageUsed ≤ storageCapacity`;
  - every count is a positive integer whose key is a known id;
  - floor and slot counts are correct;
  - `orders.length === orderSlotsForLevel(level)`;
  - `nextOrderId` is greater than every existing order id;
  - each feature adds its own checks, e.g. machine queue length within its slots.
- **Determinism**: the same seed and commands produce identical JSON.
- **Tick-granularity invariance**: ticking every 250 ms and ticking only at command times give identical states.
- **Tick no-op**: `tick` with nothing due returns the same object reference.
- **Save round-trip** for every generated state.
- **Bad commands**: `decodeCommand` rejects mutated or random JSON (including `__proto__` and `constructor` ids), and `applyCommand` never throws.
- Default `numRuns` is 200; nightly CI uses 5000. `Game.run` also calls `checkInvariants` in `?debug` and throws on failure, so E2E `pageerror` collection catches violations.

**Config and economy tests** (`tests/economy.test.ts`):

- recipes form an acyclic graph and every item is reachable from seeds;
- each machine output is worth more than its inputs, within a multiplier cap;
- orders and balloon rewards exceed the direct sale value;
- nothing can be bought from a shop and immediately sold for more;
- unlock levels are ≤ `MAX_LEVEL`;
- all prices are positive integers.

**i18n tests**: `en: Messages` gives key parity at compile time. `tests/i18n.test.ts` checks that `{param}` placeholders match between `vi` and `en`.

**E2E (Playwright).**

- Shared helpers move to `e2e/helpers.ts` (`openGame`, `state`, `screenPos`, `dragAcross`, `dismissLevelUp`), plus a `test.extend` fixture that fails the test on any `pageerror`.
- One spec per feature: `machines`, `forge`, `pests`, `balloon`, `quests`, `tutorial`, `achievements`, `pet`, `mine`, `audio`, `pwa`, `neighbors`, `stall`, `i18n`. Online specs go in `e2e/online/*` (auth, sync, friends, trade with two browser contexts, leaderboard).
- One test per spec is tagged `@smoke` so it also runs on desktop.
- New debug hooks:
  - `screenPos({ kind: 'slot'|'machine'|'balloon'|'pest'|'pet'|'mineTile', ... })` replaces the one-off position functions;
  - `dispatch(cmd)` sets up scenarios through legitimate actions;
  - `loadFixture(json)`, `exportSave()`;
  - `renderInfo()` (`renderer.info`: calls, triangles);
  - `canvasStats()`: renders, reads pixels, and returns unique-color and non-sky ratios;
  - `audioLog()`: names of the sound effects triggered;
  - `still(true)`: freezes animation time and particles;
  - `?debug` starts with the tutorial completed unless `?tutorial` is also given;
  - audio is muted under `?debug`;
  - `patch()` sets `game.tainted = true`, and the network layer refuses to upload a tainted state.
- **Visual smoke** (`e2e/visual.spec.ts`):
  - Tier 1, always on: for each screen, attach a screenshot to the report and assert `canvasStats().nonSkyRatio > threshold`. This catches black canvases and shader failures without image diffs.
  - Tier 2, opt-in: `toHaveScreenshot` on DOM panels with the canvas masked, Linux CI baselines only.
  - `UPDATE_DOCS_SHOTS=1` refreshes `docs/*.png` at checkpoints.
- **Performance E2E** (`e2e/perf.spec.ts`): fill 8 floors plus machines and pet using `dispatch`, then assert draw calls and triangles stay within budget.

**Server tests** (Vitest, `fastify.inject`, `:memory:` database):

- auth: register, login, expiry, rate limit;
- sync: a valid replay is accepted; tampered, future-dated, prototype-key, oversized or duplicate (`batchId`) batches are rejected;
- replay parity with the client reducer, using fast-check;
- trading: two concurrent purchases of one listing, of which exactly one succeeds;
- leaderboard: only verified XP counts;
- database migrations from empty to latest.

---

## 6. Performance budget

| Item                                                 | Budget (gzip), enforced by `scripts/check-size.mjs` and `size-budget.json` (fails CI) |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `three` vendor chunk                                 | ≤ 165 KB                                                                              |
| App entry (game, UI, sound-effects engine, tutorial) | ≤ 60 KB (about 20 KB today)                                                           |
| Total initial JS                                     | ≤ 220 KB (163 KB today)                                                               |
| CSS                                                  | ≤ 10 KB                                                                               |
| Lazy chunks                                          | mine ≤ 30 KB, music ≤ 10 KB, `src/net` and online UI ≤ 20 KB, `en` locale ≤ 8 KB      |

- **Code splitting**:
  - `import('./render/mine/MineScene')` when entering the mine, with its own render loop; dispose its geometries on exit.
  - Music generator after the first user gesture.
  - `src/net` only once a server URL is configured.
  - `en.ts` only when English is selected.
- **Render on demand** (`src/render/FrameScheduler.ts`):
  - render every frame while the camera has inertia, tweens or particles are active, or input is in progress;
  - otherwise cap at 30 fps for idle animation (ripe-plant sway, clouds);
  - `requestRender()` on state changes.
- **Adaptive pixel ratio**: start at `min(dpr, 2)`; drop to 1.5, then 1.25, if average frame time exceeds 22 ms for 2 s. A "Đồ họa: Cao/Thấp" (Graphics: High/Low) setting overrides this.
- **Runtime budgets** at a maxed garden: ≤ 250 visible draw calls (about 600 meshes exist; frustum culling shows 2–3 floors), ≤ 150k visible triangles, JS heap ≤ 80 MB.
  - If the draw-call budget fails, merge each plant's static meshes per growth stage with `BufferGeometryUtils.mergeGeometries` and vertex colors.
- **Other runtime rules**:
  - Handle `webglcontextlost` and `webglcontextrestored`.
  - Components that read `game.now` (updated 4 times per second) must stay cheap.

---

## 7. Commit sequence (main stays green after each commit)

Sizes: S ≈ under 250 changed lines, M ≈ 250–700, L ≈ 700–1500.

**Every commit must pass**: typecheck (all three tsconfigs), lint, format:check, unit tests, build and size. CI runs E2E automatically; locally, run at least the affected spec.

**At checkpoints, run all of**: the full `npx playwright test` (both projects), screenshot review, `docs/screenshot.png` refresh, `renderInfo` budget, and a manual Android Chrome check.

| #    | Commit                                                                                                                                                          | Size | Save | Checkpoint                                           |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ---- | ---------------------------------------------------- |
| P1   | `.nvmrc`, `format:check`, ci.yml, Playwright CI tweaks, README fixes (procedural instead of GLTF; CI badge)                                                     | S    | –    |                                                      |
| P2   | pages.yml, `__BUILD_SHA__` define, README "Bật GitHub Pages" (Enable GitHub Pages)                                                                              | S    | –    |                                                      |
| P3   | `e2e/helpers.ts` + pageerror fixture, `@smoke` tags, `renderInfo` and `canvasStats` hooks                                                                       | S    | –    |                                                      |
| P4   | Hardening: `Object.hasOwn` id guards (+ tests), `KeyValueStore`, `env.d.ts`, `tsconfig.game.json`, scoped ESLint, `commit.ts`, explicit seed                    | M    | –    |                                                      |
| P5   | `commands.ts` + `Game.dispatch` (tick then apply); move InputController/UI call sites to it                                                                     | M    | –    |                                                      |
| P6   | `invariants.ts`, fast-check, arbitraries, invariants/determinism/granularity tests, invariant assert in debug                                                   | M    | –    |                                                      |
| P7   | v1 fixtures, `migrations.test.ts`, `loadGame` status union, backup key, newer-version guard, rules hash and test                                                | S    | –    |                                                      |
| P8   | three vendor chunk, `check-size.mjs`, budget file                                                                                                               | S    | –    | **A**: full E2E; CI green on GitHub; Pages live      |
| 2.1  | Random-number streams                                                                                                                                           | S    | v2   |                                                      |
| 2.2  | Unified item registry, `addItems`; update UI, debug `grant`, e2e assertions                                                                                     | M    | v3   |                                                      |
| 2.3  | Machines: logic, config, tests, commands                                                                                                                        | M    | v4   |                                                      |
| 2.4  | Machines: procedural 3D models, `screenPos` support                                                                                                             | M    | –    |                                                      |
| 2.5  | Machines: panel, feedback, i18n, `machines.spec`                                                                                                                | M    | –    | **B1**: E2E, draw-call check, screenshots            |
| 2.6  | Pot attributes and forge logic                                                                                                                                  | M    | v5   |                                                      |
| 2.7  | Forge UI, pot visual variants, `forge.spec`                                                                                                                     | M    | –    |                                                      |
| 2.8  | Pests logic (scheduled at plant time)                                                                                                                           | M    | v6   |                                                      |
| 2.9  | Pests render, tool, `pests.spec`                                                                                                                                | M    | –    |                                                      |
| 2.10 | Balloon logic                                                                                                                                                   | M    | v7   |                                                      |
| 2.11 | Balloon 3D, panel, `balloon.spec`                                                                                                                               | M    | –    |                                                      |
| 2.12 | `meta.ts` pipeline + daily quests (fixed-timezone `dayIndex`)                                                                                                   | M    | v8   |                                                      |
| 2.13 | Quests UI, `quests.spec`                                                                                                                                        | M    | –    |                                                      |
| 2.14 | `economy.test.ts` + balance pass                                                                                                                                | S    | –    | **B**: end of M2                                     |
| 3.1  | `src/audio` (engine; pure sound-effect recipes and music composer), settings store, mute, `audioLog`                                                            | M    | –    |                                                      |
| 3.2  | PWA: manifest, custom service-worker Vite plugin (precache list, versioned cache, "update available" toast), `gen-icons.ts`, `pwa.spec`                         | M    | –    | **C1**: full E2E (service worker affects everything) |
| 3.3  | Tutorial logic, overlay, `tutorial.spec`                                                                                                                        | M    | v9   |                                                      |
| 3.4  | Achievements through the meta pipeline, panel, spec                                                                                                             | M    | v10  |                                                      |
| 3.5  | Companion pet: logic, procedural model, UI, spec                                                                                                                | L    | v11  |                                                      |
| 3.6  | Mine logic (seeded grid)                                                                                                                                        | M    | v12  |                                                      |
| 3.7  | Mine scene as lazy chunk, with input                                                                                                                            | L    | –    |                                                      |
| 3.8  | Mine UI, `mine.spec`, mine chunk budget                                                                                                                         | M    | –    |                                                      |
| 3.9  | English locale (lazy), language toggle, i18n tests                                                                                                              | M    | –    | **C**: end of M3                                     |
| 4.1  | Offline NPC neighbors (`SocialProvider` interface, `NpcProvider`), visit and help, spec                                                                         | L    | v13  |                                                      |
| 4.2  | Roadside stall with NPC buyers, spec                                                                                                                            | M    | v14  |                                                      |
| 4.3  | Workspaces, server skeleton (`/api/health`, `/api/meta`), tsconfig/ESLint/Vitest projects, Dockerfile, compose, CI server job                                   | M    | –    | **D1**: CI restructure and lockfile                  |
| 4.4  | `src/protocol`, database migrations, auth (scrypt, hashed tokens)                                                                                               | M    | –    |                                                      |
| 4.5  | Sync: command-log upload, server replay + `checkInvariants`, lazy `src/net`, account UI, server URL setting, version handshake                                  | L    | –    |                                                      |
| 4.6  | Friends, visiting real gardens (`NetProvider`)                                                                                                                  | M    | –    |                                                      |
| 4.7  | Player trading at the roadside stall (transactions, idempotency keys)                                                                                           | L    | –    |                                                      |
| 4.8  | Leaderboard (verified XP only)                                                                                                                                  | M    | –    |                                                      |
| 4.9  | `online` Playwright project, e2e-online CI job, security checklist                                                                                              | M    | –    | **D**: end of M4                                     |
| 5.1  | `capacitor.config.ts`, `@capacitor/*`, generated `android/` and `ios/`; native guards (no service worker, back button, safe areas, `navigator.storage.persist`) | M    | –    |                                                      |
| 5.2  | `android.yml` (debug APK artifact), `docs/MOBILE.md`                                                                                                            | S    | –    |                                                      |
| 5.3  | `release.yml` (GHCR image, dist zip), tag v1.0.0                                                                                                                | S    | –    | **E**: final                                         |

That is 43 commits, roughly 8 S, 28 M and 7 L.

**Ordering dependencies:**

- P5 and P6 must land before any new action, or every feature has to be retrofitted.
- P7 must land before the first version bump (2.1).
- 2.2 must land before machines, forge and mine.
- 2.12 must land before achievements and pet.
- 3.2 must land before M4, because the version handshake depends on being able to update stale clients.
- 4.1 and 4.2 come before the server, so the offline game is complete first; the server work then only adds a `NetProvider`.
- 4.3 must land before any server code, and 4.5 before 4.6–4.8.

**Hiding unfinished features:** a feature's logic commit adds no UI entry point, and its render commit is reachable only through debug hooks. Players only see the feature once the UI commit lands, while Pages keeps deploying `main`.

**Definition of done per feature:**

- pure module and config;
- version bump, frozen-literal migration, `looksValid` update, fixtures frozen before the bump;
- Command variant, decoder case and arbitrary;
- invariants extended;
- events, `feedback.ts` handling and vi/en i18n keys;
- unit tests;
- debug `screenPos` kind;
- E2E spec with a `@smoke` test;
- size and draw-call budgets pass;
- README "Cách chơi" (How to play) updated.

---

## 8. Risks and mitigations

**Save migrations**

- **Stale PWA clients overwriting newer saves.** Mitigated by the `newer` guard, the backup key and the "update available" flow (P7, 3.2).
- **Migrations that read live config.** Mitigated by the frozen-literals rule and fixture tests.
- **Intermediate save shapes deployed to Pages.** Mitigated by the one-bump-per-feature rule and the "final shape in the bump commit" rule.
- **localStorage unavailable or purged** (private mode, iOS WKWebView under storage pressure). Mitigated by a size cap, `navigator.storage.persist()`, and optionally mirroring the save through `@capacitor/preferences` in M5.

**Determinism and replay**

- **Per-tick probabilities and the order random draws happen in.** Mitigated by scheduling at creation time, per-subsystem streams, tick-first dispatch and the granularity property test.
- **Local timezone in daily resets.** Mitigated by a fixed offset.
- **Floating-point differences between V8 and JavaScriptCore.** Mitigated by the lint warnings and integer economy math.
- **Client/server rule mismatch.** Mitigated by `RULES_HASH`, `SAVE_VERSION` and `__BUILD_SHA__` in `GET /api/meta`. On mismatch the client turns online features off.
- **Pages can be ahead of a self-hosted server.** Pages auto-deploys, while a self-hosted server is updated by hand. Treat the web build bundled in the Docker image (served same-origin under `/api`) as the main online client; Pages connecting to a remote server is best-effort.
- **`undefined` in state.** Mitigated by the null-only rule.

**Mobile performance**

- **SwiftShader is not representative.** Mitigated by draw-call and triangle assertions plus manual device checks at checkpoints.
- **About 600 meshes at max garden.** Mitigated by frustum culling and merging per growth stage if the budget fails.
- **Mine scene memory leaks.** Mitigated by a dispose-on-exit test.
- **Battery drain.** Mitigated by render-on-demand, the 30 fps idle cap and adaptive pixel ratio.
- **iOS audio unlock and WebGL context loss.** Need explicit handlers.

**Server security**

- **Ids with prototype keys** (finding 1). Mitigated by `Object.hasOwn` guards and the strict `decodeCommand`.
- **Replay used as a denial-of-service.** Mitigated by ≤ 500 commands per batch, a 256 KB body limit, per-account and per-IP rate limits, and a cap on replay time.
- **Client timestamps.** Clamp each command's time to between the last accepted command's time and server time + 5 s, and require monotonic order.
- **Trusting a client-uploaded save.**
  - The server never accepts a whole save after linking; it accepts only commands.
  - The first upload of an offline save is flagged `unverified`, and only XP gained after linking counts on the leaderboard.
  - Debug-patched (`tainted`) states are never uploaded.
- **Bearer tokens in localStorage, needed because Pages to a self-hosted server is cross-origin.** Mitigated by a strict CSP, no `innerHTML` of dynamic data, a CORS allowlist (`ALLOWED_ORIGINS`), and HTTPS through Caddy in compose. Pages served over https cannot call an http server (mixed content).
- **Trade item duplication and races.** Mitigated by SQLite transactions, idempotency keys and WAL mode.
- **Data loss.** Mitigated by `VACUUM INTO` backups on the compose volume.
- **Database layer.** Prepared statements only; passwords hashed with scrypt.
- **`node:sqlite` is still experimental.** It sits behind the `Db` interface.

**CI**

- **SwiftShader flakiness and growing run time.** Mitigated by retries in CI, trace on retry, desktop running only `@smoke`, a mobile/desktop matrix and a nightly `--repeat-each` run.
- **Playwright version and cache key drifting apart.** Mitigated by excluding Playwright from Dependabot.
- **No `main` branch or Pages environment yet.** Requires the README steps in §1.3.

**Repository and build**

- **The workspace switch changes the lockfile.** It lands as its own checkpoint commit (D1).
- **The Docker build context must include `src/game`.** Use context `.` with a `.dockerignore`.
- **Fastify inside a single-file SSR bundle.** Avoid pino transports. If bundling fails, fall back to `npm ci --omit=dev -w server` in the runtime image.
- **Capacitor iOS project generation on Linux may be incomplete.** Document that it must be finished on a Mac.

### Critical files for implementation

- /home/user/Skyline-Garden/src/game/actions.ts (split into `commit.ts` and `commands.ts`; id hardening)
- /home/user/Skyline-Garden/src/game/save.ts (`KeyValueStore`, MIGRATIONS, load status union, `looksValid`)
- /home/user/Skyline-Garden/src/core/Game.ts (`dispatch` with tick first, `saveBlocked`, `tainted`, invariant assert)
- /home/user/Skyline-Garden/eslint.config.js (scoped globals, purity rules, server block)
- /home/user/Skyline-Garden/playwright.config.ts (CI, `PW_PREBUILT`, smoke grep, online project and webServer array)

Also important: /home/user/Skyline-Garden/vite.config.ts, /home/user/Skyline-Garden/package.json, /home/user/Skyline-Garden/tsconfig.json, /home/user/Skyline-Garden/src/debug.ts, /home/user/Skyline-Garden/e2e/core-loop.spec.ts.
