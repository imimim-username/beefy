'use strict';
/**
 * deploy_chef.cjs — deploys BeefyVaultV7 + StrategyCommonChefLP
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
    staking: chefAddress,
    poolId,
    outputToNativeRoute,
    outputToLp0Route,
    outputToLp1Route,
    vaultName,
    vaultSymbol,
    unirouter,
    strategist: strategistParam,
    beefyAddresses,
    dryRun,
  } = params;

  console.log(`\n[chef-deploy] mode=${dryRun ? 'DRY-RUN (fork)' : 'LIVE'} network=${network.name} chainId=${chainId}`);
  console.log(`[chef-deploy] want=${want} chef=${chefAddress} poolId=${poolId}`);

  const [deployer] = await ethers.getSigners();
  const strategistAddress = strategistParam || deployer.address;
  console.log(`[chef-deploy] deployer=${deployer.address}`);
  console.log(`[chef-deploy] strategist=${strategistAddress}`);

  const bal = await ethers.provider.getBalance(deployer.address);
  console.log(`[chef-deploy] balance=${ethers.formatEther(bal)} native`);

  // ── 1. Deploy vault via factory (or directly if factory addr is placeholder) ──
  let vaultAddress;
  const ZERO = '0x0000000000000000000000000000000000000000';

  if (beefyAddresses.vaultFactory && beefyAddresses.vaultFactory !== ZERO) {
    const factoryAbi = [
      'function cloneVault() external returns (address vault)',
      'event ProxyCreated(address proxy)',
    ];
    const factory = new ethers.Contract(beefyAddresses.vaultFactory, factoryAbi, deployer);
    const tx = await factory.cloneVault();
    const receipt = await tx.wait();
    // Find ProxyCreated event
    const iface = new ethers.Interface(factoryAbi);
    for (const log of receipt.logs) {
      try {
        const parsed = iface.parseLog(log);
        if (parsed.name === 'ProxyCreated') {
          vaultAddress = parsed.args.proxy;
          break;
        }
      } catch {}
    }
    if (!vaultAddress) throw new Error('ProxyCreated event not found in factory tx');
    console.log(`[chef-deploy] vault cloned from factory: ${vaultAddress}`);
  } else {
    // Deploy BeefyVaultV7 directly (for chains without a configured factory)
    const VaultFactory = await ethers.getContractFactory('BeefyVaultV7');
    const vault = await VaultFactory.deploy();
    await vault.waitForDeployment();
    vaultAddress = await vault.getAddress();
    console.log(`[chef-deploy] vault deployed directly: ${vaultAddress}`);
  }

  // ── 2. Deploy strategy ────────────────────────────────────────────────────
  const StratFactory = await ethers.getContractFactory('StrategyCommonChefLP');
  const strategy = await StratFactory.deploy();
  await strategy.waitForDeployment();
  const stratAddress = await strategy.getAddress();
  console.log(`[chef-deploy] strategy deployed: ${stratAddress}`);

  // ── 3. Initialize vault ───────────────────────────────────────────────────
  const vaultAbi = [
    'function initialize(address strategy, string name, string symbol, uint256 approvalDelay) external',
  ];
  const vault = new ethers.Contract(vaultAddress, vaultAbi, deployer);
  const approvalDelay = 21600; // 6 hours
  const txVault = await vault.initialize(stratAddress, vaultName, vaultSymbol, approvalDelay);
  await txVault.wait();
  console.log(`[chef-deploy] vault initialized`);

  // ── 4. Initialize strategy ────────────────────────────────────────────────
  const commonAddresses = [
    vaultAddress,
    unirouter || beefyAddresses.unirouter,
    beefyAddresses.keeper,
    strategistAddress, // strategist = user-supplied or deployer
    beefyAddresses.beefyFeeRecipient,
    beefyAddresses.beefyFeeConfig,
  ];

  const txStrat = await strategy.initialize(
    want,
    poolId,
    chefAddress,
    outputToNativeRoute,
    outputToLp0Route,
    outputToLp1Route,
    commonAddresses
  );
  await txStrat.wait();
  console.log(`[chef-deploy] strategy initialized`);

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

  // This line is parsed by deployer.js
  console.log(`DEPLOY_RESULT=${JSON.stringify(result)}`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
