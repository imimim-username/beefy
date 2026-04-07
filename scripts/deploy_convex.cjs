'use strict';
/**
 * deploy_convex.cjs — deploys BeefyVaultV7 + StrategyCurveConvexFactory (via StrategyFactory)
 *
 * Uses Beefy's official audited StrategyCurveConvexFactory cloned from StrategyFactory.
 * BeefySwapper handles all reward→native swaps; you only supply a depositToken.
 *
 * Reads params from scripts/_deploy_params.json (written by deployer.js).
 * Outputs exactly one line:  DEPLOY_RESULT=<json>
 */

const { ethers, network } = require('hardhat');
const path = require('path');
const fs   = require('fs');

async function main() {
  const paramsFile = path.join(__dirname, '_deploy_params.json');
  const params = JSON.parse(fs.readFileSync(paramsFile, 'utf8'));

  const {
    chainId,
    want,                   // Curve LP token
    staking: boosterAddr,   // Convex Booster address
    poolId: convexPoolId,   // Convex pool ID
    depositToken,           // single Curve pool token for liquidity add after BeefySwapper
    rewardTokens,           // array of reward token addresses
    harvestOnDeposit,
    vaultName,
    vaultSymbol,
    strategist: strategistParam,
    beefyAddresses,
    dryRun,
  } = params;

  console.log(`\n[convex-deploy] mode=${dryRun ? 'DRY-RUN (fork)' : 'LIVE'} network=${network.name} chainId=${chainId}`);
  console.log(`[convex-deploy] want=${want} booster=${boosterAddr} convexPoolId=${convexPoolId}`);
  console.log(`[convex-deploy] depositToken=${depositToken}`);

  const [deployer] = await ethers.getSigners();
  const strategistAddress = strategistParam || deployer.address;
  console.log(`[convex-deploy] deployer=${deployer.address}`);
  console.log(`[convex-deploy] strategist=${strategistAddress}`);

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
    console.log(`[convex-deploy] vault cloned: ${vaultAddress}`);
  } else {
    const VaultFactory = await ethers.getContractFactory('BeefyVaultV7');
    const vault = await VaultFactory.deploy();
    await vault.waitForDeployment();
    vaultAddress = await vault.getAddress();
    console.log(`[convex-deploy] vault deployed directly: ${vaultAddress}`);
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
  console.log(`[convex-deploy] strategy address (pre-computed): ${stratAddress}`);
  const stratTx = await strategyFactory.createStrategy('CurveConvex');
  await stratTx.wait();
  console.log(`[convex-deploy] strategy cloned (CurveConvex): ${stratAddress}`);

  // ── 3. Resolve gauge address from Convex Booster ─────────────────────────
  // booster.poolInfo(pid) returns (lptoken, token, gauge, crvRewards, stash, shutdown)
  const boosterAbi = ['function poolInfo(uint256 pid) external view returns (address lptoken, address token, address gauge, address crvRewards, address stash, bool shutdown)'];
  const booster = new ethers.Contract(boosterAddr, boosterAbi, deployer);
  const poolInfo = await booster.poolInfo(Number(convexPoolId));
  const gaugeAddr = poolInfo[2]; // index 2 = gauge
  console.log(`[convex-deploy] gauge (from booster.poolInfo): ${gaugeAddr}`);

  // ── 4. Initialize vault ───────────────────────────────────────────────────
  const vaultAbi = [
    'function initialize(address strategy, string name, string symbol, uint256 approvalDelay) external',
  ];
  const vault = new ethers.Contract(vaultAddress, vaultAbi, deployer);
  await (await vault.initialize(stratAddress, vaultName, vaultSymbol, 21600)).wait();
  console.log(`[convex-deploy] vault initialized`);

  // ── 5. Initialize strategy ────────────────────────────────────────────────
  // StrategyCurveConvexFactory.initialize(
  //   address _gauge,       — from booster.poolInfo(pid)[2]
  //   uint256 _pid,         — Convex pool ID
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
    Number(convexPoolId),
    rewardAddresses,
    addresses
  );
  const stratReceipt = await txStrat.wait();
  console.log(`[convex-deploy] strategy initialized`);
  const deployBlock = await ethers.provider.getBlock(stratReceipt.blockNumber);
  const blockTimestamp = deployBlock ? deployBlock.timestamp : Math.floor(Date.now() / 1000);
  console.log(`[convex-deploy] block ${stratReceipt.blockNumber} timestamp: ${blockTimestamp}`);

  // ── Optional: harvestOnDeposit ────────────────────────────────────────────
  if (harvestOnDeposit) {
    try {
      const hodAbi = ['function setHarvestOnDeposit(bool _harvestOnDeposit) external'];
      const stratHod = new ethers.Contract(stratAddress, hodAbi, deployer);
      await (await stratHod.setHarvestOnDeposit(true)).wait();
      console.log(`[convex-deploy] harvestOnDeposit set to true`);
    } catch (e) {
      console.warn(`[convex-deploy] setHarvestOnDeposit not supported — skipped`);
    }
  }

  // ── 6. Transfer vault ownership to Beefy multisig ─────────────────────────
  // Note: strategy ownership stays with StrategyFactory (not transferred manually)
  const vaultOwner = beefyAddresses.vaultOwner;
  if (vaultOwner && vaultOwner !== ZERO) {
    const vaultOwnerAbi = ['function transferOwnership(address newOwner) external'];
    const vaultForOwner = new ethers.Contract(vaultAddress, vaultOwnerAbi, deployer);
    await (await vaultForOwner.transferOwnership(vaultOwner)).wait();
    console.log(`[convex-deploy] vault ownership transferred to: ${vaultOwner}`);
  }

  const result = {
    vaultAddress,
    strategyAddress: stratAddress,
    strategyType: 'CurveConvex',
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

main().catch(e => {
  console.error(e);
  process.exit(1);
});
