'use strict';
/**
 * deploy_stakedao.cjs — deploys BeefyVaultV7 + StrategyCommonCurveLP
 *                        for a StakeDAO gauge (minterEnabled=false).
 *
 * StakeDAO gauges call claim_rewards(address) which distributes CRV + SDT
 * + extras in a single call — no external CRV Minter is needed.
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
    want,                  // Curve LP token
    staking: gaugeAddr,    // StakeDAO gauge address
    curvePool,             // Curve pool contract (for add_liquidity)
    coinIndex,             // which coin to compound into
    nCoins,                // 2 or 3
    outputToNativeRoute,   // [CRV, ..., WETH]
    outputToCoinRoute,     // [WETH, ..., coin]
    vaultName,
    vaultSymbol,
    unirouter,
    strategist: strategistParam,
    beefyAddresses,
    dryRun,
  } = params;

  console.log(`\n[stakedao-deploy] mode=${dryRun ? 'DRY-RUN (fork)' : 'LIVE'} network=${network.name} chainId=${chainId}`);
  console.log(`[stakedao-deploy] want=${want} gauge=${gaugeAddr} curvePool=${curvePool}`);
  console.log(`[stakedao-deploy] coinIndex=${coinIndex} nCoins=${nCoins}`);

  const [deployer] = await ethers.getSigners();
  const strategistAddress = strategistParam || deployer.address;
  console.log(`[stakedao-deploy] deployer=${deployer.address}`);

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

  // ── 2. Deploy strategy ────────────────────────────────────────────────────
  const StratFactory = await ethers.getContractFactory('StrategyCommonCurveLP');
  const strategy = await StratFactory.deploy();
  await strategy.waitForDeployment();
  const stratAddress = await strategy.getAddress();
  console.log(`[stakedao-deploy] strategy deployed: ${stratAddress}`);

  // ── 3. Initialize vault ───────────────────────────────────────────────────
  const vaultAbi = ['function initialize(address strategy, string name, string symbol, uint256 approvalDelay) external'];
  const vault = new ethers.Contract(vaultAddress, vaultAbi, deployer);
  await (await vault.initialize(stratAddress, vaultName, vaultSymbol, 21600)).wait();
  console.log(`[stakedao-deploy] vault initialized`);

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
    gaugeAddr,
    curvePool,
    Number(coinIndex),
    Number(nCoins),
    false,   // minterEnabled = false — StakeDAO handles CRV distribution internally
    ZERO,    // minter not needed
    outputToNativeRoute,
    outputToCoinRoute,
    commonAddresses
  );
  await txStrat.wait();
  console.log(`[stakedao-deploy] strategy initialized`);

  // ── 5. Transfer vault ownership ───────────────────────────────────────────
  const vaultOwner = beefyAddresses.vaultOwner;
  if (vaultOwner && vaultOwner !== ZERO) {
    const vaultForOwner = new ethers.Contract(vaultAddress, ['function transferOwnership(address newOwner) external'], deployer);
    await (await vaultForOwner.transferOwnership(vaultOwner)).wait();
    console.log(`[stakedao-deploy] vault ownership transferred to: ${vaultOwner}`);
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

main().catch(e => { console.error(e); process.exit(1); });
