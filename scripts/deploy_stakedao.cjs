'use strict';
/**
 * deploy_stakedao.cjs — deploys BeefyVaultV7 + StrategyStakeDaoV2 (via StrategyFactory)
 *
 * Uses Beefy's official audited StrategyStakeDaoV2 cloned from StrategyFactory.
 * BeefySwapper handles all reward→native swaps; you only supply a depositToken.
 *
 * StakeDAO gauges call claim_rewards(address) which distributes CRV + SDT + extras
 * in a single call — no external CRV Minter needed.
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
    want,                // Curve LP token
    staking: sdVault,    // StakeDAO sd-gauge address (maps directly to _sdVault param)
    depositToken,        // single Curve pool token for liquidity add after BeefySwapper
    rewardTokens,        // array of reward token addresses
    harvestOnDeposit,
    vaultName,
    vaultSymbol,
    strategist: strategistParam,
    beefyAddresses,
    dryRun,
  } = params;

  console.log(`\n[stakedao-deploy] mode=${dryRun ? 'DRY-RUN (fork)' : 'LIVE'} network=${network.name} chainId=${chainId}`);
  console.log(`[stakedao-deploy] want=${want} sdVault=${sdVault}`);
  console.log(`[stakedao-deploy] depositToken=${depositToken}`);

  const [deployer] = await ethers.getSigners();
  const strategistAddress = strategistParam || deployer.address;
  console.log(`[stakedao-deploy] deployer=${deployer.address}`);

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
    console.log(`[stakedao-deploy] vault cloned: ${vaultAddress}`);
  } else {
    const VaultFactory = await ethers.getContractFactory('BeefyVaultV7');
    const vault = await VaultFactory.deploy();
    await vault.waitForDeployment();
    vaultAddress = await vault.getAddress();
    console.log(`[stakedao-deploy] vault deployed directly: ${vaultAddress}`);
  }

  // ── 2. Clone strategy via StrategyFactory ─────────────────────────────────
  const strategyFactoryAbi = [
    'function createStrategy(string calldata _strategyName) external returns (address)',
    'event ProxyCreated(address proxy)',
  ];
  const strategyFactory = new ethers.Contract(beefyAddresses.strategyFactory, strategyFactoryAbi, deployer);
  const stratTx = await strategyFactory.createStrategy('StakeDaoV2');
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
  console.log(`[stakedao-deploy] strategy cloned (StakeDaoV2): ${stratAddress}`);

  // ── 3. Initialize vault ───────────────────────────────────────────────────
  const vaultAbi = ['function initialize(address strategy, string name, string symbol, uint256 approvalDelay) external'];
  const vault = new ethers.Contract(vaultAddress, vaultAbi, deployer);
  await (await vault.initialize(stratAddress, vaultName, vaultSymbol, 21600)).wait();
  console.log(`[stakedao-deploy] vault initialized`);

  // ── 4. Initialize strategy ────────────────────────────────────────────────
  // StrategyStakeDaoV2.initialize(
  //   address _sdVault,           — StakeDAO sd-gauge address
  //   bool    _harvestOnDeposit,  — harvest-on-deposit flag
  //   address[] _rewards,         — reward token addresses
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
    'function initialize(address _sdVault, bool _harvestOnDeposit, address[] calldata _rewards, tuple(address want, address depositToken, address factory, address vault, address swapper, address strategist) _addresses) external',
  ];
  const strategy = new ethers.Contract(stratAddress, stratAbi, deployer);
  const txStrat = await strategy.initialize(
    sdVault,
    !!harvestOnDeposit,
    rewardAddresses,
    addresses
  );
  const stratReceipt = await txStrat.wait();
  console.log(`[stakedao-deploy] strategy initialized`);
  const deployBlock = await ethers.provider.getBlock(stratReceipt.blockNumber);
  const blockTimestamp = deployBlock ? deployBlock.timestamp : Math.floor(Date.now() / 1000);
  console.log(`[stakedao-deploy] block ${stratReceipt.blockNumber} timestamp: ${blockTimestamp}`);

  // Note: harvestOnDeposit is passed directly to initialize() above —
  // no separate setHarvestOnDeposit call needed for StakeDaoV2.

  // ── 5. Transfer vault ownership ───────────────────────────────────────────
  // Note: strategy ownership stays with StrategyFactory (not transferred manually)
  const vaultOwner = beefyAddresses.vaultOwner;
  if (vaultOwner && vaultOwner !== ZERO) {
    const vaultForOwner = new ethers.Contract(vaultAddress, ['function transferOwnership(address newOwner) external'], deployer);
    await (await vaultForOwner.transferOwnership(vaultOwner)).wait();
    console.log(`[stakedao-deploy] vault ownership transferred to: ${vaultOwner}`);
  }

  const result = {
    vaultAddress,
    strategyAddress: stratAddress,
    strategyType: 'StakeDaoV2',
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
