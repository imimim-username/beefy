# beefyFinal — Session Context

Use this file to resume work on the project without conversation history.

---

## Repo location

```
/workspace/extra/gits/beefyFinal/
```

Branch: `main`. Remote: `git@github.com:imimim-username/beefy.git` (SSH — push from your own machine; environment lacks SSH key).

---

## Project overview

A locally-hosted web tool (SNES pixel-art UI) for deploying Beefy Finance vaults + strategies. Supports 6 strategy types: `chef`, `gauge`, `aura`, `convex`, `curvegauge`, `stakedao`.

**Stack:** React frontend (Vite) + Node/Express backend + Hardhat for deploy scripts.

Run backend: `node backend/server.js` (port 8788 by default).
Run frontend: `npm run dev` from `frontend/`.

---

## Source layout

```
contracts/
  BeefyVaultV7.sol
  utils/StratFeeManager.sol
  interfaces/
    IAuraBooster.sol, IAuraRewardPool.sol
    IBalancerVault.sol, IBalancerV3Router.sol   ← v3 support
    ICurveLiquidityGauge.sol                     ← Curve gauge + Minter
    IConvexBooster.sol, IConvexRewardPool.sol
    ICurvePool.sol, IGauge.sol, IMasterChef.sol
    ISolidlyRouter.sol, IUniswapRouterETH.sol
    IBeefyVaultV7.sol
  strategies/
    StrategyCommonChefLP.sol
    StrategyCommonGaugeLP.sol
    StrategyCurveConvexLP.sol
    StrategyAuraLP.sol                           ← Balancer v2+v3
    StrategyCommonCurveLP.sol                    ← Curve gauge + StakeDAO
scripts/
  deploy_chef.cjs
  deploy_gauge.cjs
  deploy_aura.cjs
  deploy_convex.cjs
  deploy_curvegauge.cjs                          ← minterEnabled=true
  deploy_stakedao.cjs                            ← minterEnabled=false
  _deploy_params.json                            ← written by deployer.js at runtime
  debug_aura_approve.cjs                         ← diagnostic: tests each approve() individually
  find_aura_pool.cjs                             ← diagnostic: scans booster for pool by BPT addr
  test_aura_init.cjs                             ← integration test: full fork init of StrategyAuraLP
backend/
  server.js       ← Express API
  resolver.js     ← LP token / staking validation (on-chain)
  deployer.js     ← orchestrates Hardhat dry-run + execute
  chains.js       ← server-side chain config + beefyAddresses
frontend/src/
  App.jsx         ← 8-step wizard router
  chainInfo.js    ← client-side chain config (mirror of chains.js)
  api/client.js   ← API calls to backend
  components/
    Step1Chain.jsx      Step2LP.jsx       Step3Staking.jsx
    Step4Rewards.jsx    Step5Routes.jsx   Step6VaultInfo.jsx
    Step7Review.jsx     StepDeploy.jsx    PixelBox.jsx
  hooks/useDebounce.js
hardhat.config.cjs   ← Solidity 0.8.28, optimizer on
context/
  SESSION_CONTEXT.md   ← this file
```

---

## Strategy types and what they deploy

| strategyType | Contract deployed | Deploy script |
|---|---|---|
| `chef` | `StrategyCommonChefLP` | `deploy_chef.cjs` |
| `gauge` | `StrategyCommonGaugeLP` | `deploy_gauge.cjs` |
| `aura` | `StrategyAuraLP` | `deploy_aura.cjs` |
| `convex` | `StrategyCurveConvexLP` | `deploy_convex.cjs` |
| `curvegauge` | `StrategyCommonCurveLP` (minterEnabled=true) | `deploy_curvegauge.cjs` |
| `stakedao` | `StrategyCommonCurveLP` (minterEnabled=false) | `deploy_stakedao.cjs` |

---

## Key addresses (Ethereum mainnet — chain ID 1)

| Name | Address |
|---|---|
| Aura Booster | `0xA57b8d98dAE62B26Ec3bcC4a365338157060B234` (280 pools) |
| Convex Booster | `0xF403C135812408BFbE8713b5A23a04b3D48AAE31` |
| Balancer v2 Vault | `0xBA12222222228d8Ba445958a75a0704d566BF2C8` |
| Balancer v3 Vault | `0xbA1333333333a1BA1108E8412f11850A5C319bA9` |
| Balancer v3 Router | `0x5C6fb490BDFD3246EB0bB062c168DeCAF4bD9FDd` |
| CRV Minter | `0xd061D61a4d941c39E5453435B6345Dc261C2fcE0` |
| UniswapV2 Router | `0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D` |

---

## StrategyAuraLP — important notes

- Auto-detects Balancer v2 vs v3 at `initialize()` via `staticcall` probe on `getPoolId()`
- v2: uses `IBalancerVault.joinPool(bytes32 poolId, ...)`
- v3: uses `IBalancerV3Router.addLiquidityUnbalanced(pool, amounts, 0, false, "")`
- `balancerVersion` stored as `uint8` (2 or 3)
- **STASH-AURA bug fix**: `extraRewards(0).rewardToken()` can return STASH-AURA, a non-ERC20 internal token that reverts on `approve()`. Fixed with `try/catch` in `_giveAllowances()` — if approve fails, `aura` is set to `address(0)` to disable swapping.

### Known Aura pool (tested end-to-end on mainnet fork)
- LP: `0x1535D7CA00323Aa32BD62AEDdf7ca651e4b95966` (80ALCX-20WETH, Balancer v3)
- Aura pool ID: **277**
- crvRewards (rewardPool): `0x39b2b74b817f0A10a5fA67a3EDCf5705A750c43C`

---

## StrategyCommonCurveLP — important notes

- `minterEnabled=true` (Curve native gauge): `ICurveMinter.mint(gauge)` + `claim_rewards()`
- `minterEnabled=false` (StakeDAO): `claim_rewards(address)` handles CRV+SDT+extras in one call
- Shared `initialize()` signature for both

---

## LP detection (resolver.js)

Detection order:
1. UniswapV2 / Solidly pair (via `token0()` + `token1()`)
2. Balancer v2 BPT (via `getPoolId()`)
3. **Balancer v3 BPT** (via `getVault()` → `IBalancerV3Vault.getPoolTokens(pool)`)
4. Curve pool (via `coins(0)`)
5. Throw "Not a recognized LP token"

Returns `lpType`: `null` (V2/Solidly), `'balancer'`, or `'curve'`. Balancer also returns `balancerVersion: 2 | 3`.

---

## Backend API endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/chains` | list of supported chains |
| GET | `/api/validate-lp` | resolve LP token |
| GET | `/api/validate-chef` | validate MasterChef + pool |
| GET | `/api/validate-gauge` | validate Solidly gauge |
| GET | `/api/validate-aura` | validate Aura booster + pool |
| GET | `/api/validate-convex` | validate Convex booster + pool |
| GET | `/api/validate-curvegauge` | validate Curve native gauge |
| GET | `/api/validate-stakedao` | validate StakeDAO gauge |
| GET | `/api/curve-coin` | look up Curve pool coin at index |
| POST | `/api/dry-run` | deploy on forked chain |
| POST | `/api/execute` | deploy on live network |

---

## Frontend wizard steps

1. **Step1Chain** — select network
2. **Step2LP** — enter LP token address; auto-detects type and shows BALANCER V2/V3 badge
3. **Step3Staking** — pick strategy type (3×2 grid), enter staking address + pool ID; Curve pool fields appear after validation for convex/curvegauge/stakedao
4. **Step4Rewards** — enter reward token addresses
5. **Step5Routes** — configure swap routes (outputToNative, outputToLp0/1, outputToCoin)
6. **Step6VaultInfo** — vault name, symbol, strategist, unirouter
7. **Step7Review** — full review of all parameters, shows correct fields per strategy type
8. **StepDeploy** — dry-run → confirm → live deploy

---

## Form state fields passed to deploy scripts

Common: `chainId`, `strategyType`, `want`, `staking`, `poolId`, `rewardTokens`, `outputToNativeRoute`, `outputToLp0Route`, `outputToLp1Route`, `vaultName`, `vaultSymbol`, `unirouter`, `strategist`, `isStable`, `pendingRewardsFunctionName`

Curve-specific: `curvePool`, `coinIndex`, `nCoins`, `convexCoin`

Curve gauge: `minterEnabled`, `minter`

Aura v3: `balancerV3Router`

---

## Hardhat config notes

- Solidity: `0.8.28` (bumped from `0.8.19` — OZ v5 requires `^0.8.20`)
- Optimizer: enabled, 200 runs
- EVM target: `paris` (set by Hardhat default)
- Fork URL: set via `FORK_URL` env var at runtime (not in hardhat.config.cjs)
- Public RPC that works for mainnet fork: `https://ethereum.publicnode.com`

---

## Recent commits (newest first)

```
40d2847  fix: STASH-AURA approve revert + wrong Aura Booster address on mainnet
e2d2127  fix: bump Hardhat Solidity compiler to 0.8.28
e4cc5ff  feat: Balancer v3 Aura support + Curve native gauge + StakeDAO gauge
2e8e65a  feat: add Balancer v3 LP detection in resolver
7c74601  refactor: remove nativeIndex from StrategyAuraLP and frontend
af42dc6  (prior session baseline)
```

---

## Known issues / limitations

- SSH push not available in this environment — push from user's own machine
- `ethereum.publicnode.com` works as a free mainnet fork RPC; `eth.llamarpc.com` has missing trie nodes
- `chains.js` only has `balancerV3Router` and `crvMinter` on Ethereum mainnet (chain 1); other chains would need these added if Balancer v3 or Curve native gauges are deployed there
- No audit / formal verification of Solidity contracts — deployer's responsibility
