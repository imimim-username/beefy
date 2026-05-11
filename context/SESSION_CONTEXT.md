# beefyFinal — Session Context

Use this file to resume work on the project without conversation history.

---

## Repo location

```
/workspace/extra/gits/beefy/
```

Branch: `main`. Remote: `git@github.com:imimim-username/beefy.git`

---

## Project overview

A locally-hosted web tool (SNES pixel-art UI) for deploying Beefy Finance vaults + strategies.
Supports **13 strategy types**: 6 LP strategies + 7 single-asset strategies.

**Stack:** React frontend (Vite) + Node/Express backend + Hardhat for deploy scripts.

Run backend: `node backend/server.js` or `npm start` (port 8788).
Run frontend: `npm run dev` from `frontend/` (port 5173, proxies /api/ to backend).
Run tests: `npm test` (Jest, 52 tests, all in `backend/tests/resolver.test.js`).

---

## Source layout

```
contracts/
  BeefyVaultV7.sol                     ← reference only; vault deployed via StrategyFactory
  utils/StratFeeManager.sol
  interfaces/
    IAuraBooster.sol, IAuraRewardPool.sol
    IBalancerVault.sol, IBalancerV3Router.sol, IBalancerV3Vault.sol
    ICurveLiquidityGauge.sol, ICurvePool.sol, ICurveMinter.sol
    IConvexBooster.sol, IConvexRewardPool.sol
    IGauge.sol, IMasterChef.sol
    ISolidlyRouter.sol, IUniswapRouterETH.sol
    IBeefyVaultV7.sol
  strategies/
    StrategyCommonChefLP.sol            ← custom; only chef uses this (deployed directly)
    StrategyCommonGaugeLP.sol           ← reference; actual deploy uses StrategyFactory
    StrategyCurveConvexLP.sol           ← reference
    StrategyCommonCurveLP.sol           ← reference (minterEnabled flag)
    StrategyAuraLP.sol                  ← DEPRECATED; do not use for new deployments

scripts/
  deploy_chef.cjs          ← StrategyCommonChefLP (custom deploy)
  deploy_gauge.cjs         ← StrategyFactory.createStrategy("StrategyVelodrome")
  deploy_aura.cjs          ← StrategyFactory.createStrategy("StrategyBalancerV3")
  deploy_convex.cjs        ← StrategyFactory.createStrategy("StrategyCurveConvexFactory")
  deploy_convex_l2.cjs     ← Convex L2 variant (different poolInfo tuple)
  deploy_curvegauge.cjs    ← StrategyFactory (minterEnabled=true)
  deploy_curvegauge_l2.cjs ← Curve gauge L2 (no CRV minter)
  deploy_stakedao.cjs      ← StrategyFactory (minterEnabled=false)
  deploy_erc4626.cjs       ← single-asset: ERC-4626 vault
  deploy_morpho.cjs        ← single-asset: Morpho vault (ERC-4626 compatible + Merkl)
  deploy_aave.cjs          ← single-asset: Aave v3 aToken
  deploy_compound.cjs      ← single-asset: Compound V3 Comet
  deploy_silov2.cjs        ← single-asset: Silo V2 market
  deploy_pendle.cjs        ← single-asset: Pendle PT vault
  deploy_tokemak.cjs       ← single-asset: Tokemak Autopool
  find_aura_pool.cjs       ← helper: scan Aura booster for pool by LP address
  verify_deploy.cjs        ← helper: post-deploy sanity checks
  _deploy_params.json      ← written by deployer.js at runtime (gitignored)

backend/
  server.js       ← Express API (all /api/* routes)
  resolver.js     ← all on-chain reads + validators (ethers.js)
  deployer.js     ← orchestrates Hardhat dry-run + execute (3× retry)
  chains.js       ← server-side chain config + beefyAddresses (8 chains)
  tokenRegistry.js← per-network reward token registry (registry/tokens.json)
  tests/
    resolver.test.js ← Jest unit tests (52 tests)

frontend/src/
  App.jsx                  ← 8-step wizard router + session persistence + ❓/📋 header buttons
  chainInfo.js             ← client-side chain config (mirror of chains.js — keep in sync)
  api/client.js            ← fetch wrappers for all backend endpoints
  hooks/useDebounce.js
  styles/global.css        ← SNES pixel-art theme (CSS vars: --gold, --cyan, --green, --red…)
  components/
    Step1Network.jsx       ← chain selection grid
    Step2LP.jsx            ← LP/token address → type detection + DexScreener health chips
    Step3Staking.jsx       ← strategy type picker (6 LP + 7 single-asset) + validation
    Step4Rewards.jsx       ← reward token selection (auto-detect + manual add)
    Step5Routes.jsx        ← swap routes (chef/gauge) OR depositToken picker (factory LP)
    Step6VaultName.jsx     ← vault name / moo-symbol / strategist / harvestOnDeposit
    Step7Review.jsx        ← full parameter review with ✎ Edit jump links
    StepDeploy.jsx         ← dry-run → live deploy → post-deploy checklist
    HelpModal.jsx          ← ❓ help modal (3 tabs: STEPS / STRATEGIES / TIPS)
    SupportedCombosModal.jsx ← 📋 chain×strategy coverage matrix (2 tabs: LP / SINGLE-ASSET)
    PixelBox.jsx           ← shared UI primitives (PixelBox, WizardSteps, RouteDisplay, etc.)

hardhat.config.cjs     ← Solidity 0.8.28, optimizer 200 runs, evmVersion: paris
solPatch/
  StrategyCommonChefLP_flat.sol ← flattened chef contract for Etherscan manual verification
  StrategyAuraLP_flat.sol       ← legacy stale file; do not use
context/
  SESSION_CONTEXT.md   ← this file
registry/
  tokens.json          ← persisted reward token registry (per chain)
```

---

## Strategy types

### LP strategies (for AMM pool tokens)

| strategyType | What is deployed | Deploy script |
|---|---|---|
| `chef` | `StrategyCommonChefLP` (custom, direct deploy) | `deploy_chef.cjs` |
| `gauge` | `StrategyVelodrome` via `StrategyFactory` | `deploy_gauge.cjs` |
| `aura` | `StrategyBalancerV3` via `StrategyFactory` | `deploy_aura.cjs` |
| `convex` | `StrategyCurveConvexFactory` via `StrategyFactory` | `deploy_convex.cjs` |
| `curvegauge` | `StrategyCurveConvexFactory` via `StrategyFactory` (no PID) | `deploy_curvegauge.cjs` |
| `stakedao` | `StrategyStakeDaoV2` via `StrategyFactory` | `deploy_stakedao.cjs` |

### Single-asset strategies (for yield-bearing tokens)

| strategyType | Vault type | Deploy script | Validated via |
|---|---|---|---|
| `erc4626` | Any ERC-4626 vault | `deploy_erc4626.cjs` | `asset()` |
| `morpho` | Morpho Blue / MetaMorpho (ERC-4626) | `deploy_morpho.cjs` | `asset()` |
| `aave` | Aave v3 aToken | `deploy_aave.cjs` | `UNDERLYING_ASSET_ADDRESS()` |
| `compound` | Compound V3 Comet | `deploy_compound.cjs` | `baseToken()` |
| `silov2` | Silo V2 market (ERC-4626) | `deploy_silov2.cjs` | `asset()` |
| `pendle` | Pendle PT/YT token | `deploy_pendle.cjs` | address entered (no contract probe) |
| `tokemak` | Tokemak Autopool | `deploy_tokemak.cjs` | `stakingToken()` + `rewardToken()` |

> Single-asset `want` is the yield-bearing token itself. Harvest: claim rewards → swap → underlying → deposit.
> Tokemak's `want` and `depositToken` are auto-derived from the rewarder at deploy time; do not fill them in the form.

---

## LP detection (resolver.js `resolveLpToken`)

Detection order — first match wins:

1. **Solidly pair** — calls `token0()`, `token1()`, `stable()` via `SOLIDLY_PAIR_ABI`
   - `stable()` returns `true`/`false` → `lpType: 'solidly'`
   - `stable()` throws (but `token0`/`token1` succeed) → `lpType: 'univ2'`
2. **Uni-V2 pair** — fallback via `PAIR_ABI` (no `stable()`) → `lpType: 'univ2'`
3. **Balancer v2 BPT** — via `getPoolId()` → `lpType: 'balancer'`, `balancerVersion: 2`
4. **Balancer v3 BPT** — via `getVault()` + `IBalancerV3Vault.getPoolTokens(pool)` → `lpType: 'balancer'`, `balancerVersion: 3`
5. **Curve pool** — via `coins(0)` + `coins(1)` → `lpType: 'curve'`, `nCoins: 2|3`
6. **Unknown ERC-20** — treated as single-asset vault → `lpType: 'single'`

All paths return `{ lpAddress, lpSymbol, lpType, token0, token1, ... }`.
`lpType` is always set — `null` is never returned (was a bug, fixed).

---

## Step3Staking — LP type suggestion & mismatch detection

```js
// From Step3Staking.jsx:
const actualLpType = form.lpInfo?.lpType || null;

const LP_TYPE_SUGGESTION = {
  solidly:  { primary: 'gauge' },
  balancer: { primary: 'aura' },
  curve:    { primary: 'curvegauge' },
  univ2:    { primary: 'chef' },
};

const LP_TYPE_COMPAT = {
  chef:       ['univ2', 'solidly'],
  gauge:      ['solidly', 'univ2'],
  aura:       ['balancer'],
  convex:     ['curve'],
  curvegauge: ['curve'],
  stakedao:   ['curve'],
};

// If lpType === 'single' → automatically suggest erc4626 as default
// If stratType selected is incompatible with actualLpType → red mismatch warning
```

---

## Form field naming — key fields used by deploy scripts

| Form field | Form state var | Deploy script reads |
|---|---|---|
| `form.want` | `want` | `params.want` |
| `form.staking` | `stakingAddr` | `params.staking` |
| `form.poolId` | `poolId` | `params.poolId` |
| `form.merkl` | `merklClaimer` | `params.merkl` |
| `form.compoundDistributor` | `compoundDistributor` | `params.compoundDistributor` |
| `form.siloGauge` | `siloGauge` | `params.siloGauge` |
| `form.depositToken` | `depositToken` | `params.depositToken` |
| `form.rewardTokens` | `rewardTokens` | `params.rewardTokens` |
| `form.harvestOnDeposit` | `harvestOnDeposit` | `params.harvestOnDeposit` |
| `form.vaultName` | `vaultName` | `params.vaultName` |
| `form.vaultSymbol` | `vaultSymbol` | `params.vaultSymbol` |

> All param names are consistent between form and deploy scripts (verified in code review).

---

## Key addresses — Ethereum mainnet (chain ID 1)

| Name | Address |
|---|---|
| Aura Booster | `0xA57b8d98dAE62B26Ec3bcC4a365338157060B234` (280+ pools) |
| Convex Booster | `0xF403C135812408BFbE8713b5A23a04b3D48AAE31` |
| Balancer v2 Vault | `0xBA12222222228d8Ba445958a75a0704d566BF2C8` |
| Balancer v3 Vault | `0xbA1333333333a1BA1108E8412f11850A5C319bA9` |
| Balancer v3 Router | `0x5C6fb490BDFD3246EB0bB062c168DeCAF4bD9FDd` |
| CRV Minter | `0xd061D61a4d941c39E5453435B6345Dc261C2fcE0` |
| UniswapV2 Router | `0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D` |
| Beefy Vault Factory | `0xC551dDCE8e5E657503Cd67A39713c06F2c0d2e97` |
| Beefy Strategy Factory | `0x52941De3eDE234ae6B8608597440Ac3394C64Ae8` |
| BeefySwapper | `0x0000830DF56616D58976A12D19d283B40e25BEEF` |
| Beefy Vault Owner | `0x5B6C5363851EC9ED29CB7220C39B44E1dd443992` |
| **Beefy Strategist Multisig** | `0x1c9270ac5C42E51611d7b97b1004313D52c80293` ← `transferOwnership` target |

### Beefy Strategist Multisig — all chains

| Network | strategyOwner |
|---|---|
| Ethereum (1) | `0x1c9270ac5C42E51611d7b97b1004313D52c80293` |
| BNB Chain (56) | `0x65CF7E8C0d431f59787D07Fa1A9f8725bbC33F7E` |
| Polygon (137) | `0x6fd13191539e0e13B381e1a3770F28D96705ce91` |
| Arbitrum (42161) | `0x6d28afD25a1FBC5409B1BeFFf6AEfEEe2902D89F` |
| Optimism (10) | `0x979a73011e7AB17363d38bee7CF0e4B5032C793e` |
| Base (8453) | `0x3B60F7f25b09E71356cdFFC6475c222A466a2AC9` |
| Avalanche (43114) | `0x37DC61A76113E7840d4A8F1c1B799cC9ac5Aa854` |
| Fantom (250) | `0x847298aC8C28A9D66859E750456b92C2A67b876D` |

---

## Aura vault architecture — use StrategyBalancerV3 via StrategyFactory

Beefy requires audited implementations. The Aura flow:

```
StrategyFactory.createStrategy("StrategyBalancerV3")
  → clones beacon proxy → points to audited implementation
```

Harvest flow inside `StrategyBalancerV3`:
1. `IAuraRewardPool(rewardPool).getReward()` — claims BAL + AURA
2. BeefySwapper swaps BAL + AURA → native (WETH) automatically
3. If `depositToken != native`, swaps native → depositToken
4. Single-asset join: `balancerVault.unlock(balancerJoin)` → BPT

`deploy_aura.cjs` calls `StrategyFactory.createStrategy("StrategyBalancerV3")` and initialises with gauge address, booster, balancerVault, pid, reward tokens, and Addresses struct.

### StrategyAuraLP — DEPRECATED

Our custom `StrategyAuraLP.sol` was rejected by Beefy (not audited). It remains in the repo for
reference only. Do not deploy it. All Aura vaults now use the factory path above.

---

## Hardhat config

- Solidity: `0.8.28`
- Optimizer: enabled, 200 runs
- **EVM target: `paris`** — do not change; critical for Etherscan bytecode match
- Fork URL: set via `FORK_URL` env var at runtime
- Reliable free ETH mainnet RPC: `https://ethereum.publicnode.com`

---

## Etherscan verification

### Factory strategies (gauge, aura, convex, curvegauge, stakedao, all single-asset)

No manual action needed. The strategy is a beacon proxy; Etherscan auto-shows "Read as Proxy / Write as Proxy".

### Chef (StrategyCommonChefLP) — manual

```bash
npx hardhat flatten contracts/strategies/StrategyCommonChefLP.sol > solPatch/StrategyCommonChefLP_flat.sol
```

Go to `{blockExplorer}/address/{strategyAddr}#code` → **Verify and Publish**

| Setting | Value |
|---|---|
| Type | Solidity (Single file) |
| Compiler | `v0.8.28+commit.7893614a` |
| **EVM Version** | **`paris`** ← critical |
| Optimization | Yes, 200 runs |
| License | MIT |
| Constructor args | blank (strategy uses `initialize()`) |

---

## Backend API endpoints

| Method | Path | Notes |
|---|---|---|
| GET | `/health` | server health + chain IDs |
| GET | `/api/chains` | all supported chains |
| GET | `/api/resolve-lp` | `?chainId=&lp=` → lpType + token metadata |
| GET | `/api/check-existing-vault` | `?chainId=&lp=` → Beefy API duplicate check |
| GET | `/api/validate-chef` | `?chainId=&chef=&poolId=` |
| GET | `/api/validate-gauge` | `?chainId=&gauge=` |
| GET | `/api/validate-aura` | `?chainId=&booster=&pid=` |
| GET | `/api/validate-convex` | `?chainId=&booster=&pid=` |
| GET | `/api/validate-curvegauge` | `?chainId=&gauge=` |
| GET | `/api/validate-stakedao` | `?chainId=&gauge=` |
| GET | `/api/validate-erc4626` | `?chainId=&vault=[&want=]` → `{ valid, underlying }` |
| GET | `/api/validate-aave` | `?chainId=&aToken=[&want=]` → `{ valid, underlying }` |
| GET | `/api/validate-compound` | `?chainId=&comet=[&want=]` → `{ valid, baseToken }` |
| GET | `/api/validate-silov2` | `?chainId=&silo=[&want=]` → `{ valid, underlying }` |
| GET | `/api/validate-tokemak` | `?chainId=&rewarder=` → `{ ok, stakingToken, rewardToken, underlying }` |
| GET | `/api/curve-coin` | `?chainId=&curvePool=&coinIndex=` |
| GET | `/api/curve-coins` | `?chainId=&curvePool=` → all coins (up to 4) |
| GET | `/api/find-pool-id` | `?chainId=&booster=&lp=` → scan newest-first for match |
| GET | `/api/reward-tokens` | `?chainId=&stratType=&staking=[&rewardPool=]` |
| GET | `/api/check-swapper-route` | `?chainId=&depositToken=&swapper=&native=` → calls `getAmountOut` |
| POST | `/api/suggest-routes` | body: `{chainId, rewardToken, token0, token1}` |
| GET | `/api/resolve-token` | `?chainId=&address=` → ERC-20 symbol/name/decimals |
| GET | `/api/tokens/:chainId` | saved reward token registry |
| POST | `/api/tokens/:chainId` | add token to registry |
| DELETE | `/api/tokens/:chainId/:address` | remove token from registry |
| POST | `/api/deploy/dryrun` | fork + deploy (isolated, no real funds) |
| POST | `/api/deploy/execute` | live deploy |

---

## Frontend wizard steps

1. **Step1Network** — select network (8 chains shown as coloured grid cards)
2. **Step2LP** — enter LP/token address; auto-detects type; DexScreener TVL/volume/age health chips; duplicate vault check
3. **Step3Staking** — strategy type picker (6 LP + 7 single-asset); LP type suggestion banner; mismatch warning; per-strategy validation (chef poolId, aura pid auto-detect, curve coin picker, ERC4626 asset check, Tokemak rewarder probe, etc.)
4. **Step4Rewards** — reward tokens auto-detected from staking contract; reorder with ▲▼; add by address
5. **Step5Routes** — for chef/gauge: swap route editor (native + LP0 + LP1); for factory LP: depositToken picker with live BeefySwapper route check; for single-asset: native route only
6. **Step6VaultName** — vault name / moo-symbol (auto-suggested from LP symbol); strategist address (localStorage remembered); harvestOnDeposit (defaults true on L2)
7. **Step7Review** — full summary; ✎ Edit buttons jump to any step; LP-aware display (shows Token0/Token1 for LP, Asset Address for single-asset); all single-asset strategy labels correct
8. **StepDeploy** — dry-run → confirm → live deploy → post-deploy checklist (verify, test, transfer ownership, beefy-v2 PR, beefy-api PR)

### Additional UI

- **❓ Help button** (gold, top-right of header) → `HelpModal.jsx` with 3 tabs: STEPS (accordion), STRATEGIES (reference cards), TIPS
- **📋 Coverage button** (cyan, next to ❓) → `SupportedCombosModal.jsx` with 2 tabs: LP STRATEGIES (collapsible per-chain list with colour-coded strategy pills and DEX examples), SINGLE-ASSET (per-strategy chain coverage)
- **Session persistence**: form + step auto-saved to `localStorage` on every change; "✕ clear & restart" link in header; storage version key prevents stale state after schema changes

---

## Deployment flow

1. User fills wizard → form state built up across 8 steps
2. Step 7 review → DRY-RUN button → POST `/api/deploy/dryrun`
3. Backend writes `_deploy_params.json`, forks chain with Hardhat, runs appropriate `deploy_*.cjs`, returns stdout/stderr
4. User reviews dry-run output → DEPLOY button → POST `/api/deploy/execute`
5. Backend re-runs deploy on live network, returns vault + strategy addresses
6. UI shows post-deploy checklist

### Deployer retry logic

`deployer.js` retries up to 3× with 5 s / 10 s / 15 s backoff on transient RPC errors (502/503/504, ECONNRESET, ETIMEDOUT).

### beforeDeposit requirement

Beefy's vault factory calls `strategy.beforeDeposit()` (selector `0x573fef0a`) on every deposit.
All strategy contracts must implement this, even as a no-op. If a deposit reverts with `0x` and no message, check for this selector on Tenderly.

---

## beefy-v2 vault listing process

1. Deploy vault + strategy with this tool
2. For chef: generate flat file + verify on Etherscan (EVM=paris, Single file). Factory strategies: auto-verified.
3. Make a small test deposit to prove the vault accepts funds
4. Call `strategy.transferOwnership(strategyOwner)` — chain-specific multisig address in table above
5. Fork [beefyfinance/beefy-v2](https://github.com/beefyfinance/beefy-v2)
6. Add vault JSON entry to **top** of `src/config/vault/{network}.json`
7. Open PR — Netlify CI validates automatically

### beefy-api PR (required for TVL display)

A second PR to `beefyfinance/beefy-api` adds oracle/pricing config. Without it the vault shows $0 TVL even after the beefy-v2 PR merges. Ask Beefy team in Discord.

### Common CI failures

| Error | Fix |
|---|---|
| `should update strat owner` | Transfer strategy ownership to Beefy multisig |
| `eol pool is empty` | Vault has no deposits — seed it first |
| `invalid earnContractAddress` | Vault address wrong or on wrong network |

---

## Known issues / limitations

- `chains.js` only has `balancerV3Router` and `crvMinter` on Ethereum mainnet; add to other chains if deploying there
- `ethereum.publicnode.com` is reliable for mainnet fork; `eth.llamarpc.com` has missing trie nodes / 502s
- No audit of `StrategyCommonChefLP.sol` — deployer's responsibility
- After any change to `StrategyCommonChefLP`, regenerate the flat file:
  ```bash
  npx hardhat flatten contracts/strategies/StrategyCommonChefLP.sol > solPatch/StrategyCommonChefLP_flat.sol
  ```

---

## Deployed vaults on Ethereum mainnet (reference)

### 80ALCX-20WETH Balancer v3 via Aura

- LP / BPT: `0x1535D7CA00323Aa32BD62AEDdf7ca651e4b95966`
- Aura pool ID: **277**
- Vault: `0xdCd6f80F8375A0eF8D7BDA20705ca1a9B2981255`
- Strategy: `0x99A41e95B1052EF71491D600DA03363dbC330Ed0`
- Strategy ownership transferred to `0x1c9270…` (Beefy ETH multisig)
- beefy-v2 PR submitted; listing pending review

---

## Recent changes (newest first)

- feat: supported chains & strategies coverage modal (SupportedCombosModal.jsx + 📋 button)
- feat: add ❓ help modal (HelpModal.jsx — 3 tabs: STEPS, STRATEGIES, TIPS)
- fix: resolver.js — add `lpType: 'solidly'|'univ2'` to Uni-V2/Solidly return (was missing, breaking LP type suggestion in Step3)
- fix: Step7Review — single-asset strategy display (labels, hide token1/LP routes, add merkl/compoundDistributor/siloGauge rows)
- test: resolver.test.js — 44 new tests for resolveLpToken lpType + all single-asset validators (52 total)
- feat: single-asset strategies (erc4626, morpho, aave, compound, silov2, pendle, tokemak) — full wizard support + deploy scripts
- feat: post-deploy checklist inline in StepDeploy
- fix: Aura vaults now use StrategyFactory + StrategyBalancerV3 (not custom StrategyAuraLP)
- fix: deployer.js retry logic for transient RPC errors
