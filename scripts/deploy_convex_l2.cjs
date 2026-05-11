'use strict';
/**
 * deploy_convex_l2.cjs — deploys BeefyVaultV7 + StrategyCurveConvexL2Factory (via StrategyFactory)
 *
 * Used for L2 chains (Arbitrum, etc.) where Convex uses a different booster interface:
 *   L2 booster.poolInfo(pid) returns:
 *     (address lptoken, address gauge, address rewards, bool shutdown, address factory)
 *   vs L1 which returns:
 *     (address lptoken, address token, address gauge, address crvRewards, address stash, bool shutdown)
 *
 * Key differences from deploy_convex.cjs:
 *   - Strategy name: 'CurveConvexL2' (not 'CurveConvex')
 *   - booster.poolInfo ABI: 5-value L2 tuple (gauge at index [1], rewards at index [2])
 *   - harvestOnDeposit is set automatically by the strategy's initialize(); separate call is a no-op
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
    staking: boosterAddr,   // Convex L2 Booster address
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

  console.log(`\n[convex-l2-deploy] mode=${dryRun ? 'DRY-RUN (fork)' : 'LIVE'} network=${network.name} chainId=${chainId}`);
  console.log(`[convex-l2-deploy] want=${want} booster=${boosterAddr} convexPoolId=${convexPoolId}`);
  console.log(`[convex-l2-deploy] depositToken=${depositToken}`);

  const [deployer] = await ethers.getSigners();
  const strategistAddress = strategistParam || deployer.address;
  console.log(`[convex-l2-deploy] deployer=${deployer.address}`);
  console.log(`[convex-l2-deploy] strategist=${strategistAddress}`);

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
    console.log(`[convex-l2-deploy] vault cloned: ${vaultAddress}`);
  } else {
    const VaultFactory = await ethers.getContractFactory('BeefyVaultV7');
    const vault = await VaultFactory.deploy();
    await vault.waitForDeployment();
    vaultAddress = await vault.getAddress();
    console.log(`[convex-l2-deploy] vault deployed directly: ${vaultAddress}`);
  }

  // ── 2. Clone strategy via StrategyFactory (CurveConvexL2) ─────────────────
  const strategyFactoryAbi = [
    'function createStrategy(string calldata _strategyName) external returns (address)',
  ];
  const strategyFactory = new ethers.Contract(beefyAddresses.strategyFactory, strategyFactoryAbi, deployer);
  const stratAddress = await strategyFactory.createStrategy.staticCall('CurveConvexL2');
  if (!stratAddress || stratAddress === ZERO) throw new Error('staticCall returned zero address for createStrategy');
  console.log(`[convex-l2-deploy] strategy address (pre-computed): ${stratAddress}`);
  const stratTx = await strategyFactory.createStrategy('CurveConvexL2');
  await stratTx.wait();
  console.log(`[convex-l2-deploy] strategy cloned (CurveConvexL2): ${stratAddress}`);

  // ── 3. Resolve gauge address from L2 Convex Booster ───────────────────────
  // L2 booster.poolInfo returns: (lptoken, gauge, rewards, shutdown, factory)
  // gauge is at index [1] — different from L1 where gauge is at index [2]
  const boosterAbiL2 = [
    'function poolInfo(uint256 pid) external view returns (address lptoken, address gauge, address rewards, bool shutdown, address factory)',
  ];
  const booster = new ethers.Contract(boosterAddr, boosterAbiL2, deployer);
  const poolInfo = await booster.poolInfo(Number(convexPoolId));
  const gaugeAddr = poolInfo[1]; // index 1 = gauge on L2 (NOT index 2 as on L1)
  console.log(`[convex-l2-deploy] gauge (from L2 booster.poolInfo[1]): ${gaugeAddr}`);

  // ── 4. Initialize vault ───────────────────────────────────────────────────
  const vaultAbi = [
    'function initialize(address strategy, string name, string symbol, uint256 approvalDelay) external',
  ];
  const vault = new ethers.Contract(vaultAddress, vaultAbi, deployer);
  await (await vault.initialize(stratAddress, vaultName, vaultSymbol, 21600)).wait();
  console.log(`[convex-l2-deploy] vault initialized`);

  // ── 5. Initialize strategy ────────────────────────────────────────────────
  // StrategyCurveConvexL2Factory.initialize(
  //   address _gauge,       — from L2 booster.poolInfo(pid)[1]
  //   uint256 _pid,         — Convex pool ID
  //   address[] _rewards,   — reward token addresses
  //   Addresses {want, depositToken, factory, vault, swapper, strategist}
  // )
  // NOTE: StrategyCurveConvexL2Factory.initialize() sets harvestOnDeposit=true
  //       automatically — no separate setHarvestOnDeposit() call needed.
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
  console.log(`[convex-l2-deploy] strategy initialized (L2)`);
  const deployBlock = await ethers.provider.getBlock(stratReceipt.blockNumber);
  const blockTimestamp = deployBlock ? deployBlock.timestamp : Math.floor(Date.now() / 1000);
  console.log(`[convex-l2-deploy] block ${stratReceipt.blockNumber} timestamp: ${blockTimestamp}`);

  // harvestOnDeposit is set automatically by StrategyCurveConvexL2Factory.initialize()
  // A separate setHarvestOnDeposit() call is not needed and would be a no-op.
  if (harvestOnDeposit) {
    console.log(`[convex-l2-deploy] harvestOnDeposit already enabled by initialize() on L2 strategy`);
  }

  // ── 6. Transfer vault ownership to Beefy multisig ─────────────────────────
  const vaultOwner = beefyAddresses.vaultOwner;
  if (vaultOwner && vaultOwner !== ZERO) {
    const vaultForOwner = new ethers.Contract(vaultAddress, ['function transferOwnership(address newOwner) external'], deployer);
    await (await vaultForOwner.transferOwnership(vaultOwner)).wait();
    console.log(`[convex-l2-deploy] vault ownership transferred to: ${vaultOwner}`);
  }

  const result = {
    vaultAddress,
    strategyAddress: stratAddress,
    strategyType: 'CurveConvexL2',
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
