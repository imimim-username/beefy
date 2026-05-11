'use strict';
/**
 * deploy_morpho.cjs — deploys BeefyVaultV7 + StrategyMorpho[Merkl]Factory (via StrategyFactory)
 *
 * Wraps a Morpho Blue vault (ERC-4626 compatible). Users deposit the underlying asset;
 * the strategy supplies it to Morpho and holds shares.
 *
 * Strategy names:
 *   No Merkl rewards  → 'Morpho'       (claimer = 0x0)
 *   With Merkl        → 'MorphoMerkl'  (claimer = Merkl distributor address)
 *
 * Initialize signature:
 *   function initialize(
 *     address _morphoVault,       — Morpho Blue vault address (ERC-4626)
 *     address _claimer,           — Merkl distributor (0x0 if no Merkl)
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
    want,                       // underlying asset address (e.g. USDC, WETH)
    staking: morphoVaultAddr,   // Morpho Blue vault address
    merkl: merklClaimer,        // Merkl distributor address (optional)
    harvestOnDeposit,
    rewardTokens,
    vaultName,
    vaultSymbol,
    strategist: strategistParam,
    beefyAddresses,
    dryRun,
  } = params;

  const useMerkl = !!(merklClaimer && merklClaimer !== ZERO);
  const stratName = useMerkl ? 'MorphoMerkl' : 'Morpho';
  const claimerAddr = useMerkl ? merklClaimer : ZERO;

  console.log(`\n[morpho-deploy] mode=${dryRun ? 'DRY-RUN (fork)' : 'LIVE'} network=${network.name} chainId=${chainId}`);
  console.log(`[morpho-deploy] stratName=${stratName} want=${want} morphoVault=${morphoVaultAddr}`);
  console.log(`[morpho-deploy] merklClaimer=${claimerAddr} harvestOnDeposit=${!!harvestOnDeposit}`);

  const [deployer] = await ethers.getSigners();
  const strategistAddress = strategistParam || deployer.address;
  console.log(`[morpho-deploy] deployer=${deployer.address} strategist=${strategistAddress}`);

  if (!beefyAddresses.strategyFactory) throw new Error('strategyFactory not configured for this chain');
  if (!beefyAddresses.beefySwapper)   throw new Error('beefySwapper not configured for this chain');

  // ── 1. Verify Morpho vault underlying matches want ────────────────────────────
  // Morpho Blue vaults are ERC-4626 compatible and expose asset()
  const erc4626Abi = ['function asset() view returns (address)'];
  const morphoVault = new ethers.Contract(ethers.getAddress(morphoVaultAddr), erc4626Abi, deployer);
  const underlying = await morphoVault.asset();
  if (underlying.toLowerCase() !== want.toLowerCase()) {
    throw new Error(`Morpho vault underlying (${underlying}) does not match want (${want})`);
  }
  console.log(`[morpho-deploy] underlying verified: ${underlying}`);

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
    console.log(`[morpho-deploy] vault cloned: ${vaultAddress}`);
  } else {
    const VaultFactory = await ethers.getContractFactory('BeefyVaultV7');
    const vault = await VaultFactory.deploy();
    await vault.waitForDeployment();
    vaultAddress = await vault.getAddress();
    console.log(`[morpho-deploy] vault deployed directly: ${vaultAddress}`);
  }

  // ── 3. Clone strategy via StrategyFactory ─────────────────────────────────────
  const strategyFactoryAbi = [
    'function createStrategy(string calldata _strategyName) external returns (address)',
  ];
  const strategyFactory = new ethers.Contract(beefyAddresses.strategyFactory, strategyFactoryAbi, deployer);
  const stratAddress = await strategyFactory.createStrategy.staticCall(stratName);
  if (!stratAddress || stratAddress === ZERO) throw new Error('staticCall returned zero address for createStrategy');
  console.log(`[morpho-deploy] strategy address (pre-computed): ${stratAddress}`);
  await (await strategyFactory.createStrategy(stratName)).wait();
  console.log(`[morpho-deploy] strategy cloned (${stratName}): ${stratAddress}`);

  // ── 4. Initialize vault ───────────────────────────────────────────────────────
  const vaultAbi = ['function initialize(address strategy, string name, string symbol, uint256 approvalDelay) external'];
  const vault = new ethers.Contract(vaultAddress, vaultAbi, deployer);
  await (await vault.initialize(stratAddress, vaultName, vaultSymbol, 21600)).wait();
  console.log(`[morpho-deploy] vault initialized`);

  // ── 5. Initialize strategy ────────────────────────────────────────────────────
  const addresses = {
    want:         want,
    depositToken: want,   // underlying = depositToken for single-asset
    factory:      beefyAddresses.strategyFactory,
    vault:        vaultAddress,
    swapper:      beefyAddresses.beefySwapper,
    strategist:   strategistAddress,
  };

  const rewardAddresses = (rewardTokens || []).map(t => t.address || t);

  const stratAbi = [
    'function initialize(address _morphoVault, address _claimer, bool _harvestOnDeposit, address[] calldata _rewards, tuple(address want, address depositToken, address factory, address vault, address swapper, address strategist) _addresses) public',
  ];
  const strategy = new ethers.Contract(stratAddress, stratAbi, deployer);
  const txStrat = await strategy.initialize(
    ethers.getAddress(morphoVaultAddr),
    claimerAddr,
    !!harvestOnDeposit,
    rewardAddresses,
    addresses,
  );
  const stratReceipt = await txStrat.wait();
  console.log(`[morpho-deploy] strategy initialized`);
  const deployBlock = await ethers.provider.getBlock(stratReceipt.blockNumber);
  const blockTimestamp = deployBlock ? deployBlock.timestamp : Math.floor(Date.now() / 1000);
  console.log(`[morpho-deploy] block ${stratReceipt.blockNumber} timestamp: ${blockTimestamp}`);

  // ── 6. Transfer vault ownership ───────────────────────────────────────────────
  const vaultOwner = beefyAddresses.vaultOwner;
  if (params.transferVaultOwnership !== false && vaultOwner && vaultOwner !== ZERO) {
    const vaultForOwner = new ethers.Contract(vaultAddress, ['function transferOwnership(address newOwner) external'], deployer);
    await (await vaultForOwner.transferOwnership(vaultOwner)).wait();
    console.log(`[morpho-deploy] vault ownership transferred to: ${vaultOwner}`);
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
