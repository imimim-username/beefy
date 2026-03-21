'use strict';
/**
 * deploy_convex.cjs — deploys BeefyVaultV7 + StrategyCurveConvexLP
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
    curvePool,              // Curve pool contract address
    coinIndex,              // Index of coin to compound into (0, 1, or 2)
    nCoins,                 // 2 or 3
    outputToNativeRoute,    // [CRV, ..., WETH]
    outputToCoinRoute,      // [WETH, ..., coin]
    harvestOnDeposit,
    vaultName,
    vaultSymbol,
    unirouter,
    strategist: strategistParam,
    beefyAddresses,
    dryRun,
  } = params;

  console.log(`\n[convex-deploy] mode=${dryRun ? 'DRY-RUN (fork)' : 'LIVE'} network=${network.name} chainId=${chainId}`);
  console.log(`[convex-deploy] want=${want} booster=${boosterAddr} convexPoolId=${convexPoolId}`);
  console.log(`[convex-deploy] curvePool=${curvePool} coinIndex=${coinIndex} nCoins=${nCoins}`);

  const [deployer] = await ethers.getSigners();
  const strategistAddress = strategistParam || deployer.address;
  console.log(`[convex-deploy] deployer=${deployer.address}`);
  console.log(`[convex-deploy] strategist=${strategistAddress}`);

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

  // ── 2. Deploy strategy ────────────────────────────────────────────────────
  const StratFactory = await ethers.getContractFactory('StrategyCurveConvexLP');
  const strategy = await StratFactory.deploy();
  await strategy.waitForDeployment();
  const stratAddress = await strategy.getAddress();
  console.log(`[convex-deploy] strategy deployed: ${stratAddress}`);

  // ── 3. Initialize vault ───────────────────────────────────────────────────
  const vaultAbi = [
    'function initialize(address strategy, string name, string symbol, uint256 approvalDelay) external',
  ];
  const vault = new ethers.Contract(vaultAddress, vaultAbi, deployer);
  await (await vault.initialize(stratAddress, vaultName, vaultSymbol, 21600)).wait();
  console.log(`[convex-deploy] vault initialized`);

  // ── 4. Initialize strategy ────────────────────────────────────────────────
  const commonAddresses = [
    vaultAddress,
    unirouter || beefyAddresses.unirouter,
    beefyAddresses.keeper,
    strategistAddress,
    beefyAddresses.beefyFeeRecipient,
    beefyAddresses.beefyFeeConfig,
  ];

  const txStrat = await strategy.initialize(
    want,
    boosterAddr,
    Number(convexPoolId),
    curvePool,
    Number(coinIndex),
    Number(nCoins),
    outputToNativeRoute,
    outputToCoinRoute,
    commonAddresses
  );
  await txStrat.wait();
  console.log(`[convex-deploy] strategy initialized`);
  // ── Optional: harvestOnDeposit ───────────────────────────────────────────────
  if (harvestOnDeposit) {
    try {
      const hodAbi = ['function setHarvestOnDeposit(bool _harvestOnDeposit) external'];
      const stratHod = new ethers.Contract(stratAddress, hodAbi, deployer);
      await (await stratHod.setHarvestOnDeposit(true)).wait();
      console.log(`[convex-deploy] harvestOnDeposit set to true`);
    } catch (e) {
      console.warn(`[convex-deploy] setHarvestOnDeposit not supported by this strategy — skipped`);
    }
  }

  // ── 5. Transfer vault ownership to Beefy multisig ─────────────────────────
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
    vaultName,
    vaultSymbol,
    chainId,
    network: network.name,
    deployerAddress: deployer.address,
    dryRun: !!dryRun,
    txHash: txStrat.hash,
  };

  console.log(`DEPLOY_RESULT=${JSON.stringify(result)}`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
