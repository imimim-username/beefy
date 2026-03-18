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

# 2. Install backend dependencies (Hardhat, ethers, express…)
npm install

# 3. Install OpenZeppelin Contracts (needed to compile Solidity)
npm install @openzeppelin/contracts

# 4. Install frontend dependencies
cd frontend && npm install && cd ..

# 5. Copy the env template and fill it in
cp .env.example .env
$EDITOR .env
```

### .env reference

```
DEPLOYER_PK=0xYOUR_PRIVATE_KEY_HERE

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
| 1 — Network     | Pick the blockchain (BSC, Polygon, Arbitrum, Base, etc.) |
| 2 — LP Token    | Paste the LP token address. The tool reads token0/token1 from chain. |
| 3 — Staking     | Choose **MasterChef** (needs Pool ID) or **Gauge** (Velodrome/Aerodrome). Paste the contract address. |
| 4 — Rewards     | Select reward tokens from the saved list, or add a new one by address. The list grows per-network as you deploy. |
| 5 — Routes      | Auto-suggested swap routes (reward→native, reward→LP0, reward→LP1). Edit addresses if needed. |
| 6 — Vault Name  | Name your vault and moo-token (e.g. `Beefy CAKE-BNB` / `mooCakeBNB`). |
| 7 — Review      | Full summary. Click **DRY-RUN** to test on a forked chain first. |
| 8 — Deploy      | After reviewing dry-run output, click **DEPLOY FOR REAL** to broadcast. |

---

## Architecture

```
beefyFinal/
├── backend/
│   ├── server.js          # Express API server
│   ├── chains.js          # Network configs + Beefy address book
│   ├── resolver.js        # On-chain reads via ethers.js
│   ├── deployer.js        # Orchestrates Hardhat deploy scripts
│   └── tokenRegistry.js   # Per-network token registry (registry/tokens.json)
│
├── contracts/
│   ├── BeefyVaultV7.sol                     # Vault ERC-20
│   ├── interfaces/                          # IUniswapRouterETH, IGauge, IMasterChef, IBeefyVaultV7
│   ├── utils/StratFeeManager.sol            # Fee management base
│   └── strategies/
│       ├── StrategyCommonChefLP.sol         # MasterChef strategy
│       └── StrategyCommonGaugeLP.sol        # Gauge/Solidly strategy
│
├── scripts/
│   ├── deploy_chef.cjs    # Hardhat script for chef deploy
│   └── deploy_gauge.cjs   # Hardhat script for gauge deploy
│
├── registry/
│   └── tokens.json        # Persisted reward token list (per chain)
│
├── frontend/
│   └── src/
│       ├── App.jsx                          # 8-step wizard
│       ├── chainInfo.js                     # Frontend chain metadata
│       ├── api/client.js                    # API wrappers
│       ├── hooks/useDebounce.js
│       ├── styles/global.css                # SNES pixel theme
│       └── components/
│           ├── Step1Network.jsx
│           ├── Step2LP.jsx
│           ├── Step3Staking.jsx
│           ├── Step4Rewards.jsx
│           ├── Step5Routes.jsx
│           ├── Step6VaultName.jsx
│           ├── Step7Review.jsx
│           └── StepDeploy.jsx
│
├── hardhat.config.cjs
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
| GET  | `/api/resolve-lp?chainId=56&lp=0x…` | Read LP token0/token1 from chain |
| GET  | `/api/validate-chef?chainId=56&chef=0x…&poolId=1` | Validate MasterChef + poolId |
| GET  | `/api/validate-gauge?chainId=10&gauge=0x…` | Validate Gauge contract |
| POST | `/api/suggest-routes` | Auto-suggest swap routes |
| GET  | `/api/resolve-token?chainId=56&address=0x…` | Resolve token symbol/name/decimals |
| GET  | `/api/tokens/:chainId` | Get saved reward tokens |
| POST | `/api/tokens/:chainId` | Save a new reward token |
| DELETE | `/api/tokens/:chainId/:address` | Remove a reward token |
| POST | `/api/deploy/dryrun` | Fork chain + deploy (no real funds) |
| POST | `/api/deploy/execute` | Deploy on live network |

---

## How Beefy Vaults Work (Quick Primer)

A Beefy vault consists of **two contracts**:

1. **BeefyVaultV7** (ERC-20) — Users deposit their LP tokens, receive proportional "moo-tokens". The vault holds user balances and calls into the strategy.

2. **Strategy contract** — Does all the yield work: stakes LP into the farm, calls `harvest()` to claim rewards, swaps them back into more LP (compounding), re-stakes. Two variants:
   - `StrategyCommonChefLP` — for MasterChef-style farms (PancakeSwap, SushiSwap, etc.)
   - `StrategyCommonGaugeLP` — for Gauge-style farms (Velodrome, Aerodrome, Curve, etc.)

The strategy exposes `deposit()` / `withdraw()` / `harvest()` to the vault and takes a small fee on each harvest (split between Beefy treasury, the strategist, and the harvester caller).

### Swap Routes

When the strategy harvests reward tokens, it needs to know how to turn them into LP:

- **outputToNativeRoute** — reward token → wrapped native (e.g. CAKE → WBNB). Fee split is taken in native.
- **outputToLp0Route** — reward token → LP token0 (half the remaining rewards)
- **outputToLp1Route** — reward token → LP token1 (other half)

The tool auto-suggests these routes from on-chain data. You can edit them manually in Step 5.

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
| "not a valid LP token" | The address isn't a Uniswap-V2-style LP pair — check it on the block explorer |
| Routes look wrong | Edit them manually in Step 5 — the addresses must form a valid DEX path |
| "pool LP differs from your LP" | Your Pool ID doesn't match the LP you entered — check the MasterChef on-chain |

---

## Security Notes

- This tool is for **local use by vault deployers**. Do not expose the backend to the internet.
- Always double-check Beefy's official infrastructure addresses before mainnet deploys.
- The `DEPLOYER_PK` private key should be in `.env` only and never committed to git.
- Run a dry-run first — every time.
