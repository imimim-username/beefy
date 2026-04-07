'use strict';
/**
 * deploy_curvegauge.cjs — deploys BeefyVaultV7 + StrategyCurveConvexFactory (via StrategyFactory)
 *                          in pure Curve mode (no Convex) using NO_PID sentinel.
 *
 * Uses Beefy's official audited StrategyCurveConvexFactory cloned from StrategyFactory.
 * Passing NO_PID=42069 as the _pid tells the strategy to skip Convex and stake
 * directly in the Curve native LiquidityGauge. BeefySwapper handles all reward swaps.
 *
 * Reads params from scripts/_deploy_params.json (written by deployer.js).
 * Outputs exactly one line:  DEPLOY_RESULT=<json>
 */

const { ethers, network } = require('hardhat');
const path = require('path');
const fs   = require('fs');

// Sentinel value: tells StrategyCurveConvexFactory to operate in pure Curve mode (skip Convex)
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

  console.log(`\n[curvegauge-deploy] mode=${dryRun ? 'DRY-RUN (fork)' : 'LIVE'} network=${network.name} chainId=${chainId}`);
  console.log(`[curvegauge-deploy] want=${want} gauge=${gaugeAddr} (pure Curve, NO_PID=${NO_PID})`);
  console.log(`[curvegauge-deploy] depositToken=${depositToken}`);

  const [deployer] = await ethers.getSigners();
  const strategistAddress = strategistParam || deployer.address;
  console.log(`[curvegauge-deploy] deployer=${deployer.address}`);

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
    console.log(`[curvegauge-deploy] vault cloned: ${vaultAddress}`);
  } else {
    const VaultFactory = await ethers.getContractFactory('BeefyVaultV7');
    const vault = await VaultFactory.deploy();
    await vault.waitForDeployment();
    vaultAddress = await vault.getAddress();
    console.log(`[curvegauge-deploy] vault deployed directly: ${vaultAddress}`);
  }

  // ── 2. Clone strategy via StrategyFactory ─────────────────────────────────
  // Use staticCall to get the proxy address before sending the tx — avoids
  // depending on parsing the ProxyCreated event (whose signature differs from
  // the VaultFactory event: StrategyFactory emits (string name, address proxy)).
  const strategyFactoryAbi = [
    'function createStrategy(string calldata _strategyName) external returns (address)',
  ];
  const strategyFactory = new ethers.Contract(beefyAddresses.strategyFactory, strategyFactoryAbi, deployer);
  const stratAddress = await strategyFactory.createStrategy.staticCall('CurveConvex');
  if (!stratAddress || stratAddress === ZERO) throw new Error('staticCall returned zero address for createStrategy');
  console.log(`[curvegauge-deploy] strategy address (pre-computed): ${stratAddress}`);
  const stratTx = await strategyFactory.createStrategy('CurveConvex');
  await stratTx.wait();
  console.log(`[curvegauge-deploy] strategy cloned (CurveConvex/pure-Curve): ${stratAddress}`);

  // ── 3. Initialize vault ───────────────────────────────────────────────────
  const vaultAbi = ['function initialize(address strategy, string name, string symbol, uint256 approvalDelay) external'];
  const vault = new ethers.Contract(vaultAddress, vaultAbi, deployer);
  await (await vault.initialize(stratAddress, vaultName, vaultSymbol, 21600)).wait();
  console.log(`[curvegauge-deploy] vault initialized`);

  // ── 4. Initialize strategy ────────────────────────────────────────────────
  // StrategyCurveConvexFactory.initialize(
  //   address _gauge,       — Curve native LiquidityGauge address
  //   uint256 _pid,         — NO_PID (42069) = pure Curve mode, skip Convex
  //   address[] _rewards,   — reward token addresses
  //   Addresses {want, depositToken, factory, vault, swapper, strategist}
  // )
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
  console.log(`[curvegauge-deploy] strategy initialized (pid=${NO_PID} = pure Curve)`);
  const deployBlock = await ethers.provider.getBlock(stratReceipt.blockNumber);
  const blockTimestamp = deployBlock ? deployBlock.timestamp : Math.floor(Date.now() / 1000);
  console.log(`[curvegauge-deploy] block ${stratReceipt.blockNumber} timestamp: ${blockTimestamp}`);

  // ── Optional: harvestOnDeposit ────────────────────────────────────────────
  if (harvestOnDeposit) {
    try {
      const hodAbi = ['function setHarvestOnDeposit(bool _harvestOnDeposit) external'];
      const stratHod = new ethers.Contract(stratAddress, hodAbi, deployer);
      await (await stratHod.setHarvestOnDeposit(true)).wait();
      console.log(`[curvegauge-deploy] harvestOnDeposit set to true`);
    } catch (e) {
      console.warn(`[curvegauge-deploy] setHarvestOnDeposit not supported — skipped`);
    }
  }

  // ── 5. Transfer vault ownership ───────────────────────────────────────────
  // Note: strategy ownership stays with StrategyFactory (not transferred manually)
  const vaultOwner = beefyAddresses.vaultOwner;
  if (vaultOwner && vaultOwner !== ZERO) {
    const vaultForOwner = new ethers.Contract(vaultAddress, ['function transferOwnership(address newOwner) external'], deployer);
    await (await vaultForOwner.transferOwnership(vaultOwner)).wait();
    console.log(`[curvegauge-deploy] vault ownership transferred to: ${vaultOwner}`);
  }

  const result = {
    vaultAddress,
    strategyAddress: stratAddress,
    strategyType: 'CurveConvex (pure Curve, NO_PID)',
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
