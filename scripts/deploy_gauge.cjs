'use strict';
/**
 * deploy_gauge.cjs — deploys BeefyVaultV7 + StrategyVelodrome (via StrategyFactory)
 *
 * Uses Beefy's official audited StrategyVelodrome cloned from StrategyFactory.
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
    want,
    staking: gaugeAddress,  // Velodrome/Aerodrome/Solidly gauge address
    depositToken,           // single pool token for liquidity add after BeefySwapper
    rewardTokens,           // array of reward token addresses
    harvestOnDeposit,
    vaultName,
    vaultSymbol,
    strategist: strategistParam,
    beefyAddresses,
    dryRun,
  } = params;

  console.log(`\n[gauge-deploy] mode=${dryRun ? 'DRY-RUN (fork)' : 'LIVE'} network=${network.name} chainId=${chainId}`);
  console.log(`[gauge-deploy] want=${want} gauge=${gaugeAddress}`);
  console.log(`[gauge-deploy] depositToken=${depositToken}`);

  const [deployer] = await ethers.getSigners();
  const strategistAddress = strategistParam || deployer.address;
  console.log(`[gauge-deploy] deployer=${deployer.address}`);
  console.log(`[gauge-deploy] strategist=${strategistAddress}`);

  if (!beefyAddresses.strategyFactory) throw new Error('strategyFactory not configured for this chain');
  if (!beefyAddresses.beefySwapper)   throw new Error('beefySwapper not configured for this chain');

  const ZERO = '0x0000000000000000000000000000000000000000';

  // ── 1. Deploy or clone vault ──────────────────────────────────────────────
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
    console.log(`[gauge-deploy] vault cloned: ${vaultAddress}`);
  } else {
    const VaultFactory = await ethers.getContractFactory('BeefyVaultV7');
    const vault = await VaultFactory.deploy();
    await vault.waitForDeployment();
    vaultAddress = await vault.getAddress();
    console.log(`[gauge-deploy] vault deployed directly: ${vaultAddress}`);
  }

  // ── 2. Clone strategy via StrategyFactory ─────────────────────────────────
  const strategyFactoryAbi = [
    'function createStrategy(string calldata _strategyName) external returns (address)',
    'event ProxyCreated(address proxy)',
  ];
  const strategyFactory = new ethers.Contract(beefyAddresses.strategyFactory, strategyFactoryAbi, deployer);
  const stratTx = await strategyFactory.createStrategy('Velodrome');
  const stratReceipt0 = await stratTx.wait();
  let stratAddress;
  const sIface = new ethers.Interface(strategyFactoryAbi);
  for (const log of stratReceipt0.logs) {
    try {
      const parsed = sIface.parseLog(log);
      if (parsed.name === 'ProxyCreated') { stratAddress = parsed.args.proxy; break; }
    } catch {}
  }
  if (!stratAddress) throw new Error('ProxyCreated event not found in StrategyFactory tx');
  console.log(`[gauge-deploy] strategy cloned (Velodrome): ${stratAddress}`);

  // ── 3. Initialize vault ───────────────────────────────────────────────────
  const vaultAbi = [
    'function initialize(address strategy, string name, string symbol, uint256 approvalDelay) external',
  ];
  const vault = new ethers.Contract(vaultAddress, vaultAbi, deployer);
  await (await vault.initialize(stratAddress, vaultName, vaultSymbol, 21600)).wait();
  console.log(`[gauge-deploy] vault initialized`);

  // ── 4. Initialize strategy ────────────────────────────────────────────────
  // StrategyVelodrome.initialize(
  //   address _rewardPool,      — the gauge contract
  //   address _solidlyRouter,   — Velodrome/Aerodrome router (beefyAddresses.unirouter)
  //   address[] _rewards,       — reward token addresses
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
    'function initialize(address _rewardPool, address _solidlyRouter, address[] calldata _rewards, tuple(address want, address depositToken, address factory, address vault, address swapper, address strategist) _addresses) external',
  ];
  const strategy = new ethers.Contract(stratAddress, stratAbi, deployer);
  const txStrat = await strategy.initialize(
    gaugeAddress,
    beefyAddresses.unirouter,
    rewardAddresses,
    addresses
  );
  const stratReceipt = await txStrat.wait();
  console.log(`[gauge-deploy] strategy initialized`);
  const deployBlock = await ethers.provider.getBlock(stratReceipt.blockNumber);
  const blockTimestamp = deployBlock ? deployBlock.timestamp : Math.floor(Date.now() / 1000);
  console.log(`[gauge-deploy] block ${stratReceipt.blockNumber} timestamp: ${blockTimestamp}`);

  // ── Optional: harvestOnDeposit ────────────────────────────────────────────
  if (harvestOnDeposit) {
    try {
      const hodAbi = ['function setHarvestOnDeposit(bool _harvestOnDeposit) external'];
      const stratHod = new ethers.Contract(stratAddress, hodAbi, deployer);
      await (await stratHod.setHarvestOnDeposit(true)).wait();
      console.log(`[gauge-deploy] harvestOnDeposit set to true`);
    } catch (e) {
      console.warn(`[gauge-deploy] setHarvestOnDeposit not supported — skipped`);
    }
  }

  // ── 5. Transfer vault ownership to Beefy multisig ─────────────────────────
  // Note: strategy ownership stays with StrategyFactory (not transferred manually)
  const vaultOwner = beefyAddresses.vaultOwner;
  if (vaultOwner && vaultOwner !== ZERO) {
    const vaultOwnerAbi = ['function transferOwnership(address newOwner) external'];
    const vaultForOwner = new ethers.Contract(vaultAddress, vaultOwnerAbi, deployer);
    await (await vaultForOwner.transferOwnership(vaultOwner)).wait();
    console.log(`[gauge-deploy] vault ownership transferred to: ${vaultOwner}`);
  }

  const result = {
    vaultAddress,
    strategyAddress: stratAddress,
    strategyType: 'Velodrome',
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
