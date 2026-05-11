'use strict';
/**
 * deploy_curvegauge_l2.cjs — deploys BeefyVaultV7 + StrategyCurveConvexL2Factory (via StrategyFactory)
 *                            in pure Curve mode (no Convex) using NO_PID sentinel, for L2 chains.
 *
 * Used for L2 chains (Arbitrum, Optimism, Base, etc.) where Curve native gauges use
 * StrategyCurveConvexL2Factory with stratName() = 'CurveConvexL2' — not the L1
 * StrategyCurveConvexFactory ('CurveConvex').
 *
 * Key differences from deploy_curvegauge.cjs:
 *   - Strategy name: 'CurveConvexL2' (not 'CurveConvex')
 *   - harvestOnDeposit is set automatically by initialize() — no separate call needed
 *   - isCrvMintable is set automatically to true when pid == NO_PID in initialize()
 *
 * Reads params from scripts/_deploy_params.json (written by deployer.js).
 * Outputs exactly one line:  DEPLOY_RESULT=<json>
 */

const { ethers, network } = require('hardhat');
const path = require('path');
const fs   = require('fs');

// Sentinel value: tells StrategyCurveConvexL2Factory to operate in pure Curve mode (skip Convex)
const NO_PID = 42069;

async function main() {
  const paramsFile = path.join(__dirname, '_deploy_params.json');
  const params = JSON.parse(fs.readFileSync(paramsFile, 'utf8'));

  const {
    chainId,
    want,                // Curve LP token
    staking: gaugeAddr,  // Curve native LiquidityGauge address
    depositToken,        // single Curve pool token for liquidity add after BeefySwapper
    rewardTokens,        // array of reward token addresses
    harvestOnDeposit,
    vaultName,
    vaultSymbol,
    strategist: strategistParam,
    beefyAddresses,
    dryRun,
  } = params;

  console.log(`\n[curvegauge-l2-deploy] mode=${dryRun ? 'DRY-RUN (fork)' : 'LIVE'} network=${network.name} chainId=${chainId}`);
  console.log(`[curvegauge-l2-deploy] want=${want} gauge=${gaugeAddr} (pure Curve L2, NO_PID=${NO_PID})`);
  console.log(`[curvegauge-l2-deploy] depositToken=${depositToken}`);

  const [deployer] = await ethers.getSigners();
  const strategistAddress = strategistParam || deployer.address;
  console.log(`[curvegauge-l2-deploy] deployer=${deployer.address}`);

  if (!beefyAddresses.strategyFactory) throw new Error('strategyFactory not configured for this chain');
  if (!beefyAddresses.beefySwapper)   throw new Error('beefySwapper not configured for this chain');

  const ZERO = '0x0000000000000000000000000000000000000000';

  // ── 1. Deploy or clone vault ───────────────────────────────────────────────
  let vaultAddress;
  if (beefyAddresses.vaultFactory && beefyAddresses.vaultFactory !== ZERO) {
    const factoryAbi = [
      'function cloneVault() external returns (address vault)',
      'event ProxyCreated(address proxy)',
    ];
    const factory = new ethers.Contract(beefyAddresses.vaultFactory, factoryAbi, deployer);
    const tx = await factory.cloneVault();
    const receipt = await tx.wait();
    const iface = new ethers.Interface(factoryAbi);
    for (const log of receipt.logs) {
      try {
        const parsed = iface.parseLog(log);
        if (parsed.name === 'ProxyCreated') { vaultAddress = parsed.args.proxy; break; }
      } catch {}
    }
    if (!vaultAddress) throw new Error('ProxyCreated event not found in factory tx');
    console.log(`[curvegauge-l2-deploy] vault cloned: ${vaultAddress}`);
  } else {
    const VaultFactory = await ethers.getContractFactory('BeefyVaultV7');
    const vault = await VaultFactory.deploy();
    await vault.waitForDeployment();
    vaultAddress = await vault.getAddress();
    console.log(`[curvegauge-l2-deploy] vault deployed directly: ${vaultAddress}`);
  }

  // ── 2. Clone strategy via StrategyFactory (CurveConvexL2) ─────────────────
  // On L2, both Convex and pure Curve gauge modes use StrategyCurveConvexL2Factory.
  // The strategy name registered in the on-chain StrategyFactory is 'CurveConvexL2'.
  const strategyFactoryAbi = [
    'function createStrategy(string calldata _strategyName) external returns (address)',
  ];
  const strategyFactory = new ethers.Contract(beefyAddresses.strategyFactory, strategyFactoryAbi, deployer);
  const stratAddress = await strategyFactory.createStrategy.staticCall('CurveConvexL2');
  if (!stratAddress || stratAddress === ZERO) throw new Error('staticCall returned zero address for createStrategy');
  console.log(`[curvegauge-l2-deploy] strategy address (pre-computed): ${stratAddress}`);
  const stratTx = await strategyFactory.createStrategy('CurveConvexL2');
  await stratTx.wait();
  console.log(`[curvegauge-l2-deploy] strategy cloned (CurveConvexL2/pure-Curve): ${stratAddress}`);

  // ── 3. Initialize vault ───────────────────────────────────────────────────
  const vaultAbi = ['function initialize(address strategy, string name, string symbol, uint256 approvalDelay) external'];
  const vault = new ethers.Contract(vaultAddress, vaultAbi, deployer);
  await (await vault.initialize(stratAddress, vaultName, vaultSymbol, 21600)).wait();
  console.log(`[curvegauge-l2-deploy] vault initialized`);

  // ── 4. Initialize strategy ────────────────────────────────────────────────
  // StrategyCurveConvexL2Factory.initialize(
  //   address _gauge,       — Curve native LiquidityGauge address
  //   uint256 _pid,         — NO_PID (42069) = pure Curve mode, skip Convex
  //   address[] _rewards,   — reward token addresses
  //   Addresses {want, depositToken, factory, vault, swapper, strategist}
  // )
  // When _pid == NO_PID, the strategy automatically sets:
  //   isCrvMintable = true   (mints CRV via gauge.factory() minter)
  //   harvestOnDeposit = true (via setHarvestOnDeposit in initialize)
  const addresses = {
    want:         want,
    depositToken: depositToken,
    factory:      beefyAddresses.strategyFactory,
    vault:        vaultAddress,
    swapper:      beefyAddresses.beefySwapper,
    strategist:   strategistAddress,
  };

  const rewardAddresses = (rewardTokens || []).map(t => t.address || t);

  const stratAbi = [
    'function initialize(address _gauge, uint256 _pid, address[] calldata _rewards, tuple(address want, address depositToken, address factory, address vault, address swapper, address strategist) _addresses) external',
  ];
  const strategy = new ethers.Contract(stratAddress, stratAbi, deployer);
  const txStrat = await strategy.initialize(
    gaugeAddr,
    NO_PID,
    rewardAddresses,
    addresses
  );
  const stratReceipt = await txStrat.wait();
  console.log(`[curvegauge-l2-deploy] strategy initialized (pid=${NO_PID} = pure Curve L2)`);
  const deployBlock = await ethers.provider.getBlock(stratReceipt.blockNumber);
  const blockTimestamp = deployBlock ? deployBlock.timestamp : Math.floor(Date.now() / 1000);
  console.log(`[curvegauge-l2-deploy] block ${stratReceipt.blockNumber} timestamp: ${blockTimestamp}`);

  // harvestOnDeposit and isCrvMintable are set by initialize() automatically on L2.
  if (harvestOnDeposit) {
    console.log(`[curvegauge-l2-deploy] harvestOnDeposit already enabled by initialize() on L2 strategy`);
  }

  // ── 5. Transfer vault ownership ───────────────────────────────────────────
  const vaultOwner = beefyAddresses.vaultOwner;
  if (params.transferVaultOwnership !== false && vaultOwner && vaultOwner !== ZERO) {
    const vaultForOwner = new ethers.Contract(vaultAddress, ['function transferOwnership(address newOwner) external'], deployer);
    await (await vaultForOwner.transferOwnership(vaultOwner)).wait();
    console.log(`[curvegauge-l2-deploy] vault ownership transferred to: ${vaultOwner}`);
  }

  const result = {
    vaultAddress,
    strategyAddress: stratAddress,
    strategyType: 'CurveConvexL2 (pure Curve L2, NO_PID)',
    vaultName,
    vaultSymbol,
    chainId,
    network: network.name,
    deployerAddress: deployer.address,
    dryRun: !!dryRun,
    txHash: txStrat.hash,
    blockTimestamp,
  };

  console.log(`DEPLOY_RESULT=${JSON.stringify(result)}`);
}

main().catch(e => { console.error(e); process.exit(1); });
