'use strict';
/**
 * test_aura_init.cjs  — integration smoke test for StrategyAuraLP on a mainnet fork.
 * Run:  FORK_URL=<eth-rpc> npx hardhat run scripts/test_aura_init.cjs --network hardhat
 */

const { ethers } = require('hardhat');

const WANT         = '0x1535D7CA00323Aa32BD62AEDdf7ca651e4b95966'; // 80ALCX-20WETH v3 BPT
const BOOSTER      = '0xA57b8d98dAE62B26Ec3bcC4a365338157060B234'; // Aura Booster (mainnet)
const GAUGE        = '0x39b2b74b817f0A10a5fA67a3EDCf5705A750c43C'; // known rewardPool
const BAL          = '0xba100000625a3754423978a60c9317c58a424e3D';
const WETH         = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const V3_ROUTER    = '0x5C6fb490BDFD3246EB0bB062c168DeCAF4bD9FDd';
const UNIROUTER    = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D';
const FEE_CONFIG   = '0x3d38BA27974410679afF73abD096D7Ba58870EAd';

const BOOSTER_ABI = [
  'function poolLength() view returns (uint256)',
  'function poolInfo(uint256) view returns (address lptoken, address token, address gauge, address crvRewards, address stash, bool shutdown)',
];

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`\n[test] deployer: ${deployer.address}`);

  // ── Step 1: find the correct Aura pool ID by scanning the booster ────────────
  console.log('\n[1] Scanning Aura Booster to find pool ID for the BPT…');
  const booster = new ethers.Contract(BOOSTER, BOOSTER_ABI, deployer);
  const poolLength = await booster.poolLength();
  console.log(`    Total Aura pools: ${poolLength}`);

  let auraPoolId = null;
  // Scan last 50 pools (BPT is recent)
  const start = Number(poolLength) > 50 ? Number(poolLength) - 50 : 0;
  for (let i = Number(poolLength) - 1; i >= start; i--) {
    const info = await booster.poolInfo(i);
    if (info.lptoken.toLowerCase() === WANT.toLowerCase()) {
      auraPoolId = i;
      console.log(`    Found: pool ${i}  lptoken=${info.lptoken}  crvRewards=${info.crvRewards}`);
      // Confirm against known gauge
      if (info.crvRewards.toLowerCase() !== GAUGE.toLowerCase()) {
        console.log(`    WARNING: expected crvRewards=${GAUGE}, got ${info.crvRewards}`);
      }
      break;
    }
  }
  if (auraPoolId === null) {
    throw new Error(`Could not find Aura pool for BPT ${WANT} in last 50 pools`);
  }
  console.log(`    Using auraPoolId = ${auraPoolId}`);

  // ── Step 2: check the feeConfig contract ─────────────────────────────────────
  console.log('\n[2] Checking beefyFeeConfig…');
  const code = await ethers.provider.getCode(FEE_CONFIG);
  console.log(`    ${FEE_CONFIG} codeSize=${(code.length - 2) / 2} bytes  (0 = missing on this fork)`);

  // ── Step 3: deploy vault + strategy ──────────────────────────────────────────
  console.log('\n[3] Deploying vault and strategy…');
  const VaultFactory = await ethers.getContractFactory('BeefyVaultV7');
  const vault = await VaultFactory.deploy();
  await vault.waitForDeployment();
  const vaultAddr = await vault.getAddress();

  const StratFactory = await ethers.getContractFactory('StrategyAuraLP');
  const strat = await StratFactory.deploy();
  await strat.waitForDeployment();
  const stratAddr = await strat.getAddress();
  console.log(`    vault=${vaultAddr}\n    strategy=${stratAddr}`);

  const vaultAbi = ['function initialize(address,string,string,uint256) external'];
  await (await new ethers.Contract(vaultAddr, vaultAbi, deployer).initialize(
    stratAddr, 'Test Vault', 'tVault', 21600
  )).wait();
  console.log(`    vault initialized`);

  // ── Step 4: initialize strategy ──────────────────────────────────────────────
  console.log('\n[4] Calling strategy.initialize()…');
  const commonAddresses = [
    vaultAddr,
    UNIROUTER,
    deployer.address, // keeper
    deployer.address, // strategist
    deployer.address, // feeRecipient
    FEE_CONFIG,
  ];

  const tx = await strat.initialize(
    WANT,
    BOOSTER,
    auraPoolId,
    [BAL, WETH],
    V3_ROUTER,
    commonAddresses
  );
  await tx.wait();
  console.log(`    strategy.initialize() succeeded ✓`);

  // ── Step 5: verify stored state ───────────────────────────────────────────────
  console.log('\n[5] Verifying stored state…');
  const balancerVersion = await strat.balancerVersion();
  const auraAddr        = await strat.aura();
  const rewardPool      = await strat.rewardPool();
  const balancerV3Vault = await strat.balancerV3Vault();

  console.log(`    balancerVersion : ${balancerVersion}     (expected 3)`);
  console.log(`    rewardPool      : ${rewardPool}`);
  console.log(`    balancerV3Vault : ${balancerV3Vault}`);
  console.log(`    aura            : ${auraAddr}  (expected ${ethers.ZeroAddress} — STASH silenced)`);

  if (balancerVersion !== 3n)            throw new Error(`Expected balancerVersion=3, got ${balancerVersion}`);
  if (rewardPool.toLowerCase() !== GAUGE.toLowerCase()) throw new Error(`Expected rewardPool=${GAUGE}`);
  if (auraAddr !== ethers.ZeroAddress)   console.log(`    NOTE: aura kept (not a stash): ${auraAddr}`);
  else                                   console.log(`    STASH-AURA correctly nulled out ✓`);

  console.log('\n✓  ALL CHECKS PASSED\n');
}

main().catch(e => { console.error('\n✗  TEST FAILED:', e.message || e); process.exit(1); });
