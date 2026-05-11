'use strict';
/**
 * deploy_tokemak.cjs — deploys BeefyVaultV7 + StrategyTokemak (via StrategyFactory)
 *
 * StrategyTokemak auto-derives both `want` (the staking token) and `depositToken`
 * (the vault's underlying asset) from the rewarder contract on-chain. The Addresses
 * struct's want/depositToken fields are overwritten by the strategy during initialize().
 *
 * initialize signature:
 *   function initialize(
 *     address _rewarder,
 *     Addresses memory _commonAddresses   // NOTE: memory, not calldata — mutated on-chain
 *   ) external initializer
 *
 * The strategy internally does:
 *   _commonAddresses.want         = rewarder.stakingToken();
 *   _commonAddresses.depositToken = ITokemakVault(stakingToken).asset();
 *   rewardTokens[0]               = rewarder.rewardToken();
 *
 * Reads params from scripts/_deploy_params.json (written by deployer.js).
 * Outputs exactly one line:  DEPLOY_RESULT=<json>
 */

const { ethers, network } = require('hardhat');
const path = require('path');
const fs   = require('fs');

const STRATEGY_NAME = 'Tokemak';
const ZERO          = '0x0000000000000000000000000000000000000000';

async function main() {
  const paramsFile = path.join(__dirname, '_deploy_params.json');
  const params = JSON.parse(fs.readFileSync(paramsFile, 'utf8'));

  const {
    chainId,
    staking: rewarderAddress,  // Tokemak rewarder contract address
    vaultName,
    vaultSymbol,
    strategist: strategistParam,
    beefyAddresses,
    dryRun,
  } = params;

  const stratFactory = beefyAddresses?.strategyFactory;
  const beefySwapper = beefyAddresses?.beefySwapper;
  if (!stratFactory || stratFactory === ZERO) {
    throw new Error('beefyAddresses.strategyFactory is missing — add it to chains.js for this chain');
  }
  if (!beefySwapper || beefySwapper === ZERO) {
    throw new Error('beefyAddresses.beefySwapper is missing — add it to chains.js for this chain');
  }
  if (!rewarderAddress || rewarderAddress === ZERO) {
    throw new Error('staking (rewarder address) is required for Tokemak strategy');
  }

  console.log(`\n[tokemak-deploy] mode=${dryRun ? 'DRY-RUN (fork)' : 'LIVE'} network=${network.name} chainId=${chainId}`);
  console.log(`[tokemak-deploy] strategy: ${STRATEGY_NAME}`);
  console.log(`[tokemak-deploy] rewarder=${rewarderAddress}`);
  console.log(`[tokemak-deploy] NOTE: want & depositToken are auto-derived from rewarder on-chain`);

  const [deployer] = await ethers.getSigners();
  const strategistAddress = strategistParam || deployer.address;
  console.log(`[tokemak-deploy] deployer=${deployer.address}`);
  console.log(`[tokemak-deploy] strategist=${strategistAddress}`);

  // ── Pre-flight: confirm rewarder exposes expected interface ───────────────────
  const rewarderAbi = [
    'function stakingToken() view returns (address)',
    'function rewardToken() view returns (address)',
  ];
  const rewarder = new ethers.Contract(rewarderAddress, rewarderAbi, deployer);
  const [stakingToken, rewardToken] = await Promise.all([
    rewarder.stakingToken(),
    rewarder.rewardToken(),
  ]);
  console.log(`[tokemak-deploy] auto-derived want (stakingToken): ${stakingToken}`);
  console.log(`[tokemak-deploy] auto-derived rewardToken: ${rewardToken}`);

  // Try to resolve the underlying asset (depositToken)
  let underlying = ZERO;
  try {
    const vaultAbi = ['function asset() view returns (address)'];
    const tokemakVault = new ethers.Contract(stakingToken, vaultAbi, deployer);
    underlying = await tokemakVault.asset();
    console.log(`[tokemak-deploy] auto-derived depositToken (vault.asset()): ${underlying}`);
  } catch {
    console.warn(`[tokemak-deploy] could not read stakingToken.asset() — depositToken will be set to ${ZERO} for strategy to resolve`);
  }

  // ── 1. Clone vault from Beefy VaultFactory ───────────────────────────────────
  const vaultFactoryAddr = beefyAddresses?.vaultFactory;
  if (!vaultFactoryAddr || vaultFactoryAddr === ZERO) {
    throw new Error('beefyAddresses.vaultFactory is missing');
  }
  const vaultFactoryAbi = [
    'function cloneVault() external returns (address vault)',
    'event ProxyCreated(address proxy)',
  ];
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
  console.log(`[tokemak-deploy] vault cloned: ${vaultAddress}`);

  // ── 2. Create strategy via StrategyFactory ────────────────────────────────────
  const stratFactoryAbi = [
    'function createStrategy(string calldata _strategyName) external returns (address)',
  ];
  const stratFactoryContract = new ethers.Contract(stratFactory, stratFactoryAbi, deployer);
  const stratAddress = await stratFactoryContract.createStrategy.staticCall(STRATEGY_NAME);
  if (!stratAddress || stratAddress === ZERO) throw new Error('staticCall returned zero address for createStrategy');
  console.log(`[tokemak-deploy] strategy address (pre-computed): ${stratAddress}`);
  await (await stratFactoryContract.createStrategy(STRATEGY_NAME)).wait();
  console.log(`[tokemak-deploy] strategy cloned (${STRATEGY_NAME}): ${stratAddress}`);

  // ── 3. Initialize vault ───────────────────────────────────────────────────────
  // Note: vault.initialize() is called before strategy.initialize() — the vault
  // reads strategy.want() lazily on first deposit, so it's fine that want is set
  // by the strategy during its own initialization.
  const vaultAbi = [
    'function initialize(address strategy, string name, string symbol, uint256 approvalDelay) external',
    'function transferOwnership(address newOwner) external',
  ];
  const vault = new ethers.Contract(vaultAddress, vaultAbi, deployer);
  await (await vault.initialize(stratAddress, vaultName, vaultSymbol, 21600)).wait();
  console.log(`[tokemak-deploy] vault initialized`);

  // ── 4. Initialize strategy ────────────────────────────────────────────────────
  // StrategyTokemak.initialize(
  //   address _rewarder,
  //   Addresses memory _commonAddresses   -- want & depositToken are overwritten on-chain
  // )
  // We pass ZERO for want/depositToken — the strategy overwrites them from the rewarder.
  const addresses = {
    want:         ZERO,          // overridden by rewarder.stakingToken()
    depositToken: ZERO,          // overridden by ITokemakVault(want).asset()
    factory:      stratFactory,
    vault:        vaultAddress,
    swapper:      beefySwapper,
    strategist:   strategistAddress,
  };

  const stratAbi = [
    'function initialize(address _rewarder, tuple(address want, address depositToken, address factory, address vault, address swapper, address strategist) memory _commonAddresses) external',
  ];
  const strategy = new ethers.Contract(stratAddress, stratAbi, deployer);
  const initTx = await strategy.initialize(rewarderAddress, addresses);
  const initReceipt = await initTx.wait();
  console.log(`[tokemak-deploy] strategy initialized`);
  console.log(`[tokemak-deploy] strategy.want() now auto-set to: ${stakingToken}`);

  const deployBlock = await ethers.provider.getBlock(initReceipt.blockNumber);
  const blockTimestamp = deployBlock ? deployBlock.timestamp : Math.floor(Date.now() / 1000);
  console.log(`[tokemak-deploy] block ${initReceipt.blockNumber} timestamp: ${blockTimestamp}`);

  // ── 5. Transfer vault ownership to Beefy multisig ────────────────────────────
  const vaultOwner = beefyAddresses.vaultOwner;
  if (params.transferVaultOwnership !== false && vaultOwner && vaultOwner !== ZERO) {
    await (await vault.transferOwnership(vaultOwner)).wait();
    console.log(`[tokemak-deploy] vault ownership → ${vaultOwner}`);
  }

  const result = {
    vaultAddress,
    strategyAddress: stratAddress,
    strategyType: STRATEGY_NAME,
    vaultName,
    vaultSymbol,
    chainId,
    network: network.name,
    deployerAddress: deployer.address,
    dryRun: !!dryRun,
    txHash: initTx.hash,
    blockTimestamp,
    // Report auto-derived addresses for reference
    autoWant:         stakingToken,
    autoDepositToken: underlying,
    autoRewardToken:  rewardToken,
  };

  console.log(`DEPLOY_RESULT=${JSON.stringify(result)}`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
