'use strict';
/**
 * deploy_compound.cjs — deploys BeefyVaultV7 + StrategyCompoundV3Factory (via StrategyFactory)
 *
 * Compound V3 (Comet) supply strategy. Users deposit the base token (e.g. USDC);
 * the strategy supplies it to the Compound V3 Comet and claims COMP rewards.
 *
 * Strategy name: 'CompoundV3'
 *
 * Initialize signature:
 *   function initialize(
 *     address _cToken,       — Compound V3 Comet address (e.g. cUSDCv3)
 *     address _distributor,  — Compound V3 rewards distributor address
 *     Addresses memory _addresses  — {want, depositToken, factory, vault, swapper, strategist}
 *   ) external initializer
 *
 * NOTE: CompoundV3 initialize has NO _rewards[] or _harvestOnDeposit parameters.
 *       The rewards token (COMP) is always claimed via the distributor.
 *
 * Reads params from scripts/_deploy_params.json (written by deployer.js).
 * Outputs exactly one line:  DEPLOY_RESULT=<json>
 */

const { ethers, network } = require('hardhat');
const path = require('path');
const fs   = require('fs');

const ZERO = '0x0000000000000000000000000000000000000000';

async function main() {
  const paramsFile = path.join(__dirname, '_deploy_params.json');
  const params = JSON.parse(fs.readFileSync(paramsFile, 'utf8'));

  const {
    chainId,
    want,                         // base token address (e.g. USDC)
    staking: cometAddr,           // Compound V3 Comet address (e.g. cUSDCv3)
    compoundDistributor,          // Compound V3 CometRewards distributor address
    vaultName,
    vaultSymbol,
    strategist: strategistParam,
    beefyAddresses,
    dryRun,
  } = params;

  console.log(`\n[compound-deploy] mode=${dryRun ? 'DRY-RUN (fork)' : 'LIVE'} network=${network.name} chainId=${chainId}`);
  console.log(`[compound-deploy] want=${want} comet=${cometAddr} distributor=${compoundDistributor}`);

  if (!compoundDistributor || compoundDistributor === ZERO) {
    throw new Error('compoundDistributor address is required for CompoundV3 strategy');
  }

  const [deployer] = await ethers.getSigners();
  const strategistAddress = strategistParam || deployer.address;
  console.log(`[compound-deploy] deployer=${deployer.address} strategist=${strategistAddress}`);

  if (!beefyAddresses.strategyFactory) throw new Error('strategyFactory not configured for this chain');
  if (!beefyAddresses.beefySwapper)   throw new Error('beefySwapper not configured for this chain');

  // ── 1. Verify Comet base token matches want ───────────────────────────────────
  // Compound V3 Comet exposes baseToken()
  const cometAbi = ['function baseToken() view returns (address)'];
  const comet = new ethers.Contract(ethers.getAddress(cometAddr), cometAbi, deployer);
  const baseToken = await comet.baseToken();
  if (baseToken.toLowerCase() !== want.toLowerCase()) {
    throw new Error(`Comet baseToken (${baseToken}) does not match want (${want})`);
  }
  console.log(`[compound-deploy] Comet baseToken verified: ${baseToken}`);

  // ── 2. Deploy or clone vault ──────────────────────────────────────────────────
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
    console.log(`[compound-deploy] vault cloned: ${vaultAddress}`);
  } else {
    const VaultFactory = await ethers.getContractFactory('BeefyVaultV7');
    const vault = await VaultFactory.deploy();
    await vault.waitForDeployment();
    vaultAddress = await vault.getAddress();
    console.log(`[compound-deploy] vault deployed directly: ${vaultAddress}`);
  }

  // ── 3. Clone strategy via StrategyFactory ─────────────────────────────────────
  const strategyFactoryAbi = [
    'function createStrategy(string calldata _strategyName) external returns (address)',
  ];
  const strategyFactory = new ethers.Contract(beefyAddresses.strategyFactory, strategyFactoryAbi, deployer);
  const stratAddress = await strategyFactory.createStrategy.staticCall('CompoundV3');
  if (!stratAddress || stratAddress === ZERO) throw new Error('staticCall returned zero address for createStrategy');
  console.log(`[compound-deploy] strategy address (pre-computed): ${stratAddress}`);
  await (await strategyFactory.createStrategy('CompoundV3')).wait();
  console.log(`[compound-deploy] strategy cloned (CompoundV3): ${stratAddress}`);

  // ── 4. Initialize vault ───────────────────────────────────────────────────────
  const vaultAbi = ['function initialize(address strategy, string name, string symbol, uint256 approvalDelay) external'];
  const vault = new ethers.Contract(vaultAddress, vaultAbi, deployer);
  await (await vault.initialize(stratAddress, vaultName, vaultSymbol, 21600)).wait();
  console.log(`[compound-deploy] vault initialized`);

  // ── 5. Initialize strategy ────────────────────────────────────────────────────
  // NOTE: CompoundV3 does NOT take _rewards[] or _harvestOnDeposit in initialize
  const addresses = {
    want:         want,
    depositToken: want,   // base token = depositToken
    factory:      beefyAddresses.strategyFactory,
    vault:        vaultAddress,
    swapper:      beefyAddresses.beefySwapper,
    strategist:   strategistAddress,
  };

  const stratAbi = [
    'function initialize(address _cToken, address _distributor, tuple(address want, address depositToken, address factory, address vault, address swapper, address strategist) _addresses) external',
  ];
  const strategy = new ethers.Contract(stratAddress, stratAbi, deployer);
  const txStrat = await strategy.initialize(
    ethers.getAddress(cometAddr),
    ethers.getAddress(compoundDistributor),
    addresses,
  );
  const stratReceipt = await txStrat.wait();
  console.log(`[compound-deploy] strategy initialized`);
  const deployBlock = await ethers.provider.getBlock(stratReceipt.blockNumber);
  const blockTimestamp = deployBlock ? deployBlock.timestamp : Math.floor(Date.now() / 1000);
  console.log(`[compound-deploy] block ${stratReceipt.blockNumber} timestamp: ${blockTimestamp}`);

  // ── 6. Transfer vault ownership ───────────────────────────────────────────────
  const vaultOwner = beefyAddresses.vaultOwner;
  if (vaultOwner && vaultOwner !== ZERO) {
    const vaultForOwner = new ethers.Contract(vaultAddress, ['function transferOwnership(address newOwner) external'], deployer);
    await (await vaultForOwner.transferOwnership(vaultOwner)).wait();
    console.log(`[compound-deploy] vault ownership transferred to: ${vaultOwner}`);
  }

  const result = {
    vaultAddress,
    strategyAddress: stratAddress,
    strategyType: 'CompoundV3',
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
