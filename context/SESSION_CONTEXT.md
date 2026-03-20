# beefyFinal — Session Context

Use this file to resume work on the project without conversation history.

---

## Repo location

```
/workspace/extra/gits/beefy/
```

Branch: `main`. Remote: `git@github.com:imimim-username/beefy.git` (SSH — works from this environment now).

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
hardhat.config.cjs   ← Solidity 0.8.28, optimizer on, evmVersion: paris
StrategyAuraLP_flat.sol  ← pre-flattened for Etherscan verification
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
| Beefy Vault Factory (ETH) | `0xC551dDCE8e5E657503Cd67A39713c06F2c0d2e97` |
| Beefy Vault Owner / Multisig (ETH) | `0x5B6C5363851EC9ED29CB7220C39B44E1dd443992` |

---

## StrategyAuraLP — important notes

- Auto-detects Balancer v2 vs v3 at `initialize()` via `staticcall` probe on `getPoolId()`
- v2: uses `IBalancerVault.joinPool(bytes32 poolId, ...)`
- v3: uses `IBalancerV3Router.addLiquidityUnbalanced(pool, amounts, 0, false, "")`
- `balancerVersion` stored as `uint8` (2 or 3)
- **STASH-AURA bug fix**: `extraRewards(0).rewardToken()` can return STASH-AURA, a non-ERC20 internal token that reverts on `approve()`. Fixed with `try/catch` in `_giveAllowances()` — if approve fails, `aura` is set to `address(0)` to disable swapping.
- **`beforeDeposit()` required**: The official Beefy vault factory vault calls `strategy.beforeDeposit()` before every deposit. Strategy must implement this (even as a no-op) or deposits will revert with `0x` error. Fixed in commit `7e5f2a4`.

### Known Aura pool (tested end-to-end on mainnet)
- LP: `0x1535D7CA00323Aa32BD62AEDdf7ca651e4b95966` (80ALCX-20WETH, Balancer v3)
- Aura pool ID: **277**
- crvRewards (rewardPool): `0x39b2b74b817f0A10a5fA67a3EDCf5705A750c43C`
- Gauge: `0x2F534f93928B99A4759a5C6a75a61b34132a06ff`

### First mainnet deploy (now abandoned — missing beforeDeposit)
- Vault: `0x3F465a42964291Ca9C657C3fF1EC96DEEBcaa294`
- Strategy: `0x88293c83aaad36a869e5302e0e277d7fe0053533` (verified on Etherscan)
- Both can be ignored — vault owner is Beefy multisig, strategy cannot be upgraded by deployer

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

## Hardhat config notes

- Solidity: `0.8.28` (bumped from `0.8.19` — OZ v5 requires `^0.8.20`)
- Optimizer: enabled, 200 runs
- **EVM target: `paris`** — explicitly set; critical for Etherscan verification match
- Fork URL: set via `FORK_URL` env var at runtime (not in hardhat.config.cjs)
- Public RPC that works for mainnet fork: `https://ethereum.publicnode.com`

---

## Etherscan verification (StrategyAuraLP)

- Use **Solidity (Single file)** with `StrategyAuraLP_flat.sol` (pre-generated in repo root)
- Compiler: `v0.8.28+commit.7893614a`
- Optimization: Yes, 200 runs
- **EVM Version: `paris`** ← critical — Etherscan defaults to a newer EVM and won't match
- Constructor args: none (strategy uses initializer pattern)
- The vault (cloned from factory) auto-verifies as a proxy

---

## Deployment flow notes

- Vault is cloned from `BeefyVaultV7Factory` — this is the OFFICIAL Beefy vault, not our `BeefyVaultV7.sol`
- The official vault calls `strategy.beforeDeposit()`, `strategy.deposit()`, `strategy.withdraw()`, `strategy.retireStrat()`, `strategy.balanceOf()`, `strategy.want()`
- Vault ownership transfers to `beefyAddresses.vaultOwner` (Beefy multisig) at end of deploy — deployer loses ability to upgrade strategy
- To seed the vault, you must first acquire the actual LP (BPT) token by adding liquidity on Balancer, then approve the vault, then deposit

---

## Recent commits (newest first)

```
7e5f2a4  fix: add beforeDeposit() to StrategyAuraLP
2c04e8f  chore: add flattened StrategyAuraLP.sol for Etherscan verification
2d4e005  fix: explicitly set evmVersion to paris in hardhat config
a2c1401  added context
40d2847  fix: STASH-AURA approve revert + wrong Aura Booster address on mainnet
71457bd  bug fixes
e2d2127  fix: bump Hardhat Solidity compiler to 0.8.28
e4cc5ff  feat: Balancer v3 Aura support + Curve native gauge + StakeDAO gauge
2e8e65a  feat: add Balancer v3 LP detection in resolver + UI warnings
7c74601  fix: compliance audit — align contracts and frontend with Beefy standards
```

---

## Known issues / limitations

- `chains.js` only has `balancerV3Router` and `crvMinter` on Ethereum mainnet (chain 1); other chains would need these added if Balancer v3 or Curve native gauges are deployed there
- `ethereum.publicnode.com` works as a free mainnet fork RPC; `eth.llamarpc.com` has missing trie nodes
- No audit / formal verification of Solidity contracts — deployer's responsibility
- The `StrategyAuraLP_flat.sol` in repo root needs to be regenerated after any contract changes: `npx hardhat flatten contracts/strategies/StrategyAuraLP.sol > /tmp/raw.sol` then strip duplicate SPDX lines
