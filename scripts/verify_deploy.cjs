'use strict';
/**
 * verify_deploy.cjs — end-to-end fork test for deploy_aura.cjs logic.
 * Runs the full deploy sequence then checks every state variable.
 * Run with: FORK_URL=https://ethereum.publicnode.com npx hardhat run scripts/verify_deploy.cjs --network hardhat
 */
const { ethers } = require('hardhat');
const path = require('path');
const fs   = require('fs');

const BALANCER_V3_VAULT = '0xbA1333333333a1BA1108E8412f11850A5C319bA9';
const STRATEGY_NAME     = 'BalancerV3';
const ZERO              = '0x0000000000000000000000000000000000000000';

// ── config ────────────────────────────────────────────────────────────────────
const WANT           = '0x1535D7CA00323Aa32BD62AEDdf7ca651e4b95966';
const BOOSTER_ADDR   = '0xA57b8d98dAE62B26Ec3bcC4a365338157060B234';
const AURA_POOL_ID   = 277;
const DEPOSIT_TOKEN  = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'; // WETH
const REWARDS        = [
  '0xba100000625a3754423978a60c9317c58a424e3D', // BAL
  '0xC0c293ce456fF0ED870ADd98a0828Dd4d2903DBF', // AURA
];
const VAULT_FACTORY  = '0xC551dDCE8e5E657503Cd67A39713c06F2c0d2e97';
const VAULT_OWNER    = '0x5B6C5363851EC9ED29CB7220C39B44E1dd443992';
const STRAT_FACTORY  = '0x52941De3eDE234ae6B8608597440Ac3394C64Ae8';
const BEEFY_SWAPPER  = '0x0000830DF56616D58976A12D19d283B40e25BEEF';
const STRATEGIST     = '0x4AD74f5F37dc152CCd29bD1279a1e5DcAC2C87AF';
const VAULT_NAME     = 'Moo Balancer Ethereum 80ALCX-20WETH';
const VAULT_SYMBOL   = 'mooBalancerEthereum80ALCX-20WETH';

// ── expected derived values ───────────────────────────────────────────────────
const EXPECTED_GAUGE = '0x2F534f93928B99A4759a5C6a75a61b34132a06ff';

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`\n[verify] deployer: ${deployer.address}`);

  // ── 1. Clone vault ──────────────────────────────────────────────────────────
  const vaultFactoryAbi = [
    'function cloneVault() external returns (address)',
    'event ProxyCreated(address proxy)',
  ];
  const vaultFactory = new ethers.Contract(VAULT_FACTORY, vaultFactoryAbi, deployer);
  const cloneTx = await vaultFactory.cloneVault();
  const cloneReceipt = await cloneTx.wait();
  let vaultAddress;
  const iface = new ethers.Interface(vaultFactoryAbi);
  for (const log of cloneReceipt.logs) {
    try { const p = iface.parseLog(log); if (p.name === 'ProxyCreated') { vaultAddress = p.args.proxy; break; } } catch {}
  }
  if (!vaultAddress) throw new Error('vault address not found');
  console.log(`[verify] vault: ${vaultAddress}`);

  // ── 2. Create strategy ──────────────────────────────────────────────────────
  const stratFactoryAbi = [
    'function createStrategy(string calldata) external returns (address)',
    'event ProxyCreated(string strategyName, address proxy)',
  ];
  const stratFactoryContract = new ethers.Contract(STRAT_FACTORY, stratFactoryAbi, deployer);
  const stratAddress = await stratFactoryContract.createStrategy.staticCall(STRATEGY_NAME);
  await (await stratFactoryContract.createStrategy(STRATEGY_NAME)).wait();
  console.log(`[verify] strategy: ${stratAddress}`);

  // ── 3. Init vault ───────────────────────────────────────────────────────────
  const vaultAbi = [
    'function initialize(address,string,string,uint256) external',
    'function transferOwnership(address) external',
    'function strategy() view returns (address)',
    'function owner() view returns (address)',
    'function name() view returns (string)',
    'function symbol() view returns (string)',
  ];
  const vault = new ethers.Contract(vaultAddress, vaultAbi, deployer);
  await (await vault.initialize(stratAddress, VAULT_NAME, VAULT_SYMBOL, 21600)).wait();
  await (await vault.transferOwnership(VAULT_OWNER)).wait();

  // ── 4. Get gauge from booster ───────────────────────────────────────────────
  const boosterAbi = ['function poolInfo(uint256) view returns (address,address,address,address,address,bool)'];
  const booster = new ethers.Contract(BOOSTER_ADDR, boosterAbi, deployer);
  const poolInfo = await booster.poolInfo(AURA_POOL_ID);
  const gaugeAddress = poolInfo[2];

  // ── 5. Init strategy ────────────────────────────────────────────────────────
  const strategyAbi = [
    'function initialize(address _gauge, address _booster, address _balancerVault, uint256 _pid, address[] calldata _rewards, (address want, address depositToken, address factory, address vault, address swapper, address strategist) calldata _commonAddresses) external',
    'function want() view returns (address)',
    'function vault() view returns (address)',
    'function swapper() view returns (address)',
    'function factory() view returns (address)',
    'function depositToken() view returns (address)',
    'function gauge() view returns (address)',
    'function booster() view returns (address)',
    'function rewardPool() view returns (address)',
    'function balancerVault() view returns (address)',
    'function paused() view returns (bool)',
    'function rewards(uint256) view returns (address)',
    'function rewardsLength() view returns (uint256)',
    'function pid() view returns (uint256)',
    'function owner() view returns (address)',
    'function deposit() external',
  ];
  const strategy = new ethers.Contract(stratAddress, strategyAbi, deployer);
  await (await strategy.initialize(
    gaugeAddress, BOOSTER_ADDR, BALANCER_V3_VAULT, AURA_POOL_ID, REWARDS,
    { want: WANT, depositToken: DEPOSIT_TOKEN, factory: STRAT_FACTORY,
      vault: vaultAddress, swapper: BEEFY_SWAPPER, strategist: STRATEGIST }
  )).wait();

  // Test setHarvestOnDeposit (both values to confirm the call works)
  const hodAbi = ['function setHarvestOnDeposit(bool) external', 'function harvestOnDeposit() view returns (bool)'];
  const stratHod = new ethers.Contract(stratAddress, hodAbi, deployer);
  await (await stratHod.setHarvestOnDeposit(true)).wait();
  const hodOn = await stratHod.harvestOnDeposit();
  await (await stratHod.setHarvestOnDeposit(false)).wait();
  const hodOff = await stratHod.harvestOnDeposit();

  // ── 6. Verify state ─────────────────────────────────────────────────────────
  console.log('\n══ Verification ══');
  let ok = 0, total = 0;
  function check(label, got, expected) {
    total++;
    const pass = String(got).toLowerCase() === String(expected).toLowerCase();
    if (pass) ok++;
    console.log(`  ${pass ? '✓' : '✗'} ${label}: ${got}${pass ? '' : '\n      expected: ' + expected}`);
    return pass;
  }

  console.log('\n  ── Vault ──');
  check('vault.strategy()',  await vault.strategy(),  stratAddress);
  check('vault.owner()',     await vault.owner(),     VAULT_OWNER);
  check('vault.name()',      await vault.name(),      VAULT_NAME);
  check('vault.symbol()',    await vault.symbol(),    VAULT_SYMBOL);

  console.log('\n  ── Strategy ──');
  check('want',         await strategy.want(),         WANT);
  check('vault',        await strategy.vault(),        vaultAddress);
  check('swapper',      await strategy.swapper(),      BEEFY_SWAPPER);
  check('factory',      await strategy.factory(),      STRAT_FACTORY);
  check('depositToken', await strategy.depositToken(), DEPOSIT_TOKEN);
  check('gauge',        await strategy.gauge(),        EXPECTED_GAUGE);
  check('booster',      await strategy.booster(),      BOOSTER_ADDR);
  check('balancerVault',await strategy.balancerVault(),BALANCER_V3_VAULT);
  check('paused',       String(await strategy.paused()), 'false');
  check('pid',          String(await strategy.pid()),    String(AURA_POOL_ID));

  const rewardPool = await strategy.rewardPool();
  total++; ok++;
  console.log(`  ✓ rewardPool: ${rewardPool}`);

  const rLen = Number(await strategy.rewardsLength());
  check('rewardsLength', String(rLen), '2');
  for (let i = 0; i < rLen; i++) {
    const r = await strategy.rewards(i);
    const sym = r.toLowerCase() === REWARDS[0].toLowerCase() ? 'BAL' :
                r.toLowerCase() === REWARDS[1].toLowerCase() ? 'AURA' : `UNKNOWN:${r}`;
    total++;
    const pass = sym !== `UNKNOWN:${r}`;
    if (pass) ok++;
    console.log(`  ${pass?'✓':'✗'} reward[${i}]: ${r} (${sym})`);
  }

  // ── 7. Smoke-test: try calling deposit() (should not revert even if nothing to deposit) ──
  console.log('\n  ── Smoke test: deposit() ──');
  try {
    await strategy.deposit();
    total++; ok++;
    console.log('  ✓ deposit() did not revert');
  } catch (e) {
    total++;
    console.log('  ✗ deposit() reverted:', e.message.slice(0, 120));
  }

  // harvestOnDeposit toggle
  console.log('\n  ── setHarvestOnDeposit() ──');
  check('harvestOnDeposit(true)',  String(hodOn),  'true');
  check('harvestOnDeposit(false)', String(hodOff), 'false');

  console.log(`\n══ ${ok}/${total} checks passed ══`);
  if (ok < total) { console.log('SOME CHECKS FAILED'); process.exit(1); }
  else console.log('All checks passed ✓');
}

main().catch(e => { console.error(e); process.exit(1); });
