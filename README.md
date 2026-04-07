# 🐮 BeefyFinal — Beefy Vault Deployer

A locally-hosted web tool for deploying Beefy Finance vaults with a Super Nintendo–style UI.

Pick a network → enter LP token address → choose your staking contract → configure reward tokens → review swap routes → deploy — all from your browser.

---

## Prerequisites

- **Node.js** v18+ (v20 recommended)
- **npm** v9+
- A **private key** with enough native token for gas on the target network
- **RPC URLs** for the chains you want to deploy on (free tiers from Alchemy / Infura / Ankr work fine)

---

## Installation

```bash
# 1. Clone / navigate to the project
cd /path/to/beefyFinal

# 2. Install all dependencies (backend + frontend in one step)
npm run install:all

# 3. Copy the env template and fill it in
cp .env.example .env
$EDITOR .env
```

> Or install separately: `npm install` (backend) then `cd frontend && npm install` (frontend).

### .env reference

```
DEPLOYER_PK=0xYOUR_PRIVATE_KEY_HERE

RPC_ETH=https://ethereum.publicnode.com
RPC_BSC=https://bsc-dataseed.binance.org/
RPC_POLYGON=https://polygon-rpc.com
RPC_ARBITRUM=https://arb1.arbitrum.io/rpc
RPC_OPTIMISM=https://mainnet.optimism.io
RPC_BASE=https://mainnet.base.org
RPC_AVAX=https://api.avax.network/ext/bc/C/rpc
RPC_FANTOM=https://rpc.ftm.tools

PORT=8788
```

> **Never commit `.env` — it is in `.gitignore`.**

---

## Compile Contracts

```bash
npm run compile
```

This runs `npx hardhat compile` and writes ABI + bytecode to `artifacts/`.

---

## Running

You need **two terminals**:

### Terminal 1 — Backend (Express + Hardhat)
```bash
npm start          # production
# or
npm run dev        # with nodemon auto-reload
```

The server starts on `http://localhost:8788`.

### Terminal 2 — Frontend (Vite)
```bash
cd frontend
npm run dev
```

Open **http://localhost:5173** in your browser.

The Vite dev server proxies all `/api/` requests to the backend automatically.

---

## Deploying a Vault — Step by Step

| Step | What you do |
|------|------------|
| 1 — Network     | Pick the blockchain (Ethereum, BSC, Polygon, Arbitrum, Base, etc.) |
| 2 — LP Token    | Paste the LP token address. The tool detects the pool type (Uni-V2/Solidly, Balancer v2/v3, Curve) automatically. **Duplicate vault check**: if Beefy already has an active vault for this LP, a red banner appears with a link to the existing vault — saving you from doing unnecessary work. **LP health chips**: TVL, 24h volume, and pair age are fetched from DexScreener and shown as colour-coded badges (green ≥ $100K, gold = low). |
| 3 — Staking     | Choose the strategy type from six options. A **suggestion banner** recommends the correct type based on the LP detected in Step 2 — one click to apply. A **mismatch warning** appears if the selected strategy is incompatible with your LP type. |
|                 | • **MasterChef** — PancakeSwap, SushiSwap, etc. (needs Pool ID) |
|                 | • **Gauge** — Velodrome, Aerodrome, Solidly-style gauges |
|                 | • **Aura** — Balancer LP staked on Aura Finance (Pool ID **auto-detected** by scanning booster) |
|                 | • **Convex** — Curve LP staked on Convex Finance (Pool ID **auto-detected**; Curve pool **auto-filled** from gauge.pool()) |
|                 | • **Curve Gauge** — Curve native LiquidityGauge (Curve pool address **auto-filled** from gauge.pool()) |
|                 | • **StakeDAO** — StakeDAO sd-gauge (no external Minter; CRV distributed via `claim_rewards`) |
|                 | For Curve/Convex/StakeDAO, the **coin picker** auto-fetches all coins in the pool and presents a labelled dropdown (`0: USDC`, `1: USDT`, etc.) so you never have to guess the coin index. Commonly-liquid coins (USDC, USDT, WETH, DAI) are marked **LIQUID**. |
| 4 — Rewards     | Reward tokens are **auto-detected** from the staking contract and pre-selected (marked ⚡). Deselect any you don't want, add more by address. Use **▲▼** buttons to reorder — the first token is the primary output and drives fee calculations. |
| 5 — Deposit Token / Routes | For **factory strategies** (gauge, aura, convex, curvegauge, stakedao): pick the `depositToken`. Pool tokens are shown first; chain-specific WETH and USDC are offered as **"Other liquid options"** for routing flexibility. BeefySwapper support is verified **live on-chain** (calls `getAmountOut`) — green ✓ = confirmed route, gold ⚠ = known symbol but unconfirmed, red ✗ = no route detected. For **chef**: auto-suggested swap routes (reward→native, reward→LP0, reward→LP1). |
| 6 — Vault Name  | Vault name and moo-token symbol are **auto-suggested** from the LP token's own symbol (e.g. `Beefy 80ALCX-20WETH` / `moo80Alcx20Weth`). `harvestOnDeposit` defaults **true on L2 chains** (Optimism, Base, Arbitrum) where gas is cheap. **Address book**: the strategist address and router override are remembered in `localStorage` and pre-filled with a one-click "USE …" chip on subsequent vaults. |
| 7 — Review      | Full summary of all parameters with **✎ Edit** buttons on each section — click to jump directly to the relevant step without clicking Back repeatedly. Then click **DRY-RUN** to test on a forked chain first. |
| 8 — Deploy      | After reviewing dry-run output, click **DEPLOY FOR REAL** to broadcast. If the deploy fails, an **actionable error hint** explains the likely cause and links to the relevant step to fix it. The **beefy-v2 vault JSON** is auto-populated (id, name, assets, addLiquidityUrl, notCorrelated) with a one-click **COPY** button. |

> **Session persistence**: The wizard auto-saves your progress to `localStorage`. Refreshing or closing the tab will not lose your work. A "✕ clear & restart" link appears in the header to reset intentionally.

---

## Post-Deploy Checklist

After the live deploy completes, four more steps are required before Beefy will list your vault.
The UI shows these steps inline after deployment — this section documents them in detail.

### Step 1 — Verify the Strategy on Etherscan

**Factory strategies (gauge, convex, curvegauge, stakedao, aura):** No manual verification needed. Because the strategy is a beacon proxy cloned from Beefy's `StrategyFactory`, Etherscan auto-detects it and shows **"Read as Proxy" / "Write as Proxy"** pointing to the audited implementation. Simply open the strategy address on the block explorer and confirm the proxy tab appears.

**MasterChef (`chef`) only:** Etherscan source verification requires a **single flattened file**. Generate it from the project root:

```bash
npx hardhat flatten contracts/strategies/StrategyCommonChefLP.sol > solPatch/StrategyCommonChefLP_flat.sol
```

Then open the strategy contract on the block explorer and click **"Verify and Publish"**.
Choose **Solidity (Single file)** and use these exact settings:

| Setting | Value |
|---------|-------|
| Compiler version | v0.8.28+… |
| EVM version | **paris** ← critical — do not leave on default |
| Optimization | Yes, 200 runs |
| License | MIT (3) |

Paste the full contents of `solPatch/StrategyCommonChefLP_flat.sol` into the source code box.
Leave **Constructor Arguments** blank — strategies use `initialize()`, not a constructor.

> **Why `paris`?** The contracts compile with `evmVersion: 'paris'` (see `hardhat.config.cjs`).
> Etherscan defaults to Shanghai/Cancun which uses the `PUSH0` opcode (`5f`), while paris uses
> `PUSH1 0x00` (`6000`). This causes a byte-for-byte mismatch that fails verification.

---

### Step 2 — Test the Vault (Before Transferring Ownership)

Test all critical paths **before** transferring ownership — after transfer, any fixes require a timelocked multisig. The UI provides direct write-contract links for both vault and strategy after deployment.

1. **Deposit** — Call `deposit(amount)` on the vault with a small amount (a few dollars worth).
2. **Harvest** — Call `harvest()` on the **strategy**. Confirm it succeeds, then verify `pricePerFullShare` on the vault increased.
3. **Withdraw** — Call `withdraw(amount)` on the vault and confirm your LP is returned.

If any call reverts, trace it on [Tenderly](https://dashboard.tenderly.co) before proceeding. Common causes:
- Missing `beforeDeposit()` in strategy — Beefy's vault factory calls it on every deposit
- BeefySwapper has no registered swap route for the selected depositToken — try the wrapped native instead

---

### Step 3 — Transfer Strategy Ownership to Beefy's Multisig

Beefy's CI validator checks that your strategy's owner is their strategist multisig, not your
deployer wallet. The PR will fail with `"Pool X should update strat owner"` until this is done.

1. Go to the strategy on the block explorer → **Write Contract**
2. Connect your deployer wallet
3. Call `transferOwnership(newOwner)` with the chain-specific multisig address:

| Network | Beefy Strategist Multisig |
|---------|--------------------------|
| Ethereum | `0x1c9270ac5C42E51611d7b97b1004313D52c80293` |
| BNB Chain | `0x65CF7E8C0d431f59787D07Fa1A9f8725bbC33F7E` |
| Polygon | `0x6fd13191539e0e13B381e1a3770F28D96705ce91` |
| Arbitrum | `0x6d28afD25a1FBC5409B1BeFFf6AEfEEe2902D89F` |
| Optimism | `0x979a73011e7AB17363d38bee7CF0e4B5032C793e` |
| Base | `0x3B60F7f25b09E71356cdFFC6475c222A466a2AC9` |
| Avalanche | `0x37DC61A76113E7840d4A8F1c1B799cC9ac5Aa854` |
| Fantom | `0x847298aC8C28A9D66859E750456b92C2A67b876D` |

> **Warning:** Do this *after* confirming the vault works — once transferred, you cannot call
> admin functions (panic, unpause, etc.) from your own wallet.

---

### Step 4 — Submit a Vault Listing PR to beefy-v2

Fork [beefyfinance/beefy-v2](https://github.com/beefyfinance/beefy-v2) and add your vault entry
to the **top** of the array in `src/config/vault/{network}.json`.

The UI generates a **fully auto-populated template** after deployment — `id`, `oracleId`, `name`, `token`, `assets`, `addLiquidityUrl`, and `notCorrelated` are all filled from on-chain data. A **COPY** button copies the JSON directly. Review the values and adjust any that need refinement (especially `id` if token symbol formatting differs from Beefy's convention). Here is the full schema with notes:

```jsonc
{
  // id and oracleId must match exactly — lowercase kebab-case
  // Aura+Balancer v3 pattern: "balancerv3-{network}-{pool-slug}"
  // Convex+Curve pattern:     "curve-{network}-{pool-name}"
  "id":                  "balancerv3-ethereum-80alcx-20weth",
  "name":                "80ALCX/20WETH V3",         // human-readable
  "type":                "standard",
  "token":               "80ALCX/20WETH V3",          // same as name
  "tokenAddress":        "0x1535D7CA...",              // LP / BPT address (form.want)
  "tokenDecimals":       18,                           // almost always 18
  "tokenProviderId":     "balancer",                   // who issued the LP: "balancer", "curve", etc.
  "earnContractAddress": "0xVAULT...",                 // moo-token / vault address
  "earnedToken":         "mooAura80ALCX-20WETH",       // moo-token symbol from Step 6
  "earnedTokenAddress":  "0xVAULT...",                 // same as earnContractAddress
  "oracle":              "lps",
  "oracleId":            "balancerv3-ethereum-80alcx-20weth",  // same as id
  "status":              "active",
  "createdAt":           1774028675,                   // Unix timestamp of deploy block
  "platformId":          "aura",                       // "aura" | "convex" | "curve" | "stakedao" | etc.
  "assets":              ["ALCX", "WETH"],             // symbols of the underlying tokens
  "risks": {
    "complex":          false,
    "curated":          false,
    "notAudited":       false,
    "notBattleTested":  true,   // true for new vaults; Beefy's team updates this later
    "notCorrelated":    true,   // true if assets are different (ALCX ≠ WETH); false if pegged
    "notTimelocked":    false,
    "notVerified":      false,  // false = IS verified on block explorer
    "synthAsset":       false
  },
  "strategyTypeId":      "lp",
  "addLiquidityUrl":     "https://balancer.fi/pools/ethereum/v3/0x1535.../add-liquidity",
  "network":             "ethereum"
}
```

**PR title convention:**
```
feat(ethereum): add 80ALCX/20WETH Balancer v3 via Aura
```

Beefy runs a Netlify CI build on every PR that validates every vault entry. If it fails, read
the error message — it pinpoints the exact issue. Common failures:

| CI error | Fix |
|----------|-----|
| `should update strat owner` | Transfer strategy ownership (Step 3 above) |
| `eol pool is empty` | Your vault has no deposits — seed it first (Step 2) |
| `invalid earnContractAddress` | Vault address is wrong or not deployed on the correct network |
| Unknown field / schema error | Check the JSON for typos, trailing commas, or missing fields |

---

## Architecture

```
beefyFinal/
├── backend/
│   ├── server.js          # Express API server (all /api/* routes)
│   ├── chains.js          # Network configs + Beefy address book (8 chains)
│   ├── resolver.js        # On-chain reads via ethers.js (LP detection, validation)
│   ├── deployer.js        # Orchestrates Hardhat deploy scripts (dry-run + live)
│   └── tokenRegistry.js   # Per-network reward token registry (registry/tokens.json)
│
├── contracts/
│   ├── BeefyVaultV7.sol                     # Vault ERC-20 (reference only — deployed via factory)
│   ├── interfaces/                          # IAuraBooster, IBalancerVault, IConvexBooster,
│   │                                        # ICurveLiquidityGauge, ICurvePool, IGauge,
│   │                                        # IMasterChef, ISolidlyRouter, IUniswapRouterETH,
│   │                                        # IBeefyVaultV7, IBalancerV3Router
│   ├── utils/StratFeeManager.sol            # Fee management base contract
│   └── strategies/
│       ├── StrategyCommonChefLP.sol         # MasterChef-style farms
│       ├── StrategyCommonGaugeLP.sol        # Solidly/Velodrome gauge farms
│       ├── StrategyCurveConvexLP.sol        # Curve LP via Convex Finance
│       ├── StrategyCommonCurveLP.sol        # Curve native gauge + StakeDAO
│       └── StrategyAuraLP.sol               # ⚠ DEPRECATED — use StrategyBalancerV3 via factory
│
├── scripts/
│   ├── deploy_chef.cjs        # MasterChef vault deploy
│   ├── deploy_gauge.cjs       # Gauge vault deploy
│   ├── deploy_aura.cjs        # Aura vault (uses StrategyFactory + StrategyBalancerV3)
│   ├── deploy_convex.cjs      # Convex vault deploy
│   ├── deploy_curvegauge.cjs  # Curve native gauge deploy (minterEnabled=true)
│   ├── deploy_stakedao.cjs    # StakeDAO gauge deploy (minterEnabled=false)
│   └── _deploy_params.json    # Written at runtime by deployer.js (not committed)
│
├── solPatch/
│   └── StrategyAuraLP_flat.sol  # Flattened for Etherscan verification (regenerate after changes)
│
├── registry/
│   └── tokens.json        # Persisted reward token list (per chain, grows with each deploy)
│
├── context/
│   └── SESSION_CONTEXT.md # Project context for resuming work across sessions
│
├── frontend/
│   └── src/
│       ├── App.jsx                          # 8-step wizard router
│       ├── chainInfo.js                     # Frontend chain metadata (mirror of chains.js)
│       ├── api/client.js                    # API call wrappers
│       ├── hooks/useDebounce.js
│       ├── styles/global.css                # SNES pixel theme
│       └── components/
│           ├── Step1Network.jsx             # Chain selection
│           ├── Step2LP.jsx                  # LP token + type detection
│           ├── Step3Staking.jsx             # Strategy type + staking contract
│           ├── Step4Rewards.jsx             # Reward token selection
│           ├── Step5Routes.jsx              # Swap routes / Aura depositToken
│           ├── Step6VaultName.jsx           # Vault + moo-token naming
│           ├── Step7Review.jsx              # Full parameter review
│           ├── StepDeploy.jsx               # Dry-run → live deploy + post-deploy checklist
│           └── PixelBox.jsx                 # Shared UI primitives
│
├── hardhat.config.cjs     # Solidity 0.8.28, EVM=paris, optimizer 200 runs
├── package.json
├── .env.example
└── .gitignore
```

---

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| GET  | `/health` | Server health + supported chain IDs |
| GET  | `/api/chains` | List of supported networks |
| GET  | `/api/resolve-lp?chainId=56&lp=0x…` | Detect LP type (Uni-V2/Solidly/Balancer/Curve) and read constituent tokens |
| GET  | `/api/validate-chef?chainId=56&chef=0x…&poolId=1` | Validate MasterChef + poolId |
| GET  | `/api/validate-gauge?chainId=10&gauge=0x…` | Validate Solidly/Velodrome gauge |
| GET  | `/api/validate-aura?chainId=1&booster=0x…&pid=277` | Validate Aura Booster pool ID |
| GET  | `/api/validate-convex?chainId=1&booster=0x…&pid=123` | Validate Convex Booster pool ID |
| GET  | `/api/validate-curvegauge?chainId=1&gauge=0x…` | Validate Curve native LiquidityGauge |
| GET  | `/api/validate-stakedao?chainId=1&gauge=0x…` | Validate StakeDAO gauge |
| GET  | `/api/curve-coin?chainId=1&curvePool=0x…&coinIndex=0` | Resolve Curve pool coin by index |
| GET  | `/api/find-pool-id?chainId=1&booster=0x…&lp=0x…` | Scan booster.poolInfo() newest-first to find pool ID matching LP token (Convex / Aura) |
| GET  | `/api/reward-tokens?chainId=1&stratType=gauge&staking=0x…` | Auto-detect reward tokens from staking contract; `rewardPool=0x…` required for aura/convex |
| POST | `/api/suggest-routes` | Auto-suggest swap routes (body: `{chainId, rewardToken, token0, token1}`) |
| GET  | `/api/resolve-token?chainId=56&address=0x…` | Resolve ERC-20 symbol/name/decimals |
| GET  | `/api/tokens/:chainId` | Get saved reward tokens for a chain |
| POST | `/api/tokens/:chainId` | Save a new reward token |
| DELETE | `/api/tokens/:chainId/:address` | Remove a reward token |
| POST | `/api/deploy/dryrun` | Fork chain + deploy (no real funds, discarded after run) |
| POST | `/api/deploy/execute` | Deploy on live network |

---

## How Beefy Vaults Work (Quick Primer)

A Beefy vault consists of **two contracts**:

1. **BeefyVaultV7** (ERC-20) — Users deposit their LP tokens, receive proportional "moo-tokens". The vault holds user balances and calls into the strategy.

2. **Strategy contract** — Does all the yield work: stakes LP into the farm, calls `harvest()` to claim rewards, swaps them back into more LP (compounding), re-stakes.

This tool supports six strategy types:

| Strategy type | Contract | Audited? | Harvest source |
|---|---|---|---|
| `chef` | `StrategyCommonChefLP` (custom) | ⚠ unaudited | MasterChef farms (PancakeSwap, SushiSwap…) |
| `gauge` | `StrategyVelodrome` via StrategyFactory | ✓ official | Solidly/Velodrome/Aerodrome gauges |
| `aura` | `StrategyBalancerV3` via StrategyFactory | ✓ official | Aura Finance — BAL + AURA rewards |
| `convex` | `StrategyCurveConvexFactory` via StrategyFactory | ✓ official | Convex Finance — CRV + CVX rewards |
| `curvegauge` | `StrategyCurveConvexFactory` via StrategyFactory (NO_PID) | ✓ official | Curve native LiquidityGauge — CRV rewards |
| `stakedao` | `StrategyStakeDaoV2` via StrategyFactory | ✓ official | StakeDAO gauge — CRV + SDT via `claim_rewards` |

> **Factory strategies** (gauge, aura, convex, curvegauge, stakedao) use Beefy's official audited implementations cloned via `StrategyFactory` — no custom strategy contract is deployed. This is required for Beefy to accept the vault listing. Only `chef` (MasterChef) remains a custom contract, as no factory-compatible version exists yet.

The strategy exposes `deposit()` / `withdraw()` / `harvest()` to the vault and takes a small fee on each harvest (split between Beefy treasury, the strategist, and the harvester caller).

### Swap Routes (chef only)

When a MasterChef strategy harvests reward tokens, it needs to know how to turn them into LP:

- **outputToNativeRoute** — reward token → wrapped native (e.g. CAKE → WBNB). Fee split is taken in native.
- **outputToLp0Route** — reward token → LP token0 (half the remaining rewards)
- **outputToLp1Route** — reward token → LP token1 (other half)

The tool auto-suggests these routes from on-chain data. You can edit them manually in Step 5.

### Deposit Token (all factory strategies)

Factory strategies (gauge, aura, convex, curvegauge, stakedao) use **BeefySwapper** — a Beefy-managed universal aggregator — for all reward→native swaps. You only need to select a `depositToken` (one of the pool's underlying tokens) in Step 5; the strategy handles all reward swaps automatically.

Best choice: the pool token that matches the chain's wrapped native (e.g. WETH on Ethereum), so the strategy can skip an extra swap step on each harvest.

---

## Updating Beefy Infrastructure Addresses

When you deploy to a new network or Beefy updates their contracts, update these two files:

- `backend/chains.js` — backend address book
- `frontend/src/chainInfo.js` — frontend copy (keep in sync)

The real Beefy address book lives at:
https://github.com/beefyfinance/beefy-v2/tree/main/src/config/addressBook

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| "DEPLOYER_PK not set" | Create `.env` from `.env.example` and add your private key |
| "Could not reach backend" | Start the backend: `npm start` |
| Dry-run takes forever | Hardhat downloads chain state from RPC — use a paid/faster RPC URL |
| 410 / RPC errors during dry-run | Your RPC doesn't support `eth_getStorageAt` for fork mode — try Alchemy or Infura |
| 502 / 503 error during live deploy | Transient RPC failure — the deployer retries automatically up to 3×. If it keeps failing, check your `RPC_*` env var and try a more reliable provider (e.g. `https://ethereum.publicnode.com`) |
| "not a valid LP token" | The address isn't a Uniswap-V2-style LP pair — check it on the block explorer |
| Routes look wrong | Edit them manually in Step 5 — the addresses must form a valid DEX path |
| "pool LP differs from your LP" | Your Pool ID doesn't match the LP you entered — check the MasterChef on-chain |
| Vault deposit reverts with no error | Trace it on Tenderly. If the failing selector is `0x573fef0a`, the strategy is missing `beforeDeposit()` — add `function beforeDeposit() external {}` and redeploy |
| Etherscan verification — bytecode mismatch | You selected the wrong EVM version. Must be **paris** (not Shanghai/Cancun). Re-submit with EVM version = paris |
| Etherscan verification — `err_code_2` | Same as above — EVM version mismatch. Also ensure you're using Solidity Single File (not multi-part) |
| Aura vault: `aura` reads as `address(0)` | The strategy was initialized before the explicit `_aura` parameter fix. Redeploy with the latest code — AURA is auto-distributed by `getReward()` but must be set explicitly in `initialize()` |
| Beefy CI: `should update strat owner` | Transfer strategy ownership to Beefy's strategist multisig via `transferOwnership()` on the strategy contract (see Post-Deploy Step 3) |
| Beefy CI: `eol pool is empty` | The vault has no deposits. Make a small test deposit before submitting the PR (see Post-Deploy Step 2) |
| Dry-run contracts — where do they go? | Dry-runs fork the chain in an isolated Hardhat process. The fork is discarded after the run — no contracts are created on the real network and no funds are spent |

---

## Security Notes

- This tool is for **local use by vault deployers**. Do not expose the backend to the internet.
- Always double-check Beefy's official infrastructure addresses before mainnet deploys.
- The `DEPLOYER_PK` private key should be in `.env` only and never committed to git.
- Run a dry-run first — every time.
