'use strict';
/**
 * deploy_aura.cjs — deploys BeefyVaultV7 + official StrategyBalancerV3
 *
 * Uses Beefy's StrategyFactory to create a clone of the audited StrategyBalancerV3
 * implementation. No custom strategy contract is deployed — this is required for
 * Beefy to accept the vault listing.
 *
 * Reads params from scripts/_deploy_params.json (written by deployer.js).
 * Outputs exactly one line:  DEPLOY_RESULT=<json>
 *
 * Official contracts used:
 *   StrategyFactory : beefyAddresses.strategyFactory
 *   BeefySwapper    : beefyAddresses.beefySwapper
 *   BalancerV3Vault : 0xbA1333333333a1BA1108E8412f11850A5C319bA9 (hardcoded)
 */

const { ethers, network } = require('hardhat');
const path = require('path');
const fs   = require('fs');

const BALANCER_V3_VAULT = '0xbA1333333333a1BA1108E8412f11850A5C319bA9';
const STRATEGY_NAME     = 'BalancerV3';
const ZERO              = '0x0000000000000000000000000000000000000000';

async function main() {
  const paramsFile = path.join(__dirname, '_deploy_params.json');
  const params = JSON.parse(fs.readFileSync(paramsFile, 'utf8'));

  const {
    chainId,
    want,                  // Balancer Pool Token (BPT) address
    staking: boosterAddr,  // Aura Booster address
    poolId: auraPoolId,    // Aura pool ID (numeric)
    rewardTokens,          // [{ address, symbol }, ...] — BAL + AURA from Step 4
    depositToken,          // one of the BPT's underlying tokens (for single-asset join)
    vaultName,
    vaultSymbol,
    strategist: strategistParam,
    beefyAddresses,
    dryRun,
  } = params;

  // ── Validate required addresses ──────────────────────────────────────────────
  const stratFactory = beefyAddresses?.strategyFactory;
  const beefySwapper = beefyAddresses?.beefySwapper;
  if (!stratFactory || stratFactory === ZERO) {
    throw new Error('beefyAddresses.strategyFactory is missing — add it to chains.js for this chain');
  }
  if (!beefySwapper || beefySwapper === ZERO) {
    throw new Error('beefyAddresses.beefySwapper is missing — add it to chains.js for this chain');
  }
  if (!depositToken || depositToken === ZERO) {
    throw new Error('depositToken is missing — select a pool token in Step 5');
  }

  const rewardAddresses = (rewardTokens || []).map(t =>
    typeof t === 'string' ? t : t.address
  );

  console.log(`\n[aura-deploy] mode=${dryRun ? 'DRY-RUN (fork)' : 'LIVE'} network=${network.name} chainId=${chainId}`);
  console.log(`[aura-deploy] strategy implementation: ${STRATEGY_NAME}`);
  console.log(`[aura-deploy] want=${want}`);
  console.log(`[aura-deploy] booster=${boosterAddr}  auraPoolId=${auraPoolId}`);
  console.log(`[aura-deploy] depositToken=${depositToken}`);
  console.log(`[aura-deploy] rewards=${JSON.stringify(rewardAddresses)}`);
  console.log(`[aura-deploy] strategyFactory=${stratFactory}`);
  console.log(`[aura-deploy] beefySwapper=${beefySwapper}`);

  const [deployer] = await ethers.getSigners();
  const strategistAddress = strategistParam || deployer.address;
  console.log(`[aura-deploy] deployer=${deployer.address}`);
  console.log(`[aura-deploy] strategist=${strategistAddress}`);

  // ── 1. Clone vault from Beefy VaultFactory ───────────────────────────────────
  const vaultFactoryAbi = [
    'function cloneVault() external returns (address vault)',
    'event ProxyCreated(address proxy)',
  ];
  const vaultFactoryAddr = beefyAddresses?.vaultFactory;
  if (!vaultFactoryAddr || vaultFactoryAddr === ZERO) {
    throw new Error('beefyAddresses.vaultFactory is missing');
  }
  const vaultFactory = new ethers.Contract(vaultFactoryAddr, vaultFactoryAbi, deployer);
  const cloneTx = await vaultFactory.cloneVault();
  const cloneReceipt = await cloneTx.wait();
  let vaultAddress;
  const iface = new ethers.Interface(vaultFactoryAbi);
  for (const log of cloneReceipt.logs) {
    try {
      const parsed = iface.parseLog(log);
      if (parsed.name === 'ProxyCreated') { vaultAddress = parsed.args.proxy; break; }
    } catch {}
  }
  if (!vaultAddress) throw new Error('ProxyCreated event not found in cloneVault tx');
  console.log(`[aura-deploy] vault cloned: ${vaultAddress}`);

  // ── 2. Create strategy via StrategyFactory ────────────────────────────────────
  // This clones Beefy's audited StrategyBalancerV3 implementation — no custom
  // contract is deployed. Required for Beefy to accept the vault listing.
  const stratFactoryAbi = [
    'function createStrategy(string calldata _strategyName) external returns (address)',
    'event StrategyCreated(string strategyName, address strategy)',
  ];
  const stratFactoryContract = new ethers.Contract(stratFactory, stratFactoryAbi, deployer);
  const stratTx = await stratFactoryContract.createStrategy(STRATEGY_NAME);
  const stratReceipt = await stratTx.wait();
  let stratAddress;
  const stratIface = new ethers.Interface(stratFactoryAbi);
  for (const log of stratReceipt.logs) {
    try {
      const parsed = stratIface.parseLog(log);
      if (parsed.name === 'StrategyCreated') { stratAddress = parsed.args.strategy; break; }
    } catch {}
  }
  // Fallback: read return value via callStatic if event not found
  if (!stratAddress) {
    stratAddress = await stratFactoryContract.createStrategy.staticCall(STRATEGY_NAME);
    if (!stratAddress || stratAddress === ZERO) throw new Error('Could not determine strategy address from StrategyFactory');
  }
  console.log(`[aura-deploy] strategy created via factory: ${stratAddress}`);

  // ── 3. Initialize vault ───────────────────────────────────────────────────────
  const vaultAbi = [
    'function initialize(address strategy, string name, string symbol, uint256 approvalDelay) external',
    'function transferOwnership(address newOwner) external',
  ];
  const vault = new ethers.Contract(vaultAddress, vaultAbi, deployer);
  await (await vault.initialize(stratAddress, vaultName, vaultSymbol, 21600)).wait();
  console.log(`[aura-deploy] vault initialized`);

  // ── 4. Transfer vault ownership to Beefy multisig ────────────────────────────
  const vaultOwner = beefyAddresses.vaultOwner;
  if (vaultOwner && vaultOwner !== ZERO) {
    await (await vault.transferOwnership(vaultOwner)).wait();
    console.log(`[aura-deploy] vault ownership → ${vaultOwner}`);
  }

  // ── 5. Get gauge from Aura booster ───────────────────────────────────────────
  // poolInfo returns: (lptoken, token, gauge, crvRewards, stash, shutdown)
  const boosterAbi = [
    'function poolInfo(uint256 pid) external view returns (address lptoken, address token, address gauge, address crvRewards, address stash, bool shutdown)',
  ];
  const booster = new ethers.Contract(boosterAddr, boosterAbi, deployer);
  const poolInfo = await booster.poolInfo(Number(auraPoolId));
  const gaugeAddress = poolInfo[2]; // index 2 = gauge
  console.log(`[aura-deploy] gauge (from booster.poolInfo): ${gaugeAddress}`);

  // ── 6. Initialize strategy (StrategyBalancerV3) ───────────────────────────────
  // Addresses struct: { want, depositToken, factory, vault, swapper, strategist }
  const strategyAbi = [
    'function initialize(address _gauge, address _booster, address _balancerVault, uint256 _pid, address[] calldata _rewards, (address want, address depositToken, address factory, address vault, address swapper, address strategist) calldata _commonAddresses) external',
  ];
  const strategy = new ethers.Contract(stratAddress, strategyAbi, deployer);
  const commonAddresses = {
    want:         want,
    depositToken: depositToken,
    factory:      stratFactory,
    vault:        vaultAddress,
    swapper:      beefySwapper,
    strategist:   strategistAddress,
  };
  const initTx = await strategy.initialize(
    gaugeAddress,
    boosterAddr,
    BALANCER_V3_VAULT,
    Number(auraPoolId),
    rewardAddresses,
    commonAddresses
  );
  await initTx.wait();
  console.log(`[aura-deploy] strategy initialized`);

  const result = {
    vaultAddress,
    strategyAddress: stratAddress,
    vaultName,
    vaultSymbol,
    chainId,
    network: network.name,
    deployerAddress: deployer.address,
    dryRun: !!dryRun,
    txHash: initTx.hash,
  };

  console.log(`DEPLOY_RESULT=${JSON.stringify(result)}`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
