'use strict';
/**
 * deploy_pendle.cjs — deploys BeefyVaultV7 + StrategyPendle (via StrategyFactory)
 *
 * StrategyPendle is the simplest factory strategy: it holds the want token
 * (a Pendle PT, SY, or LP token) and harvests any configured reward tokens via
 * BeefySwapper. No protocol-specific staking contract is required.
 *
 * initialize signature:
 *   function initialize(
 *     bool _harvestOnDeposit,
 *     address[] calldata _rewards,
 *     Addresses calldata _addresses   -- { want, depositToken, factory, vault, swapper, strategist }
 *   ) public initializer
 *
 * Reads params from scripts/_deploy_params.json (written by deployer.js).
 * Outputs exactly one line:  DEPLOY_RESULT=<json>
 */

const { ethers, network } = require('hardhat');
const path = require('path');
const fs   = require('fs');

const STRATEGY_NAME = 'Pendle';
const ZERO          = '0x0000000000000000000000000000000000000000';

async function main() {
  const paramsFile = path.join(__dirname, '_deploy_params.json');
  const params = JSON.parse(fs.readFileSync(paramsFile, 'utf8'));

  const {
    chainId,
    want,           // Pendle PT / SY / LP token address
    depositToken,   // single entry token (= want for single-asset vaults)
    rewardTokens,   // [{ address, symbol }, ...] — typically PENDLE + protocol tokens
    harvestOnDeposit,
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

  const rewardAddresses = (rewardTokens || []).map(t => typeof t === 'string' ? t : t.address);

  console.log(`\n[pendle-deploy] mode=${dryRun ? 'DRY-RUN (fork)' : 'LIVE'} network=${network.name} chainId=${chainId}`);
  console.log(`[pendle-deploy] strategy: ${STRATEGY_NAME}`);
  console.log(`[pendle-deploy] want=${want}`);
  console.log(`[pendle-deploy] depositToken=${depositToken || want}`);
  console.log(`[pendle-deploy] harvestOnDeposit=${!!harvestOnDeposit}`);
  console.log(`[pendle-deploy] rewards=${JSON.stringify(rewardAddresses)}`);

  const [deployer] = await ethers.getSigners();
  const strategistAddress = strategistParam || deployer.address;
  console.log(`[pendle-deploy] deployer=${deployer.address}`);
  console.log(`[pendle-deploy] strategist=${strategistAddress}`);

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
  console.log(`[pendle-deploy] vault cloned: ${vaultAddress}`);

  // ── 2. Create strategy via StrategyFactory ────────────────────────────────────
  const stratFactoryAbi = [
    'function createStrategy(string calldata _strategyName) external returns (address)',
  ];
  const stratFactoryContract = new ethers.Contract(stratFactory, stratFactoryAbi, deployer);
  const stratAddress = await stratFactoryContract.createStrategy.staticCall(STRATEGY_NAME);
  if (!stratAddress || stratAddress === ZERO) throw new Error('staticCall returned zero address for createStrategy');
  console.log(`[pendle-deploy] strategy address (pre-computed): ${stratAddress}`);
  await (await stratFactoryContract.createStrategy(STRATEGY_NAME)).wait();
  console.log(`[pendle-deploy] strategy cloned (${STRATEGY_NAME}): ${stratAddress}`);

  // ── 3. Initialize vault ───────────────────────────────────────────────────────
  const vaultAbi = [
    'function initialize(address strategy, string name, string symbol, uint256 approvalDelay) external',
    'function transferOwnership(address newOwner) external',
  ];
  const vault = new ethers.Contract(vaultAddress, vaultAbi, deployer);
  await (await vault.initialize(stratAddress, vaultName, vaultSymbol, 21600)).wait();
  console.log(`[pendle-deploy] vault initialized`);

  // ── 4. Initialize strategy ────────────────────────────────────────────────────
  // StrategyPendle.initialize(
  //   bool _harvestOnDeposit,
  //   address[] _rewards,
  //   Addresses { want, depositToken, factory, vault, swapper, strategist }
  // )
  const addresses = {
    want:         want,
    depositToken: depositToken || want,
    factory:      stratFactory,
    vault:        vaultAddress,
    swapper:      beefySwapper,
    strategist:   strategistAddress,
  };

  const stratAbi = [
    'function initialize(bool _harvestOnDeposit, address[] calldata _rewards, tuple(address want, address depositToken, address factory, address vault, address swapper, address strategist) calldata _addresses) external',
  ];
  const strategy = new ethers.Contract(stratAddress, stratAbi, deployer);
  const initTx = await strategy.initialize(
    !!harvestOnDeposit,
    rewardAddresses,
    addresses
  );
  const initReceipt = await initTx.wait();
  console.log(`[pendle-deploy] strategy initialized`);

  const deployBlock = await ethers.provider.getBlock(initReceipt.blockNumber);
  const blockTimestamp = deployBlock ? deployBlock.timestamp : Math.floor(Date.now() / 1000);
  console.log(`[pendle-deploy] block ${initReceipt.blockNumber} timestamp: ${blockTimestamp}`);

  // ── 5. Transfer vault ownership to Beefy multisig ────────────────────────────
  const vaultOwner = beefyAddresses.vaultOwner;
  if (params.transferVaultOwnership !== false && vaultOwner && vaultOwner !== ZERO) {
    await (await vault.transferOwnership(vaultOwner)).wait();
    console.log(`[pendle-deploy] vault ownership → ${vaultOwner}`);
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
  };

  console.log(`DEPLOY_RESULT=${JSON.stringify(result)}`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
