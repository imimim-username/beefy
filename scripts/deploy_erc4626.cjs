'use strict';
/**
 * deploy_erc4626.cjs — deploys BeefyVaultV7 + StrategyERC4626[Merkl]Factory (via StrategyFactory)
 *
 * Wraps any ERC-4626-compatible vault (Yearn v3, Spark, Sky Savings Rate, etc.).
 * Users deposit the UNDERLYING asset; the strategy deposits it into the ERC-4626 vault.
 *
 * Strategy names:
 *   No Merkl rewards  → 'ERC4626'       (claimer = 0x0)
 *   With Merkl        → 'ERC4626Merkl'  (claimer = Merkl distributor address)
 *
 * Initialize signature:
 *   function initialize(
 *     address _erc4626,          — the ERC-4626 vault address
 *     address _claimer,          — Merkl distributor (0x0 if no Merkl)
 *     bool    _harvestOnDeposit,
 *     address[] calldata _rewards,
 *     Addresses calldata _addresses  — {want, depositToken, factory, vault, swapper, strategist}
 *   ) public initializer
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
    want,                       // underlying asset address (e.g. USDC)
    staking: erc4626Vault,      // ERC-4626 vault address
    merkl: merklClaimer,        // Merkl distributor address (optional, undefined = no Merkl)
    harvestOnDeposit,
    rewardTokens,
    vaultName,
    vaultSymbol,
    strategist: strategistParam,
    beefyAddresses,
    dryRun,
  } = params;

  // Choose strategy name based on whether Merkl rewards are used
  const useMerkl = !!(merklClaimer && merklClaimer !== ZERO);
  const stratName = useMerkl ? 'ERC4626Merkl' : 'ERC4626';
  const claimerAddr = useMerkl ? merklClaimer : ZERO;

  console.log(`\n[erc4626-deploy] mode=${dryRun ? 'DRY-RUN (fork)' : 'LIVE'} network=${network.name} chainId=${chainId}`);
  console.log(`[erc4626-deploy] stratName=${stratName} want=${want} erc4626Vault=${erc4626Vault}`);
  console.log(`[erc4626-deploy] merklClaimer=${claimerAddr} harvestOnDeposit=${!!harvestOnDeposit}`);

  const [deployer] = await ethers.getSigners();
  const strategistAddress = strategistParam || deployer.address;
  console.log(`[erc4626-deploy] deployer=${deployer.address} strategist=${strategistAddress}`);

  if (!beefyAddresses.strategyFactory) throw new Error('strategyFactory not configured for this chain');
  if (!beefyAddresses.beefySwapper)   throw new Error('beefySwapper not configured for this chain');

  // ── 1. Verify ERC-4626 vault underlying matches want ─────────────────────────
  const erc4626Abi = ['function asset() view returns (address)'];
  const erc4626 = new ethers.Contract(ethers.getAddress(erc4626Vault), erc4626Abi, deployer);
  const underlying = await erc4626.asset();
  if (underlying.toLowerCase() !== want.toLowerCase()) {
    throw new Error(`ERC-4626 vault underlying (${underlying}) does not match want (${want})`);
  }
  console.log(`[erc4626-deploy] underlying verified: ${underlying}`);

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
    console.log(`[erc4626-deploy] vault cloned: ${vaultAddress}`);
  } else {
    const VaultFactory = await ethers.getContractFactory('BeefyVaultV7');
    const vault = await VaultFactory.deploy();
    await vault.waitForDeployment();
    vaultAddress = await vault.getAddress();
    console.log(`[erc4626-deploy] vault deployed directly: ${vaultAddress}`);
  }

  // ── 3. Clone strategy via StrategyFactory ─────────────────────────────────────
  const strategyFactoryAbi = [
    'function createStrategy(string calldata _strategyName) external returns (address)',
  ];
  const strategyFactory = new ethers.Contract(beefyAddresses.strategyFactory, strategyFactoryAbi, deployer);
  const stratAddress = await strategyFactory.createStrategy.staticCall(stratName);
  if (!stratAddress || stratAddress === ZERO) throw new Error('staticCall returned zero address for createStrategy');
  console.log(`[erc4626-deploy] strategy address (pre-computed): ${stratAddress}`);
  await (await strategyFactory.createStrategy(stratName)).wait();
  console.log(`[erc4626-deploy] strategy cloned (${stratName}): ${stratAddress}`);

  // ── 4. Initialize vault ───────────────────────────────────────────────────────
  const vaultAbi = ['function initialize(address strategy, string name, string symbol, uint256 approvalDelay) external'];
  const vault = new ethers.Contract(vaultAddress, vaultAbi, deployer);
  await (await vault.initialize(stratAddress, vaultName, vaultSymbol, 21600)).wait();
  console.log(`[erc4626-deploy] vault initialized`);

  // ── 5. Initialize strategy ────────────────────────────────────────────────────
  // Addresses struct: {want, depositToken, factory, vault, swapper, strategist}
  // For single-asset: depositToken = want (underlying asset)
  const addresses = {
    want:         want,
    depositToken: want,           // underlying = depositToken for single-asset
    factory:      beefyAddresses.strategyFactory,
    vault:        vaultAddress,
    swapper:      beefyAddresses.beefySwapper,
    strategist:   strategistAddress,
  };

  const rewardAddresses = (rewardTokens || []).map(t => t.address || t);

  const stratAbi = [
    'function initialize(address _erc4626, address _claimer, bool _harvestOnDeposit, address[] calldata _rewards, tuple(address want, address depositToken, address factory, address vault, address swapper, address strategist) _addresses) public',
  ];
  const strategy = new ethers.Contract(stratAddress, stratAbi, deployer);
  const txStrat = await strategy.initialize(
    ethers.getAddress(erc4626Vault),
    claimerAddr,
    !!harvestOnDeposit,
    rewardAddresses,
    addresses,
  );
  const stratReceipt = await txStrat.wait();
  console.log(`[erc4626-deploy] strategy initialized`);
  const deployBlock = await ethers.provider.getBlock(stratReceipt.blockNumber);
  const blockTimestamp = deployBlock ? deployBlock.timestamp : Math.floor(Date.now() / 1000);
  console.log(`[erc4626-deploy] block ${stratReceipt.blockNumber} timestamp: ${blockTimestamp}`);

  // ── 6. Transfer vault ownership ───────────────────────────────────────────────
  const vaultOwner = beefyAddresses.vaultOwner;
  if (params.transferVaultOwnership !== false && vaultOwner && vaultOwner !== ZERO) {
    const vaultForOwner = new ethers.Contract(vaultAddress, ['function transferOwnership(address newOwner) external'], deployer);
    await (await vaultForOwner.transferOwnership(vaultOwner)).wait();
    console.log(`[erc4626-deploy] vault ownership transferred to: ${vaultOwner}`);
  }

  const result = {
    vaultAddress,
    strategyAddress: stratAddress,
    strategyType: stratName,
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
