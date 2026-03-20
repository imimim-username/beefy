# beefyFinal — Session Context

Use this file to resume work on the project without conversation history.

---

## Repo location

```
/workspace/extra/gits/beefy/
```

Branch: `main`. Remote: `git@github.com:imimim-username/beefy.git` (SSH — works from this environment).

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
  deploy_aura.cjs                                ← passes explicit _aura address to initialize()
  deploy_convex.cjs
  deploy_curvegauge.cjs                          ← minterEnabled=true
  deploy_stakedao.cjs                            ← minterEnabled=false
  _deploy_params.json                            ← written by deployer.js at runtime
backend/
  server.js       ← Express API
  resolver.js     ← LP token / staking validation (on-chain)
  deployer.js     ← orchestrates Hardhat dry-run + execute (3× retry on transient RPC errors)
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
hardhat.config.cjs   ← Solidity 0.8.28, optimizer 200 runs, evmVersion: paris
solPatch/            ← flattened contracts for Etherscan verification
  StrategyAuraLP_flat.sol   ← regenerate after any contract change (see below)
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
| Aura Booster | `0xA57b8d98dAE62B26Ec3bcC4a365338157060B234` (280+ pools) |
| Convex Booster | `0xF403C135812408BFbE8713b5A23a04b3D48AAE31` |
| Balancer v2 Vault | `0xBA12222222228d8Ba445958a75a0704d566BF2C8` |
| Balancer v3 Vault | `0xbA1333333333a1BA1108E8412f11850A5C319bA9` |
| Balancer v3 Router | `0x5C6fb490BDFD3246EB0bB062c168DeCAF4bD9FDd` |
| CRV Minter | `0xd061D61a4d941c39E5453435B6345Dc261C2fcE0` |
| UniswapV2 Router | `0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D` |
| Beefy Vault Factory (ETH) | `0xC551dDCE8e5E657503Cd67A39713c06F2c0d2e97` |
| Beefy Vault Owner (ETH) | `0x5B6C5363851EC9ED29CB7220C39B44E1dd443992` |
| **Beefy Strategist Multisig (ETH)** | `0x1c9270ac5C42E51611d7b97b1004313D52c80293` ← strategy `transferOwnership` target |

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

## StrategyAuraLP — important notes

- Auto-detects Balancer v2 vs v3 at `initialize()` via `staticcall` probe on `getPoolId()`
- v2: uses `IBalancerVault.joinPool(bytes32 poolId, ...)`
- v3: uses `IBalancerV3Router.addLiquidityUnbalanced(pool, amounts, 0, false, "")`
- `balancerVersion` stored as `uint8` (2 or 3)
- **`balancerPoolId = 0` is correct for v3** — Balancer v3 uses the pool address directly; no bytes32 poolId is needed

### STASH-AURA bug (fixed in current code)

`extraRewards(0)` on an Aura reward pool returns a **stash wrapper token**, not the real AURA token.
Its `rewardToken()` returns STASH-AURA (`0x5aAeb...`) which reverts on `approve()`.

**Fix (already applied):** `initialize()` now takes an explicit `address _aura` parameter.
`deploy_aura.cjs` extracts the AURA address from the user-supplied `rewardTokens` array
(Step 4 of the wizard — user enters AURA as a reward token; script picks the one that
isn't the primary output token). Real AURA address on mainnet: `0xC0c293ce456fF0ED870ADd98a0828Dd4d2903DBF`.

```solidity
// initialize() signature (current):
function initialize(
    address _want,
    address _booster,
    uint256 _pid,
    address[] calldata _outputToNativeRoute,
    address _aura,               // ← explicit; formerly auto-detected (broken)
    address _balancerV3Router,
    CommonAddresses calldata _commonAddresses
) external onlyOwner
```

### `beforeDeposit()` requirement (fixed in current code)

The official Beefy vault factory calls `strategy.beforeDeposit()` before every deposit.
If the strategy doesn't implement it, deposits revert silently (`0x` error, selector `0x573fef0a`).
Current code has `function beforeDeposit() external {}` as a no-op.

### Known Aura pool — 80ALCX-20WETH (tested end-to-end on mainnet)

- LP / BPT: `0x1535D7CA00323Aa32BD62AEDdf7ca651e4b95966` (Balancer v3)
- Aura pool ID: **277**
- crvRewards (rewardPool): `0x39b2b74b817f0A10a5fA67a3EDCf5705A750c43C`
- Gauge: `0x2F534f93928B99A4759a5C6a75a61b34132a06ff`
- Balancer pool page: `https://balancer.fi/pools/ethereum/v3/0x1535d7ca00323aa32bd62aeddf7ca651e4b95966`

### Deployed vaults on Ethereum mainnet

| Deploy | Vault | Strategy | Status |
|---|---|---|---|
| First (abandoned — missing `beforeDeposit`) | `0x3F465a42964291Ca9C657C3fF1EC96DEEBcaa294` | `0x88293c83aaad36a869e5302e0e277d7fe0053533` | Ignore |
| Second (abandoned — 502 RPC crash mid-deploy) | partially deployed, uninitialized | — | Ignore |
| **Third (current — live, ownership transferred)** | `0xdCd6f80F8375A0eF8D7BDA20705ca1a9B2981255` | `0x99A41e95B1052EF71491D600DA03363dbC330Ed0` | Active |

Third deploy tx: `0xb3065afc437aff3873c2760cd0bef9c114503c7fbf82b94b8a749d7c2d35955b`
Block: `24700288` (timestamp `1774028675`)
Deployer: `0x4AD74f5F37dc152CCd29bD1279a1e5DcAC2C87AF`
Strategy ownership transferred to Beefy strategist multisig (`0x1c9270...`).
Beefy-v2 PR submitted — listing pending review.

### beefy-v2 vault entry (submitted in PR)

```json
{
  "id": "balancerv3-ethereum-80alcx-20weth",
  "name": "80ALCX/20WETH V3",
  "type": "standard",
  "token": "80ALCX/20WETH V3",
  "tokenAddress": "0x1535D7CA00323Aa32BD62AEDdf7ca651e4b95966",
  "tokenDecimals": 18,
  "tokenProviderId": "balancer",
  "earnContractAddress": "0xdCd6f80F8375A0eF8D7BDA20705ca1a9B2981255",
  "earnedToken": "mooAura80ALCX-20WETH",
  "earnedTokenAddress": "0xdCd6f80F8375A0eF8D7BDA20705ca1a9B2981255",
  "oracle": "lps",
  "oracleId": "balancerv3-ethereum-80alcx-20weth",
  "status": "active",
  "createdAt": 1774028675,
  "platformId": "aura",
  "assets": ["ALCX", "WETH"],
  "risks": {
    "complex": false,
    "curated": false,
    "notAudited": false,
    "notBattleTested": true,
    "notCorrelated": true,
    "notTimelocked": false,
    "notVerified": false,
    "synthAsset": false
  },
  "strategyTypeId": "lp",
  "addLiquidityUrl": "https://balancer.fi/pools/ethereum/v3/0x1535d7ca00323aa32bd62aeddf7ca651e4b95966/add-liquidity",
  "network": "ethereum"
}
```

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
| POST | `/api/dry-run` | deploy on forked chain (temporary — no real funds) |
| POST | `/api/execute` | deploy on live network |

---

## Frontend wizard steps

1. **Step1Chain** — select network
2. **Step2LP** — enter LP token address; auto-detects type and shows BALANCER V2/V3 badge
3. **Step3Staking** — pick strategy type (3×2 grid), enter staking address + pool ID; Curve pool fields appear after validation for convex/curvegauge/stakedao
4. **Step4Rewards** — enter reward token addresses (for Aura: include AURA token here)
5. **Step5Routes** — configure swap routes (outputToNative, outputToLp0/1, outputToCoin)
6. **Step6VaultInfo** — vault name, symbol, strategist, unirouter
7. **Step7Review** — full review of all parameters, shows correct fields per strategy type
8. **StepDeploy** — dry-run → confirm → live deploy → **post-deploy checklist** (new)

### Post-deploy checklist (StepDeploy.jsx — shown after every live deploy)

Four inline steps with auto-filled links and addresses:

1. **Verify strategy on Etherscan** — flatten command, exact compiler settings, direct link to `#code`
2. **Test deposit** — direct link to vault `#writeContract`, warning if deposit reverts
3. **Transfer strategy ownership** — multisig address pre-filled from `chainInfo`, direct strategy `#writeContract` link
4. **Submit beefy-v2 PR** — pre-filled JSON template (vault/strategy addr + moo-symbol auto-populated), field notes, PR title convention, CI error explanations

---

## Hardhat config notes

- Solidity: `0.8.28` (bumped from `0.8.19` — OZ v5 requires `^0.8.20`)
- Optimizer: enabled, 200 runs
- **EVM target: `paris`** — explicitly set; critical for Etherscan verification match
- Fork URL: set via `FORK_URL` env var at runtime (not in hardhat.config.cjs)
- Ethereum mainnet live RPC: `https://ethereum.publicnode.com` (reliable; `eth.llamarpc.com` has 502s)

---

## Etherscan verification procedure

1. Generate flattened file:
   ```bash
   npx hardhat flatten contracts/strategies/StrategyAuraLP.sol > solPatch/StrategyAuraLP_flat.sol
   ```
   (regenerate whenever the contract changes)

2. Go to `{blockExplorer}/address/{strategyAddress}#code` → **Verify and Publish**

3. Settings:
   - Type: **Solidity (Single file)**
   - Compiler: `v0.8.28+commit.7893614a`
   - **EVM Version: `paris`** ← do not leave on default (Shanghai/Cancun causes PUSH0 mismatch)
   - Optimization: Yes, 200 runs
   - License: MIT

4. Paste full contents of `solPatch/StrategyAuraLP_flat.sol`

5. **Constructor arguments: leave blank** — strategy uses `initialize()` pattern

The vault (cloned from factory) auto-verifies as a proxy on Etherscan.

---

## Deployment flow notes

- Vault is **cloned** from `BeefyVaultV7Factory` — this is the official Beefy vault, not our `BeefyVaultV7.sol`
- The official vault calls `strategy.beforeDeposit()` on every deposit (selector `0x573fef0a`) — strategy must implement this even as a no-op
- Vault ownership transfers to `beefyAddresses.vaultOwner` at deploy end
- **Strategy ownership stays with deployer until manually transferred** — deployer must call `strategy.transferOwnership(strategyOwner)` before submitting a Beefy listing PR
- Dry-run forks are isolated Hardhat processes — discarded after the run, no real contracts or funds

### Deployer retry logic (`backend/deployer.js`)

The `execute()` function retries up to 3× with 5s/10s/15s backoff on transient RPC errors (502/503/504, ECONNRESET, ETIMEDOUT). This handles the `eth.llamarpc.com` class of failures.

---

## Beefy vault listing process

1. Deploy vault + strategy with this tool
2. Generate flattened .sol and verify strategy on Etherscan (EVM=paris, single file)
3. Make a small test deposit into the vault to prove it accepts funds
4. Call `strategy.transferOwnership(strategyOwner)` from deployer wallet
5. Fork [beefyfinance/beefy-v2](https://github.com/beefyfinance/beefy-v2)
6. Add vault JSON entry to **top** of `src/config/vault/{network}.json`
7. Open PR — Netlify CI validates automatically

### Common Beefy CI failures

| Error | Fix |
|---|---|
| `should update strat owner` | Transfer strategy ownership to Beefy multisig (step 4) |
| `eol pool is empty` | Vault has no deposits — seed it first (step 3) |

### beefy-v2 vault JSON schema notes

- `id` and `oracleId` must match exactly — lowercase kebab-case (e.g. `balancerv3-ethereum-80alcx-20weth`)
- `earnContractAddress` = `earnedTokenAddress` = vault address
- `tokenAddress` = LP / BPT address
- `platformId`: `aura` | `convex` | `curve` | `stakedao` | (platform-specific for chef/gauge)
- `tokenProviderId`: `balancer` (Aura/Balancer) | `curve` (Convex/Curve) | etc.
- `notCorrelated: true` if assets are different tokens; `false` if they are pegged (e.g. USDC/USDT)
- `notBattleTested: true` for all new vaults — Beefy's team updates this after review
- `notVerified: false` means the contract IS verified on Etherscan (confusing double negative)
- `createdAt` = Unix timestamp of the deploy block

---

## Recent commits (newest first)

```
bf6e0c4  feat: add post-deploy checklist to UI and README
(prev)   fix: explicit _aura param in StrategyAuraLP.initialize()
(prev)   fix: regenerate StrategyAuraLP_flat.sol into solPatch/ with beforeDeposit
(prev)   fix: retry logic in deployer.js for transient RPC errors
(prev)   fix: change ETH live RPC to ethereum.publicnode.com
7e5f2a4  fix: add beforeDeposit() to StrategyAuraLP
2c04e8f  chore: add flattened StrategyAuraLP.sol for Etherscan verification
2d4e005  fix: explicitly set evmVersion to paris in hardhat config
a2c1401  added context
40d2847  fix: STASH-AURA approve revert + wrong Aura Booster address on mainnet
```

---

## Known issues / limitations

- `chains.js` only has `balancerV3Router` and `crvMinter` on Ethereum mainnet (chain 1); other chains need these added if Balancer v3 or Curve native gauges are deployed there
- `ethereum.publicnode.com` is the reliable free mainnet fork RPC; `eth.llamarpc.com` has missing trie nodes / 502s
- No audit / formal verification of Solidity contracts — deployer's responsibility
- After any change to a strategy contract, the corresponding flat file in `solPatch/` must be regenerated:
  ```bash
  npx hardhat flatten contracts/strategies/StrategyAuraLP.sol > solPatch/StrategyAuraLP_flat.sol
  ```
- The `StrategyAuraLP_flat.sol` in the repo root is stale — use `solPatch/StrategyAuraLP_flat.sol`
