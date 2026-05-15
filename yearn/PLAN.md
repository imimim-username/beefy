# Yearn Strategy Wizard — Development Plan

## Overview

A web-based wizard for deploying **Yearn v3 tokenized strategies** — analogous to the
Beefy vault deployment wizard that lives one directory up. The wizard generates Solidity
strategy source code from a library of audited templates, compiles it with Foundry, and
deploys it to any supported EVM chain. Deployed strategies earn the strategist a
**performance fee on all realized profits**, paid automatically on every harvest.

Unlike the Beefy wizard (pure configuration), this tool performs **code generation** — it
fills parameterized Solidity templates with the user's choices and produces a deployable
contract. Because the generated code handles real user funds, only templates that have been
audited (or are exact copies of Yearn's own reference implementations) are offered.

---

## Goals

- Allow any developer to deploy a Yearn v3 tokenized strategy in under 10 minutes.
- Support 5 strategy types at launch: Aave v3 lending, Compound v3 lending, Morpho lending,
  Curve gauge staking, and ERC-4626 vault wrapping.
- Generate correct, compilable Solidity from templates, compile with `forge build`, and
  deploy with `forge script --broadcast`.
- Show the generated source code to the user before deployment (no black-box deploys).
- Provide a dry-run mode that compiles and simulates the deploy without spending gas.
- Guide the user through all post-deploy configuration steps.
- Store no private keys — the user's own wallet/keystore/Ledger signs all transactions.

---

## Non-Goals (v1)

- Allocator vault creation (users who want Yearn to allocate TVL to their strategy can
  request it in Yearn Discord after deploying).
- Custom swap route entry (reward swap paths are hardcoded per template; advanced users
  edit the generated code manually).
- Strategy analytics dashboard (out of scope; use ydaemon API directly).
- Non-EVM chains.
- Automated security auditing of generated code.

---

## Protocol Background

### Yearn v3 Architecture

Every tokenized strategy is a thin proxy contract that `delegatecall`s into the shared,
audited `TokenizedStrategy` implementation. Strategists only write the three yield-
generating functions; all ERC-20, ERC-4626, profit-locking, fee, and access-control logic
is inherited from the audited implementation.

```
User deposits → Strategy contract (thin proxy)
                    ↕ delegatecall
               TokenizedStrategy (shared implementation)
                    ← yield source (Aave, Curve, etc.)
```

### Strategist Fee Model

```
Harvest profit = 100 units
Performance fee (set by strategist, e.g. 20%) = 20 units charged
Protocol fee (Yearn takes a cut of fees, e.g. 10% of fees) = 2 units to Yearn Treasury
Strategist receives (via performanceFeeRecipient) = 18 units
```

Strategists configure their own `performanceFee` and `performanceFeeRecipient`. The Yearn
protocol fee is deducted automatically by the `Accountant` contract; strategists do not need
to manage it.

---

## Key Contract Addresses (all chains unless noted)

All cross-chain addresses are deployed via `CREATE2` and are identical on every supported
network (Ethereum mainnet, Arbitrum, Base, Polygon, Optimism).

| Contract | Address |
|---|---|
| **TokenizedStrategy** (v3.0.4) | `0xD377919FA87120584B21279a491F82D5265A139c` |
| **VaultFactory** (v3.0.4) | `0x770D0d1Fb036483Ed4AbB6d53c1C88fb277D812F` |
| Vault Original | `0xd8063123BBA3B480569244AE66BFE72B6c84b00d` |
| Protocol Address Provider | `0x775F09d6f3c8D2182DFA8bce8628acf51105653c` |
| Release Registry | `0x0377b4daDDA86C89A0091772B79ba67d0E5F7198` |
| Role Manager Factory | `0xca12459a931643BF28388c67639b3F352fe9e5Ce` |

### Chain-specific governance contracts

| Chain | Role Manager | Accountant |
|---|---|---|
| Ethereum (1) | `0xb3bd6b2e61753c311efbcf0111f75d29706d9a41` | `0x5A74Cb32D36f2f517DB6f7b0A0591e09b22cDE69` |
| Arbitrum (42161) | `0x3BF72024420bdc4D7cA6a8b6211829476D6685b1` | `0x9ab47be62631036cda3a64b8322704988427f366` |
| Base (8453) | `0xea3481244024E2321cc13AcAa80df1050f1fD456` | `0x1f399808fE52d0E960CAB84b6b54d5707ab27c8a` |
| Polygon (137) | `0x9bcD66bf09ebe5DD35A868307B7638Fd281061E2` | `0x54483f1592ab0aDea2757Ae0d62e6393361d4CEe` |
| Optimism (10) | — (permissionless deploy only) | — |

---

## Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend | React 18 + Vite | Same SNES pixel-art theme as Beefy wizard |
| Backend | Node.js + Express | Same pattern as Beefy backend |
| Code generation | Handlebars templates | `.sol.hbs` → `.sol` |
| Compilation | Foundry `forge build` | Called via `child_process.spawn` |
| Deployment | Foundry `forge script --broadcast` | Replaces Hardhat |
| On-chain reads | ethers.js v6 | Same as Beefy resolver.js |
| Chain config | `chains.js` + `chainInfo.js` | Add Yearn addresses to each chain |
| Testing | Jest (backend unit tests) + forge fork tests | |

---

## Repository Layout

The wizard lives inside the existing `beefy/` repository under `yearn/`:

```
beefy/yearn/
├── PLAN.md                          ← this file
├── package.json                     ← workspace root (starts both frontend + backend)
│
├── backend/
│   ├── server.js                    ← Express app + all /api/* routes
│   ├── resolver.js                  ← on-chain reads (token probe, market checks)
│   ├── generator.js                 ← template → Solidity source code
│   ├── compiler.js                  ← forge build wrapper
│   ├── deployer.js                  ← forge script --broadcast wrapper
│   ├── chains.js                    ← chain config with Yearn contract addresses
│   ├── templates/                   ← Handlebars Solidity templates
│   │   ├── AaveLender.sol.hbs
│   │   ├── CompoundLender.sol.hbs
│   │   ├── MorphoLender.sol.hbs
│   │   ├── CurveGaugeStaker.sol.hbs
│   │   └── Vault4626Wrapper.sol.hbs
│   ├── foundry/                     ← Foundry project used for compile + deploy
│   │   ├── foundry.toml
│   │   ├── lib/                     ← forge install dependencies (gitmodules)
│   │   │   ├── tokenized-strategy/
│   │   │   ├── tokenized-strategy-periphery/
│   │   │   ├── openzeppelin-contracts/
│   │   │   └── forge-std/
│   │   ├── src/                     ← generated .sol files written here at runtime
│   │   ├── script/
│   │   │   └── DeployStrategy.s.sol ← deploy script (reads params from env)
│   │   └── test/
│   │       └── Strategy.t.sol       ← fork test template for dry-run
│   └── tests/
│       └── resolver.test.js         ← Jest unit tests
│
├── frontend/
│   ├── package.json
│   ├── vite.config.js               ← proxy /api/ to backend port 8789
│   └── src/
│       ├── main.jsx
│       ├── App.jsx                  ← 8-step wizard router + session persistence
│       ├── chainInfo.js             ← client-side chain config (mirrors chains.js)
│       ├── api/
│       │   └── client.js            ← fetch wrappers for all backend endpoints
│       ├── styles/
│       │   └── global.css           ← SNES pixel-art theme (copy/extend from Beefy)
│       └── components/
│           ├── Step1Network.jsx     ← chain selection grid
│           ├── Step2Asset.jsx       ← underlying token probe + strategy suggestions
│           ├── Step3StratType.jsx   ← strategy type picker + yield source config
│           ├── Step4Rewards.jsx     ← reward token routing config
│           ├── Step5FeeConfig.jsx   ← performance fee + recipient + keeper + unlock time
│           ├── Step6Periphery.jsx   ← optional module toggles (health check, APR oracle, etc.)
│           ├── Step7Review.jsx      ← config summary + live generated code preview
│           ├── StepDeploy.jsx       ← compile → dry-run → deploy + post-deploy checklist
│           └── PixelBox.jsx         ← shared UI primitives (copy from Beefy)
```

---

## Wizard Steps — Detailed Specification

### Step 1 — Network

**Component:** `Step1Network.jsx`

Display a grid of supported chains. Each card shows chain name, logo, and an indicator if
Yearn has official governance deployed there.

Supported chains at launch:
- Ethereum (1) — full governance
- Arbitrum (42161) — full governance
- Base (8453) — full governance
- Polygon (137) — Role Manager + Accountant only
- Optimism (10) — core contracts only (permissionless)

On selection, set `form.chainId` and `form.chainName`. Reset all downstream state.

---

### Step 2 — Underlying Asset

**Component:** `Step2Asset.jsx`

User enters an ERC-20 token address. Backend probes it and returns:
- `symbol`, `name`, `decimals`
- Whether the token is itself ERC-4626 (enables Vault Wrapper strategy type)
- Whether an Aave v3 market exists for this token on the selected chain
- Whether a Compound v3 (Comet) market exists
- Whether a Morpho Blue market exists (and its `marketId`)

Display probe results and a "Suggested strategy types" section based on what's live.

**Form fields set:** `form.asset`, `form.assetSymbol`, `form.assetDecimals`,
`form.isErc4626Asset`, `form.aaveAToken`, `form.compoundComet`, `form.morphoMarketId`

---

### Step 3 — Strategy Type & Yield Source Config

**Component:** `Step3StratType.jsx`

Pick a strategy type from the available options (grayed out if not applicable to the asset):

| Strategy Type | Key | Template | Applicable when |
|---|---|---|---|
| Aave v3 Lender | `aave-v3` | `AaveLender.sol.hbs` | `aaveAToken` is non-null |
| Compound v3 Lender | `compound-v3` | `CompoundLender.sol.hbs` | `compoundComet` is non-null |
| Morpho Lender | `morpho` | `MorphoLender.sol.hbs` | `morphoMarketId` is non-null |
| Curve Gauge Staker | `curve-gauge` | `CurveGaugeStaker.sol.hbs` | asset is a Curve LP token |
| ERC-4626 Wrapper | `erc4626-wrap` | `Vault4626Wrapper.sol.hbs` | `isErc4626Asset` is true |

**For `aave-v3`:** Confirm the aToken address and show current supply APY (fetched from
Aave's on-chain `getReserveData()` and the rate oracle).

**For `compound-v3`:** Show the Comet address and current supply rate.

**For `morpho`:** Show market parameters (LLTV, oracle, IRM) fetched from the Morpho Blue
contract.

**For `curve-gauge`:** Show a gauge address input + coin picker (reuse the Beefy `/api/curve-coins`
endpoint). The user selects the gauge, and the backend reads its LP token, reward tokens
(from `reward_tokens()`), and current CRV emission rate.

**For `erc4626-wrap`:** Confirm the inner vault's `asset()` matches the outer asset entered
in Step 2. Show the inner vault's name and any reward token (from the vault's optional
`rewardToken()` if it exists).

**Form fields set:** `form.stratType`, plus type-specific fields:
- `form.aavePool`, `form.aToken` (aave)
- `form.comet` (compound)
- `form.morphoMarketId`, `form.morphoOracle`, `form.morphoIrm`, `form.morphoLltv` (morpho)
- `form.gauge`, `form.lpToken`, `form.curvePool` (curve-gauge)
- `form.innerVault` (erc4626-wrap)

---

### Step 4 — Reward Token Routing

**Component:** `Step4Rewards.jsx`

Auto-detect reward tokens from the yield source:
- Aave: AAVE token (protocol rewards, if active on this market)
- Compound: COMP token
- Morpho: MORPHO token
- Curve Gauge: CRV + any extra reward tokens (read from `reward_tokens()`)
- ERC-4626: inner vault's reward token, if any

For each reward token, configure how it is swapped back to the underlying asset:

```
Reward Token    Swap Router         Path
────────────    ──────────          ────────────────────────────────────────
AAVE            UniswapV3     [v]   AAVE (0x7Fc…) → WETH (0.3%) → USDC (0.05%)  [auto]
CRV             UniswapV3     [v]   CRV → WETH (1%) → USDC (0.05%)               [auto]

Available routers: UniswapV3 | UniswapV2 | Curve | (skip)
```

Auto-suggest paths using known good routes from a hardcoded registry (similar to Beefy's
token registry). User can override.

The generated contract will inherit the corresponding swapper base from
`tokenized-strategy-periphery/swappers/`:
- `UniswapV3Swapper.sol` — fee-tier-based V3 path
- `UniswapV2Swapper.sol` — standard V2 router
- `CurveSwapper.sol` — Curve pool

**Form fields set:** `form.rewardTokens` → array of
`{ address, symbol, router, path, fee }` objects.

If the user selects "skip" for a reward token, it is omitted from `_harvestAndReport()`
and accumulates in the strategy (not ideal; a warning is shown).

---

### Step 5 — Fee & Keeper Configuration

**Component:** `Step5FeeConfig.jsx`

```
Performance Fee    [ 10 ] %    max 50% (Yearn protocol enforces this)
                               Yearn will deduct its protocol cut automatically.

Fee Recipient      [ 0x…  ]    address that receives your share of fees
                               (saved to localStorage for reuse)

Keeper             ◉ None (manual harvest)
                   ○ TKS — Yearn's keeper network (no setup required)
                   ○ Gelato — requires Gelato task setup post-deploy

Profit Unlock Time [ 6 ] hours  How long profits linearly unlock for depositors.
                                Lower = faster withdrawals. Higher = smoother APY.
                                Recommended: 6–24 hours.

Contract Name      [ USDC Aave v3 Lender ]   used as ERC-20 name + Etherscan label
Strategy Symbol    [ ysUSDC-AAVEv3 ]         ERC-20 symbol (auto-suggested, editable)
```

`performanceFee` is stored in **basis points** internally (e.g. 10% = 1000 bps).
`profitMaxUnlockTime` is in **seconds** (e.g. 6 hours = 21600).

TKS keeper address per chain (hardcoded in `chains.js`):

| Chain | TKS Keeper |
|---|---|
| Ethereum | `0x736D7e3c5a6CB2CE3B764300140ABF476F6CFCCF` |
| Arbitrum | `0x6cBB05f4C44A5b3C6508E4C9C5cb2C4E347Ade6` |
| Base | `0x6cBB05f4C44A5b3C6508E4C9C5cb2C4E347Ade6` |
| Polygon | `0x6cBB05f4C44A5b3C6508E4C9C5cb2C4E347Ade6` |

**Form fields set:** `form.performanceFee`, `form.feeRecipient`, `form.keeper`,
`form.profitMaxUnlockTime`, `form.contractName`, `form.strategySymbol`

---

### Step 6 — Optional Periphery Modules

**Component:** `Step6Periphery.jsx`

Toggles for optional base contracts from `tokenized-strategy-periphery`:

**Health Check** (recommended — on by default)
- Base contract: `BaseHealthCheck.sol` from `@periphery/Bases/HealthCheck/`
- When enabled, the generated contract inherits `BaseHealthCheck` instead of `BaseStrategy`
  directly. `_harvestAndReport()` calls `_executeHealthCheck(_totalAssets)` before returning.
- Configurable bounds:
  - Max profit ratio (default 100% = no cap)
  - Max loss ratio (default 0.01% = 1 bps)
- Prevents a buggy harvest from accidentally locking or draining funds.

**APR Oracle**
- Base contract: `AprOracleBase.sol` from `@periphery/AprOracle/`
- The generated contract implements `aprAfterDebtChange()`, returning the expected APR.
- Allows Yearn's allocator vaults to compare strategies and route capital optimally.
- Required if the user wants their strategy to receive TVL from official Yearn allocator
  vaults.

**Deposit Limit**
- Override `availableDepositLimit()` to return a configurable `maxTotalAssets` cap.
- Generates a `uint256 public maxTotalAssets` storage var and a `setMaxTotalAssets()` setter.
- Useful during initial deployment to limit exposure while the strategy is being vetted.

**Whitelist**
- Override `availableDepositLimit()` to return `type(uint256).max` for whitelisted
  addresses and 0 for everyone else.
- Generates a mapping + `addToWhitelist()`/`removeFromWhitelist()` management functions.
- Useful for protecting proprietary alpha during testing.

**Form fields set:** `form.useHealthCheck`, `form.maxProfitRatio`, `form.maxLossRatio`,
`form.useAprOracle`, `form.useDepositLimit`, `form.initialMaxAssets`, `form.useWhitelist`

---

### Step 7 — Review + Generated Code Preview

**Component:** `Step7Review.jsx`

Split-pane layout:

**Left pane — Configuration summary**
All choices made in Steps 1–6, organized into collapsible sections with ✎ Edit links
that jump the user back to the relevant step. No information is hidden.

**Right pane — Live code preview**
The generated Solidity contract is rendered in real time (client-side, using the same
template engine as the backend). Syntax-highlighted with a lightweight highlighter
(e.g. Prism.js or highlight.js).

A **Download Source** button allows the user to save the `.sol` file locally before
deploying.

The code preview includes a yellow banner:
> ⚠️ This code is generated from a template and has not been individually audited.
> Review the source carefully before deploying to mainnet with real funds.

**Form fields set:** none — review only.

---

### Step 8 — Compile, Dry-Run & Deploy

**Component:** `StepDeploy.jsx`

Three sequential phases, same UX pattern as the Beefy wizard:

**Phase 1 — Compile**
- Button: `[ COMPILE ]`
- Backend: writes the generated `.sol` to `foundry/src/`, runs `forge build`
- Shows: compiler output, any errors, contract bytecode size
- On success: "✅ Compiled — 4.2 KB / 24.576 KB limit" and unlocks dry-run

**Phase 2 — Dry-Run (fork simulation)**
- Button: `[ DRY-RUN ]`
- Backend: runs `forge script foundry/script/DeployStrategy.s.sol --fork-url RPC_URL`
  (no `--broadcast`)
- Shows: gas estimate, simulated strategy address, any reverts
- On success: unlocks live deploy button

**Phase 3 — Live Deploy**
- Button: `[ DEPLOY ]`
- Backend: runs `forge script foundry/script/DeployStrategy.s.sol --broadcast --rpc-url RPC_URL`
- User must have configured `PRIVATE_KEY` or `--account KEYSTORE` in backend `.env`
- Shows: transaction hash, deployed strategy address

**Post-deploy checklist** (displayed after successful deploy):
```
Deployed: 0x…yourStrategy…

Setup calls (call from your management wallet):
  ☐ strategy.setPerformanceFee(1000)                    [10% = 1000 bps]
  ☐ strategy.setPerformanceFeeRecipient(0x…you…)
  ☐ strategy.setKeeper(0x…tks…)                         [if using TKS]
  ☐ strategy.setProfitMaxUnlockTime(21600)               [6 hours]
  ☐ strategy.setMaxTotalAssets(1e18)                     [if deposit limit enabled]

Verification:
  ☐ forge verify-contract 0x…strategy… src/YourStrategy.sol:YourStrategy
      --chain-id 1 --etherscan-api-key $ETHERSCAN_KEY

Testing:
  ☐ Make a small test deposit via strategy.deposit(amount, receiver)
  ☐ Manually call strategy.report() — confirm profit/loss is sane
  ☐ Confirm performanceFeeRecipient received fee shares

Optional — connect to Yearn allocator vault:
  ☐ Request in Yearn Discord #strategy-dev channel
  ☐ Vault manager calls vault.add_strategy(0x…strategy…)
  ☐ Vault manager calls vault.update_max_debt_for_strategy(strategy, amount)

☐ Create an entry on yearn.fi / submit to Yearn Registry (optional endorsement)
```

**Error hint parser** — same pattern as Beefy's `parseDeployError()`. Known patterns:

| Pattern | Hint |
|---|---|
| `forge: command not found` | Foundry is not installed. Run `curl -L foundry.paradigm.xyz \| bash && foundryup` |
| `CompilerError` | Solidity compilation error — shown with line number and message |
| `PRIVATE_KEY not set` | Set `PRIVATE_KEY=0x…` in `yearn/backend/.env` |
| `insufficient funds` | Deployer wallet has no ETH. Fund `0x…` on the selected chain |
| `already deployed` | A strategy with identical CREATE2 params already exists at this address |
| `revert HealthCheck` | Health check triggered — profit/loss ratio outside configured bounds |

---

## Backend — API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/chains` | List of supported chains with Yearn addresses |
| GET | `/api/probe-token` | `?chainId=&address=` → `{ symbol, name, decimals, isErc4626 }` |
| GET | `/api/check-aave-market` | `?chainId=&asset=` → `{ active, aToken, supplyRate }` |
| GET | `/api/check-compound-market` | `?chainId=&asset=` → `{ active, comet, supplyRate }` |
| GET | `/api/check-morpho-market` | `?chainId=&asset=` → `{ marketId, oracle, irm, lltv }` |
| GET | `/api/curve-gauge-info` | `?chainId=&gauge=` → `{ lpToken, rewardTokens[], crvRate }` |
| GET | `/api/suggest-swap-path` | `?chainId=&from=&to=` → `{ router, path, fee }` |
| POST | `/api/generate` | `{ form }` → `{ solidity, filename }` — render template, no compile |
| POST | `/api/compile` | `{ form }` → `{ ok, errors, bytecodeSize }` — forge build |
| POST | `/api/deploy/dryrun` | `{ form }` → `{ ok, gasEstimate, strategyAddress, errors }` |
| POST | `/api/deploy/execute` | `{ form }` → `{ ok, txHash, strategyAddress }` |

All endpoints follow the same pattern as the Beefy wizard: `{ ok: true, …data }` on success,
`{ ok: false, error: "message" }` on failure.

---

## Backend — `generator.js`

The code generator takes the `form` state object and returns a Solidity source string by
rendering the appropriate Handlebars template.

```javascript
// backend/generator.js
const Handlebars = require('handlebars');
const fs = require('fs');
const path = require('path');

const TEMPLATE_MAP = {
  'aave-v3':      'AaveLender.sol.hbs',
  'compound-v3':  'CompoundLender.sol.hbs',
  'morpho':       'MorphoLender.sol.hbs',
  'curve-gauge':  'CurveGaugeStaker.sol.hbs',
  'erc4626-wrap': 'Vault4626Wrapper.sol.hbs',
};

function generateStrategy(form, chainAddresses) {
  const templateFile = TEMPLATE_MAP[form.stratType];
  if (!templateFile) throw new Error(`Unknown strategy type: ${form.stratType}`);

  const templateSrc = fs.readFileSync(
    path.join(__dirname, 'templates', templateFile), 'utf8'
  );
  const template = Handlebars.compile(templateSrc);

  // Flatten form + chain addresses into a single context object
  const context = {
    contractName:         form.contractName,
    strategySymbol:       form.strategySymbol,
    asset:                form.asset,
    assetSymbol:          form.assetSymbol,

    // Aave
    aavePool:             chainAddresses.aavePool,
    aToken:               form.aToken,

    // Compound
    comet:                form.comet,

    // Morpho
    morphoHub:            chainAddresses.morphoHub,
    morphoMarketId:       form.morphoMarketId,
    morphoOracle:         form.morphoOracle,
    morphoIrm:            form.morphoIrm,
    morphoLltv:           form.morphoLltv,

    // Curve gauge
    gauge:                form.gauge,
    curvePool:            form.curvePool,

    // ERC-4626 wrapper
    innerVault:           form.innerVault,

    // Rewards
    rewardTokens:         form.rewardTokens,   // [{ address, symbol, router, path, fee }]

    // Periphery toggles
    useHealthCheck:       form.useHealthCheck,
    maxProfitBps:         form.maxProfitRatio * 100,
    maxLossBps:           form.maxLossRatio * 100,
    useAprOracle:         form.useAprOracle,
    useDepositLimit:      form.useDepositLimit,
    initialMaxAssets:     form.initialMaxAssets,
    useWhitelist:         form.useWhitelist,
  };

  return {
    solidity: template(context),
    filename: `${form.contractName.replace(/\s+/g, '')}.sol`,
  };
}

module.exports = { generateStrategy };
```

---

## Backend — `compiler.js`

```javascript
// backend/compiler.js
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const FOUNDRY_DIR = path.join(__dirname, 'foundry');
const SRC_DIR     = path.join(FOUNDRY_DIR, 'src');

async function compileStrategy(solidity, filename) {
  // Write generated source into foundry/src/
  fs.writeFileSync(path.join(SRC_DIR, filename), solidity, 'utf8');

  return new Promise((resolve, reject) => {
    const proc = spawn('forge', ['build', '--force'], {
      cwd: FOUNDRY_DIR,
      env: process.env,
    });

    let stdout = '', stderr = '';
    proc.stdout.on('data', d => stdout += d);
    proc.stderr.on('data', d => stderr += d);

    proc.on('close', code => {
      const ok = code === 0;
      // Parse bytecode size from forge build output
      const sizeMatch = stdout.match(/(\d+\.\d+) KB/);
      resolve({
        ok,
        stdout,
        stderr,
        errors: ok ? [] : parseForgeErrors(stderr),
        bytecodeSize: sizeMatch ? parseFloat(sizeMatch[1]) : null,
      });
    });
  });
}

function parseForgeErrors(stderr) {
  // Extract line:col and message from forge compiler output
  const lines = stderr.split('\n');
  return lines
    .filter(l => l.includes('Error') || l.includes('error'))
    .map(l => l.trim());
}

module.exports = { compileStrategy };
```

---

## Backend — `deployer.js`

```javascript
// backend/deployer.js
const { spawn } = require('child_process');
const path = require('path');

const FOUNDRY_DIR = path.join(__dirname, 'foundry');

async function deployStrategy(form, { dryRun = true, rpcUrl, privateKey } = {}) {
  const env = {
    ...process.env,
    STRATEGY_ASSET:        form.asset,
    STRATEGY_NAME:         form.contractName,
    STRATEGY_SYMBOL:       form.strategySymbol,
    STRATEGY_PERF_FEE:     String(form.performanceFee * 100),   // bps
    STRATEGY_FEE_RECIPIENT:form.feeRecipient,
    STRATEGY_KEEPER:       form.keeper || '',
    STRATEGY_UNLOCK_TIME:  String(form.profitMaxUnlockTime),
    PRIVATE_KEY:           privateKey || '',
  };

  const args = [
    'script', 'script/DeployStrategy.s.sol:DeployStrategy',
    '--rpc-url', rpcUrl,
    '--sig', 'run()',
  ];
  if (!dryRun) args.push('--broadcast');

  return new Promise((resolve) => {
    const proc = spawn('forge', args, { cwd: FOUNDRY_DIR, env });
    let stdout = '', stderr = '';
    proc.stdout.on('data', d => stdout += d);
    proc.stderr.on('data', d => stderr += d);
    proc.on('close', code => {
      const ok = code === 0;
      const addrMatch = stdout.match(/Strategy deployed at: (0x[0-9a-fA-F]{40})/);
      resolve({
        ok,
        stdout,
        stderr,
        strategyAddress: addrMatch ? addrMatch[1] : null,
      });
    });
  });
}

module.exports = { deployStrategy };
```

---

## Foundry Project — `foundry/`

### `foundry.toml`

```toml
[profile.default]
src           = "src"
out           = "out"
libs          = ["lib"]
solc_version  = "0.8.23"
optimizer     = true
optimizer_runs = 200
evm_version   = "paris"

[rpc_endpoints]
mainnet   = "${MAINNET_RPC}"
arbitrum  = "${ARBITRUM_RPC}"
base      = "${BASE_RPC}"
polygon   = "${POLYGON_RPC}"
optimism  = "${OPTIMISM_RPC}"

[etherscan]
mainnet  = { key = "${ETHERSCAN_KEY}", chain = 1 }
arbitrum = { key = "${ARBISCAN_KEY}",  chain = 42161 }
base     = { key = "${BASESCAN_KEY}",  chain = 8453 }
```

### Library dependencies (`lib/` — installed via `forge install`)

```
forge install yearn/tokenized-strategy
forge install yearn/tokenized-strategy-periphery
forge install OpenZeppelin/openzeppelin-contracts
forge install foundry-rs/forge-std
```

Remappings in `foundry.toml`:
```toml
remappings = [
  "@tokenized-strategy/=lib/tokenized-strategy/src/",
  "@periphery/=lib/tokenized-strategy-periphery/src/",
  "@openzeppelin/=lib/openzeppelin-contracts/",
  "forge-std/=lib/forge-std/src/",
]
```

### Deploy script — `foundry/script/DeployStrategy.s.sol`

```solidity
// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.23;

import "forge-std/Script.sol";
import "../src/GeneratedStrategy.sol";  // filename written by compiler.js

contract DeployStrategy is Script {
    function run() external {
        address asset        = vm.envAddress("STRATEGY_ASSET");
        string  memory name  = vm.envString("STRATEGY_NAME");
        string  memory sym   = vm.envString("STRATEGY_SYMBOL");
        uint16  perfFee      = uint16(vm.envUint("STRATEGY_PERF_FEE"));
        address feeRecipient = vm.envAddress("STRATEGY_FEE_RECIPIENT");
        address keeper       = vm.envOr("STRATEGY_KEEPER", address(0));
        uint256 unlockTime   = vm.envUint("STRATEGY_UNLOCK_TIME");

        uint256 pk = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(pk);

        GeneratedStrategy strategy = new GeneratedStrategy(asset, name);

        if (perfFee > 0)
            strategy.setPerformanceFee(perfFee);
        if (feeRecipient != address(0))
            strategy.setPerformanceFeeRecipient(feeRecipient);
        if (keeper != address(0))
            strategy.setKeeper(keeper);
        strategy.setProfitMaxUnlockTime(unlockTime);

        vm.stopBroadcast();

        console.log("Strategy deployed at:", address(strategy));
    }
}
```

---

## Solidity Templates

All templates produce contracts that inherit from `BaseStrategy` or `BaseHealthCheck`
(which itself extends `BaseStrategy`). The three mandatory overrides are:
- `_deployFunds(uint256 _amount)` — deploy idle asset to yield source
- `_freeFunds(uint256 _amount)` — withdraw from yield source
- `_harvestAndReport()` — claim rewards, swap to asset, reinvest, return total assets

### Template: `AaveLender.sol.hbs`

```solidity
// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.23;

import { {{#if useHealthCheck}}BaseHealthCheck{{else}}BaseStrategy, ERC20{{/if}} }
    from "{{#if useHealthCheck}}@periphery/Bases/HealthCheck/BaseHealthCheck.sol"
         {{else}}@tokenized-strategy/BaseStrategy.sol"{{/if}};
{{#each rewardTokens}}
{{#if (eq router "uniswap-v3")}}
import {UniswapV3Swapper} from "@periphery/swappers/UniswapV3Swapper.sol";
{{/if}}
{{/each}}

interface IAavePool {
    function supply(address asset, uint256 amount, address onBehalfOf, uint16 refCode) external;
    function withdraw(address asset, uint256 amount, address to) external returns (uint256);
    function getReserveData(address asset) external view returns (
        uint256 configuration, uint128 liquidityIndex, uint128 currentLiquidityRate,
        uint128 variableBorrowIndex, uint128 currentVariableBorrowRate,
        uint128 currentStableBorrowRate, uint40 lastUpdateTimestamp,
        uint16 id, address aTokenAddress, address stableDebtTokenAddress,
        address variableDebtTokenAddress, address interestRateStrategyAddress,
        uint128 accruedToTreasury, uint128 unbacked, uint128 isolationModeTotalDebt
    );
}

interface IAaveRewards {
    function claimAllRewards(address[] calldata assets, address to)
        external returns (address[] memory rewardsList, uint256[] memory claimedAmounts);
}

/**
 * @title  {{contractName}}
 * @notice Yearn v3 tokenized strategy — Aave v3 lender for {{assetSymbol}}
 * @dev    Generated by Yearn Strategy Wizard. Review before using with real funds.
 */
contract {{contractName}} is
    {{#if useHealthCheck}}BaseHealthCheck{{else}}BaseStrategy{{/if}}
    {{#each rewardTokens}}{{#if (eq router "uniswap-v3")}}, UniswapV3Swapper{{/if}}{{/each}}
{
    IAavePool   public constant aavePool    = IAavePool({{aavePool}});
    IAaveRewards public constant aaveRewards = IAaveRewards(0x8164Cc65827dcFe994AB23944CBC90e0aa80bFcb);
    ERC20       public constant aToken      = ERC20({{aToken}});
    {{#if useDepositLimit}}
    uint256 public maxTotalAssets = {{initialMaxAssets}};
    {{/if}}
    {{#if useWhitelist}}
    mapping(address => bool) public whitelist;
    {{/if}}

    constructor(address _asset)
        BaseStrategy(_asset, "{{contractName}}")
    {}

    // ─── Required overrides ───────────────────────────────────────────────

    function _deployFunds(uint256 _amount) internal override {
        ERC20(asset).approve(address(aavePool), _amount);
        aavePool.supply(asset, _amount, address(this), 0);
    }

    function _freeFunds(uint256 _amount) internal override {
        aavePool.withdraw(asset, _amount, address(this));
    }

    function _harvestAndReport() internal override returns (uint256 _totalAssets) {
        // Claim all Aave rewards
        address[] memory aTokens = new address[](1);
        aTokens[0] = address(aToken);
        aaveRewards.claimAllRewards(aTokens, address(this));

        // Swap rewards to asset
        {{#each rewardTokens}}
        _swapFrom({{address}}, asset, ERC20({{address}}).balanceOf(address(this)), 0);
        {{/each}}

        // Reinvest any idle asset
        uint256 idle = ERC20(asset).balanceOf(address(this));
        if (idle > 0) {
            ERC20(asset).approve(address(aavePool), idle);
            aavePool.supply(asset, idle, address(this), 0);
        }

        _totalAssets = aToken.balanceOf(address(this));
        {{#if useHealthCheck}}
        _executeHealthCheck(_totalAssets);
        {{/if}}
    }

    // ─── Optional overrides ───────────────────────────────────────────────

    {{#if useDepositLimit}}
    function availableDepositLimit(address) public view override returns (uint256) {
        uint256 current = aToken.balanceOf(address(this));
        return current >= maxTotalAssets ? 0 : maxTotalAssets - current;
    }
    function setMaxTotalAssets(uint256 _max) external onlyManagement {
        maxTotalAssets = _max;
    }
    {{/if}}

    {{#if useWhitelist}}
    function availableDepositLimit(address _depositor) public view override returns (uint256) {
        return whitelist[_depositor] ? type(uint256).max : 0;
    }
    function addToWhitelist(address _addr) external onlyManagement { whitelist[_addr] = true; }
    function removeFromWhitelist(address _addr) external onlyManagement { whitelist[_addr] = false; }
    {{/if}}

    {{#if useAprOracle}}
    function aprAfterDebtChange(address, int256) external view returns (uint256) {
        // Return current supply rate as APR in 1e18 units
        (, , uint128 liquidityRate, , , , , , , , , , , ,) = aavePool.getReserveData(asset);
        return uint256(liquidityRate) / 1e9; // RAY → WAD
    }
    {{/if}}
}
```

---

### Template: `CompoundLender.sol.hbs`

Same structure as AaveLender but uses:
- `IComet(comet).supply(asset, amount)` in `_deployFunds`
- `IComet(comet).withdraw(asset, amount)` in `_freeFunds`
- `ICometRewards(rewardsAddr).claim(comet, address(this), true)` in `_harvestAndReport`
- `IComet(comet).balanceOf(address(this))` for total assets

Compound V3 Comet addresses per chain are stored in `chains.js`.

---

### Template: `MorphoLender.sol.hbs`

- `_deployFunds`: `IMorpho(morphoHub).supply(marketParams, amount, 0, address(this), "")`
- `_freeFunds`: `IMorpho(morphoHub).withdraw(marketParams, amount, 0, address(this), address(this))`
- `_harvestAndReport`: `IMorphoRewards.claim(...)` + swap + reinvest + return `IMorpho.expectedSupplyAssets(marketParams, address(this))`
- `marketParams` struct constructed from `form.morphoOracle`, `form.morphoIrm`, `form.morphoLltv`

Morpho Blue hub (same on all chains): `0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFc`

---

### Template: `CurveGaugeStaker.sol.hbs`

- `_deployFunds`: approve LP → `IGauge(gauge).deposit(amount)`
- `_freeFunds`: `IGauge(gauge).withdraw(amount)`
- `_harvestAndReport`:
  - `ICurveMinter(crvMinter).mint(gauge)` (if `minterEnabled`)
  - `IGauge(gauge).claim_rewards()` for extra rewards
  - Swap CRV + extras → asset via configured swapper(s)
  - Deposit any accumulated LP back into gauge
  - Return `IGauge(gauge).balanceOf(address(this))` as `_totalAssets`

This template requires the LP token to already be the `asset`. The wizard validates
this by checking that `gauge.lp_token()` matches the entered asset address.

---

### Template: `Vault4626Wrapper.sol.hbs`

- `_deployFunds`: `IERC4626(innerVault).deposit(amount, address(this))`
- `_freeFunds`: `IERC4626(innerVault).withdraw(amount, address(this), address(this))`
- `_harvestAndReport`: call inner vault's optional `harvest()` or `report()` if it
  exists (detected at wizard time), then return `IERC4626(innerVault).convertToAssets(shares)`

Simplest template — useful for wrapping another ERC-4626 vault to give it a Yearn-style
fee structure and keeper automation.

---

## Implementation Phases

### Phase 0 — Foundry project scaffold

Create `yearn/backend/foundry/` with:
- `foundry.toml` (as specified above)
- Install git submodule dependencies via `forge install`
- `src/.gitkeep` (runtime-written files go here)
- `script/DeployStrategy.s.sol` (as specified above)
- `test/Strategy.t.sol` — basic fork test template

Verify `forge build` succeeds against an empty `src/`.

**Deliverable:** `forge build` exits 0. All remappings resolve. `forge-std` available.

---

### Phase 1 — Backend scaffold

Create `yearn/backend/server.js`, `resolver.js`, `generator.js`, `compiler.js`,
`deployer.js`, `chains.js` with stubs for all endpoints and functions.

`chains.js` must include for each chain:
- `chainId`, `name`, `rpcUrl`, `blockExplorer`
- `yearnAddresses.tokenizedStrategy`, `yearnAddresses.vaultFactory`
- `yearnAddresses.roleManager`, `yearnAddresses.accountant` (where deployed)
- `yearnAddresses.tksKeeper`
- `aavePool`, `aaveRewardsController`
- `compoundComet` (per asset, or `null` if not deployed)
- `morphoHub`
- `crvMinter` (Ethereum mainnet only)
- `nativeToken` (WETH address per chain)

**Deliverable:** `node server.js` starts without errors on port 8789. All endpoints return `501 Not Implemented` stubs.

---

### Phase 2 — `resolver.js` — on-chain probes

Implement all probe functions using ethers.js v6:

**`probeToken(chainId, address)`**
- Calls `name()`, `symbol()`, `decimals()`
- Tries `asset()` (ERC-4626 check) — if succeeds and returns non-zero, sets `isErc4626: true`
- Returns `{ symbol, name, decimals, isErc4626, underlyingAsset }`

**`checkAaveMarket(chainId, asset)`**
- Instantiate `IPool(aavePool)` and call `getReserveData(asset)`
- If `aTokenAddress !== ZeroAddress` → `{ active: true, aToken, supplyRateRay }`
- Else → `{ active: false }`

**`checkCompoundMarket(chainId, asset)`**
- For each known Comet address on the chain, call `baseToken()` and compare
- If match → `{ active: true, comet, supplyRate }`
- Else → `{ active: false }`

**`checkMorphoMarket(chainId, asset)`**
- Call Morpho Blue's market enumeration or use a known `marketId` list per chain
- Returns `{ marketId, oracle, irm, lltv }` or `{ active: false }`

**`getCurveGaugeInfo(chainId, gauge)`**
- Calls `lp_token()` on the gauge
- Calls `reward_tokens(0..N)` until it returns ZeroAddress
- Calls `claimable_tokens(address(0))` to get CRV emission rate
- Returns `{ lpToken, rewardTokens[], crvRatePerSecond }`

**Deliverable:** All probes work correctly against mainnet fork. Jest tests for each.

---

### Phase 3 — `generator.js` + templates

Write all 5 Handlebars templates. Implement `generateStrategy(form, chainAddresses)`.

For each template:
1. Write the Handlebars `.sol.hbs` file
2. Write a unit test that calls `generateStrategy()` with a valid form object
3. Pipe the output through `forge build` to confirm it compiles without errors
4. Confirm that the compiled contract correctly calls the expected external contracts
   (use `cast interface` on each external contract to validate ABIs)

Each template must compile with:
```
forge build --force
```
...and produce no errors or warnings.

**Deliverable:** All 5 templates generate compilable Solidity. Unit tests pass.

---

### Phase 4 — `compiler.js` + `deployer.js`

Implement `compileStrategy()` and `deployStrategy()` (as specified above).

Wire them into `server.js`:
- `POST /api/generate` → `generateStrategy()` → return source
- `POST /api/compile` → `generateStrategy()` → `compileStrategy()` → return result
- `POST /api/deploy/dryrun` → `generateStrategy()` → `compileStrategy()` → `deployStrategy({ dryRun: true })`
- `POST /api/deploy/execute` → `generateStrategy()` → `compileStrategy()` → `deployStrategy({ dryRun: false })`

Add retry logic (same 3× pattern as Beefy `deployer.js`) for RPC errors.

**Deliverable:** Full compile + dry-run pipeline works end-to-end for the Aave template on mainnet fork.

---

### Phase 5 — Frontend scaffold

Copy the SNES pixel-art CSS theme from `../frontend/src/styles/global.css`.
Copy `PixelBox.jsx` from `../frontend/src/components/`.

Create the `App.jsx` 8-step wizard router with the same session persistence pattern
(localStorage, version key, clear/restart).

Create stub components for all 8 steps (just renders "Step N — coming soon").

**Deliverable:** Frontend starts, shows 8-step wizard with navigation, state persists across
page reload.

---

### Phase 6 — Steps 1–3 (chain, asset, strategy type)

Implement `Step1Network.jsx`, `Step2Asset.jsx`, `Step3StratType.jsx` in full.

Step 2 must:
- Debounce the address input (300 ms)
- Show a loading spinner during the probe
- Display all probe results (symbol, decimals, ERC-4626 status)
- List suggested strategy types as clickable cards

Step 3 must:
- Grey out unavailable strategy types
- Show yield source details (aToken address, current APY if available)
- For `curve-gauge`: show the gauge address input + coin picker

**Deliverable:** User can select chain + asset + strategy type with live validation.

---

### Phase 7 — Steps 4–6 (rewards, fees, periphery)

Implement `Step4Rewards.jsx`, `Step5FeeConfig.jsx`, `Step6Periphery.jsx`.

Step 4 must:
- Auto-populate reward tokens from the backend probe
- Show router selector and path configuration for each
- Validate that at least one path exists before allowing proceed

Step 5 must:
- Validate `performanceFee` ≤ 50%
- Remember `feeRecipient` in localStorage
- Show estimated keeper cost for TKS (flat estimate from docs)

Step 6 must:
- Show health check bounds inputs when toggle is on
- Show deposit limit amount input when toggle is on

**Deliverable:** Steps 4–6 fully functional with validation.

---

### Phase 8 — Steps 7–8 (review + deploy)

Implement `Step7Review.jsx` and `StepDeploy.jsx`.

Step 7 must:
- Render the live code preview using the same Handlebars templates as the backend
  (share template logic between frontend and backend — templates are pure string
  interpolation, safe to run client-side)
- Include syntax highlighting (Prism.js)
- Include a "Download Source" button

Step 8 must:
- Implement the three-phase compile → dry-run → deploy flow
- Show streaming output from forge (server-sent events or polling)
- Parse and display error hints
- Show the post-deploy checklist after success

**Deliverable:** Full end-to-end wizard works for all 5 strategy types.

---

### Phase 9 — Testing

**Backend unit tests (`backend/tests/resolver.test.js`):**
- Each probe function tested against a mainnet fork (via `FORK_URL` env var)
- `generateStrategy()` tested for all 5 strategy types — output is a non-empty string
  containing expected contract name and key function bodies
- `compileStrategy()` tested for each template (slow — fork optional, compilation only)

**Forge fork tests (`foundry/test/Strategy.t.sol`):**
- Template test that verifies:
  1. Strategy deploys successfully
  2. `deposit()` transfers asset to strategy and calls `_deployFunds`
  3. `report()` calls `_harvestAndReport` and returns a sane total assets figure
  4. `withdraw()` calls `_freeFunds` and returns asset to user
  5. Health check does not trigger under normal conditions
- Run via `forge test --fork-url $MAINNET_RPC -vvv`

**Deliverable:** `npm test` (Jest) and `forge test --fork-url $MAINNET_RPC` both pass.

---

## Environment Variables

```bash
# yearn/backend/.env
PORT=8789
MAINNET_RPC=https://ethereum.publicnode.com
ARBITRUM_RPC=https://arbitrum-one.publicnode.com
BASE_RPC=https://base.publicnode.com
POLYGON_RPC=https://polygon-bor.publicnode.com
OPTIMISM_RPC=https://optimism.publicnode.com
PRIVATE_KEY=0x…             # deployer wallet private key (NEVER commit this)
ETHERSCAN_KEY=…
ARBISCAN_KEY=…
BASESCAN_KEY=…
```

---

## Running the Tool

```bash
# Install backend dependencies
cd yearn/backend && npm install

# Install Foundry (once, if not already installed)
curl -L https://foundry.paradigm.xyz | bash && foundryup

# Install Foundry library dependencies (once)
cd yearn/backend/foundry
forge install yearn/tokenized-strategy
forge install yearn/tokenized-strategy-periphery
forge install OpenZeppelin/openzeppelin-contracts
forge install foundry-rs/forge-std

# Start backend
cd yearn/backend && node server.js        # port 8789

# Start frontend (separate terminal)
cd yearn/frontend && npm install && npm run dev   # port 5174, proxies /api/ to 8789
```

---

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Generated code is unaudited | Only offer templates that mirror Yearn's own reference strategies; prominent disclaimer in UI |
| Template generates non-compilable code | Phase 3 unit tests compile every template before merge |
| Reward swap path is wrong | Phase 4 fork test calls `report()` on a live fork and verifies reward accrual |
| User loses funds due to incorrect `_freeFunds` | Health check enabled by default; forge fork test verifies correct withdraw |
| Foundry not installed on server | `compiler.js` checks for `forge` binary at startup; shows installation instructions if missing |
| Private key in `.env` | `.env` is gitignored; deploy endpoint refuses to run if `PRIVATE_KEY` is not set |
| Template injection via form fields | Handlebars auto-escapes all values; template context is always typed data, never raw user strings |

---

## Out of Scope (future phases)

- Allocator vault deployment UI
- Multi-strategy vault composition wizard
- Gas optimization suggestions
- Custom Solidity editing in-browser (Monaco editor)
- CI/CD integration (auto-deploy on git push)
- Strategy performance analytics dashboard
- Support for Vyper strategies
